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
});
