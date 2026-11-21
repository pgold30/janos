/**
 * Copyright 2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  auditFiles,
  auditContent,
  formatReport,
  formatGitHubAnnotations,
} = require('./audit');

describe('Pluto-style Audit module', () => {
  it('detects the removed policy/v1beta1 PodSecurityPolicy API', () => {
    const result = auditContent('apiVersion: policy/v1beta1\nkind: PodSecurityPolicy\nmetadata:\n  name: old\n');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].status, 'REMOVED');
    assert.match(result.items[0].targetApi, /manual/);
  });
  it('should reject malformed YAML rather than report a clean audit', () => {
    assert.throws(() => auditContent('metadata: [broken\n', 'bad.yaml'), /YAML|flow|end/i);
  });
  it('should scan files and identify deprecated APIs', () => {
    const tmpFile = path.join(os.tmpdir(), `audit-test-${Date.now()}.yaml`);
    fs.writeFileSync(
      tmpFile,
      `apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: nightly-task
---
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: web-ingress
`,
    );

    const report = auditFiles([tmpFile]);
    assert.equal(report.filesScanned, 1);
    assert.equal(report.deprecatedCount, 2);

    assert.equal(report.items[0].kind, 'CronJob');
    assert.equal(report.items[0].currentApi, 'batch/v1beta1');
    assert.equal(report.items[0].targetApi, 'batch/v1');
    assert.equal(report.items[0].removedIn, 'v1.25');

    assert.equal(report.items[1].kind, 'Ingress');
    assert.equal(report.items[1].currentApi, 'extensions/v1beta1');
    assert.equal(report.items[1].targetApi, 'networking.k8s.io/v1');
    assert.equal(report.items[1].removedIn, 'v1.22');

    fs.unlinkSync(tmpFile);
  });

  it('should format report as Markdown table', () => {
    const fakeReport = {
      filesScanned: 1,
      deprecatedCount: 1,
      items: [
        {
          kind: 'CronJob',
          name: 'cleaner',
          namespace: 'default',
          currentApi: 'batch/v1beta1',
          targetApi: 'batch/v1',
          removedIn: 'v1.25',
          file: 'k8s/cron.yaml',
        },
      ],
    };

    const md = formatReport(fakeReport, 'markdown');
    assert.match(md, /### 🛡️ Janos Kubernetes Deprecation Report/);
    assert.match(md, /\| CronJob \| `cleaner` \| `default` \| `batch\/v1beta1` \| \*\*`batch\/v1`\*\* \| \*\*v1\.25\*\* \|/);
  });

  it('should format report as JSON', () => {
    const fakeReport = { filesScanned: 2, deprecatedCount: 0, items: [] };
    const jsonStr = formatReport(fakeReport, 'json');
    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.filesScanned, 2);
    assert.equal(parsed.deprecatedCount, 0);
  });

  it('should format report as ASCII table', () => {
    const fakeReport = {
      filesScanned: 1,
      deprecatedCount: 1,
      items: [
        {
          kind: 'Deployment',
          name: 'my-app',
          namespace: 'default',
          currentApi: 'apps/v1beta1',
          targetApi: 'apps/v1',
          removedIn: 'v1.16',
          file: 'dep.yaml',
        },
      ],
    };

    const table = formatReport(fakeReport, 'table');
    assert.match(table, /┌.*┬.*┐/);
    assert.match(table, /Deployment/);
    assert.match(table, /apps\/v1beta1/);
  });

  it('should audit raw YAML content directly via auditContent', () => {
    const { auditContent } = require('./audit');
    const raw = `
apiVersion: policy/v1beta1
kind: PodDisruptionBudget
metadata:
  name: api-pdb
spec:
  minAvailable: 1
`;
    const res = auditContent(raw, 'sample.yaml');
    assert.equal(res.documentsScanned, 1);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].kind, 'PodDisruptionBudget');
    assert.equal(res.items[0].currentApi, 'policy/v1beta1');
    assert.equal(res.items[0].targetApi, 'policy/v1');
    assert.equal(res.items[0].removedIn, 'v1.25');
  });

  it('should format report as GitHub Actions annotations', () => {
    const { formatGitHubAnnotations } = require('./audit');
    const fakeReport = {
      filesScanned: 1,
      deprecatedCount: 1,
      items: [
        {
          kind: 'Deployment',
          name: 'frontend',
          namespace: 'default',
          currentApi: 'extensions/v1beta1',
          targetApi: 'apps/v1',
          removedIn: 'v1.16',
          file: 'deploy.yaml',
        },
      ],
    };

    const annotations = formatGitHubAnnotations(fakeReport);
    assert.match(annotations, /^::warning file=deploy\.yaml/);
    assert.match(annotations, /extensions\/v1beta1/);
    assert.match(annotations, /apps\/v1/);
  });

  it('should filter items by onlyRemoved against targetVersion', () => {
    const raw = `
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: dep
---
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: cron
`;
    // Gated to target version 1.22: Deployment removed in 1.16 is removed; CronJob removed in 1.25 is NOT yet removed.
    const res = auditContent(raw, 'test.yaml', {
      onlyRemoved: true,
      targetVersion: '1.22',
    });

    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].kind, 'Deployment');
    assert.equal(res.items[0].removedIn, 'v1.16');
  });

  it('should tag items with status REMOVED vs DEPRECATED correctly', () => {
    const raw = `
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: my-ing
---
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: my-cron
`;
    // Ingress removed in 1.22; CronJob removed in 1.25.
    // Targeting 1.22: Ingress is REMOVED, CronJob is DEPRECATED.
    const res = auditContent(raw, 'test.yaml', {
      targetVersion: '1.22',
    });

    assert.equal(res.items.length, 2);
    assert.equal(res.items[0].kind, 'Ingress');
    assert.equal(res.items[0].status, 'REMOVED');
    assert.equal(res.items[1].kind, 'CronJob');
    assert.equal(res.items[1].status, 'DEPRECATED');
  });

  it('captures accurate 1-based line numbers and formats SARIF 2.1.0 reports', () => {
    const raw = `apiVersion: v1
kind: Service
metadata:
  name: ok
---
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: nightly
`;
    const res = auditContent(raw, 'k8s/cron.yaml', { targetVersion: '1.25' });
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].line, 6);

    const report = {
      filesScanned: 1,
      documentsScanned: res.documentsScanned,
      deprecatedCount: res.items.length,
      items: res.items,
    };

    const sarif = JSON.parse(formatReport(report, 'sarif'));
    assert.equal(sarif.version, '2.1.0');
    assert.equal(sarif.runs[0].tool.driver.name, 'Janos');
    assert.equal(sarif.runs[0].results.length, 1);
    assert.equal(sarif.runs[0].results[0].ruleId, 'janos/deprecated-api/CronJob');
    assert.equal(sarif.runs[0].results[0].level, 'error');
    assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine, 6);

    const annotations = formatGitHubAnnotations(report);
    assert.match(annotations, /^::warning file=k8s\/cron\.yaml,line=6,title=/);
  });

  it('escapes special characters in GitHub Actions annotations', () => {
    const fakeReport = {
      filesScanned: 1,
      deprecatedCount: 1,
      items: [
        {
          kind: 'CronJob',
          name: 'bad:name,100%\nline2',
          namespace: 'default',
          currentApi: 'batch/v1beta1',
          targetApi: 'batch/v1',
          removedIn: 'v1.25',
          file: 'dir,with:chars/job.yaml',
          line: 3,
        },
      ],
    };
    const out = formatGitHubAnnotations(fakeReport);
    assert.match(out, /file=dir%2Cwith%3Achars\/job\.yaml,line=3/);
    assert.ok(!out.includes('\n'));
    assert.ok(out.includes('%25'));
    assert.ok(out.includes('%0A'));
  });
});
