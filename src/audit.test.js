/**
 * Copyright 2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { auditFiles, formatReport } = require('./audit');

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
});
