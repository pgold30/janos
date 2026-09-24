/**
 * Copyright 2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cluster = require('./cluster');
const app = require('./app');

describe('Cluster integration module', () => {
  it('prefers matching last-applied manifests and reports missing or invalid originals', () => {
    const original = { apiVersion: 'batch/v1beta1', kind: 'CronJob', metadata: { name: 'old' } };
    const live = { apiVersion: 'batch/v1', kind: 'CronJob', metadata: { name: 'old',
      annotations: { 'kubectl.kubernetes.io/last-applied-configuration': JSON.stringify(original) } } };
    const missing = { apiVersion: 'batch/v1', kind: 'CronJob', metadata: { name: 'missing' } };
    const invalid = { apiVersion: 'batch/v1', kind: 'CronJob', metadata: { name: 'invalid',
      annotations: { 'kubectl.kubernetes.io/last-applied-configuration': '{broken' } } };
    const result = cluster.collectAuditSources(JSON.stringify({ kind: 'List', items: [live, missing, invalid] }));
    assert.deepEqual(result.coverage,
      { resources: 3, original: 1, liveOnly: 1, invalidOriginal: 1 });
    assert.equal(result.records[0].resource.apiVersion, 'batch/v1beta1');
    assert.equal(result.records[1].source, 'served API');
    assert.equal(result.records[2].source, 'served API');
  });

  it('rejects a stored manifest for a different resource', () => {
    const live = { apiVersion: 'batch/v1', kind: 'CronJob', metadata: { name: 'real',
      annotations: { 'kubectl.kubernetes.io/last-applied-configuration': JSON.stringify({
        apiVersion: 'batch/v1beta1', kind: 'CronJob', metadata: { name: 'other' },
      }) } } };
    const result = cluster.collectAuditSources(JSON.stringify(live));
    assert.equal(result.coverage.invalidOriginal, 1);
    assert.equal(result.records[0].resource.apiVersion, 'batch/v1');
  });
  it('should pass namespace text to kubectl without shell interpretation', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-kubectl-'));
    const marker = path.join(dir, 'executed');
    const namespace = `prod$(touch ${marker})`;
    const kubectl = path.join(dir, 'kubectl');
    try {
      fs.writeFileSync(kubectl, '#!/bin/sh\nprintf "%s\\n" "$@"\n');
      fs.chmodSync(kubectl, 0o755);
      const result = spawnSync(process.execPath, ['-e', 'process.stdout.write(require("./cluster").fetchClusterManifests({ namespace: process.argv[1] }))', namespace], {
        cwd: __dirname,
        env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes(namespace));
      assert.equal(fs.existsSync(marker), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('should detect if kubectl is installed or not', () => {
    const installed = cluster.isKubectlInstalled();
    assert.equal(typeof installed, 'boolean');
  });

  it('should throw an informative error when kubectl execution fails or is missing', () => {
    // Calling with invalid kubeconfig should throw an error from kubectl
    assert.throws(
      () => {
        cluster.fetchClusterManifests({ kubeconfig: '/non/existent/path/kubeconfig.yaml' });
      },
      /Failed to query cluster via kubectl/
    );
  });

  it('should handle cluster audit via handleCluster', () => {
    // Mock fetchClusterManifests to return deprecated manifest
    const originalFetch = cluster.fetchClusterManifests;
    const originalIsInstalled = cluster.isKubectlInstalled;

    cluster.isKubectlInstalled = () => true;
    cluster.fetchClusterManifests = () => `
apiVersion: v1
kind: List
items:
  - apiVersion: batch/v1beta1
    kind: CronJob
    metadata:
      name: cluster-cleanup
      namespace: kube-system
  - apiVersion: extensions/v1beta1
    kind: Ingress
    metadata:
      name: cluster-ingress
      namespace: default
`;

    let capturedOutput = '';
    const originalLog = console.log;
    console.log = (msg) => {
      capturedOutput += msg + '\n';
    };

    try {
      app.handleCluster({
        cluster: true,
        audit: true,
        format: 'json',
        quiet: true,
      });

      const parsed = JSON.parse(capturedOutput);
      assert.equal(parsed.documentsScanned, 2);
      assert.equal(parsed.deprecatedCount, 2);
      assert.equal(parsed.items[0].kind, 'CronJob');
      assert.equal(parsed.items[0].name, 'cluster-cleanup');
      assert.equal(parsed.items[1].kind, 'Ingress');
      assert.equal(parsed.items[1].name, 'cluster-ingress');
      assert.deepEqual(parsed.coverage,
        { resources: 2, original: 0, liveOnly: 2, invalidOriginal: 0 });
    } finally {
      console.log = originalLog;
      cluster.fetchClusterManifests = originalFetch;
      cluster.isKubectlInstalled = originalIsInstalled;
    }
  });

  it('finds deprecated original APIs even when kubectl serves a newer API', () => {
    const originalFetch = cluster.fetchClusterManifests;
    const originalIsInstalled = cluster.isKubectlInstalled;
    const originalLog = console.log;
    const original = { apiVersion: 'batch/v1beta1', kind: 'CronJob', metadata: { name: 'nightly' } };
    const live = { apiVersion: 'batch/v1', kind: 'CronJob', metadata: { name: 'nightly',
      annotations: { 'kubectl.kubernetes.io/last-applied-configuration': JSON.stringify(original) } } };
    cluster.isKubectlInstalled = () => true;
    cluster.fetchClusterManifests = () => JSON.stringify({ kind: 'List', items: [live] });
    let output = '';
    console.log = (message) => { output += message; };
    try {
      app.handleCluster({ cluster: true, audit: true, format: 'json', quiet: true });
      const report = JSON.parse(output);
      assert.equal(report.deprecatedCount, 1);
      assert.equal(report.items[0].currentApi, 'batch/v1beta1');
      assert.match(report.items[0].file, /last-applied/);
    } finally {
      cluster.fetchClusterManifests = originalFetch;
      cluster.isKubectlInstalled = originalIsInstalled;
      console.log = originalLog;
    }
  });

  it('can require original-manifest coverage in cluster check mode', () => {
    const originalFetch = cluster.fetchClusterManifests;
    const originalIsInstalled = cluster.isKubectlInstalled;
    const originalLog = console.log;
    const previousExitCode = process.exitCode;
    cluster.isKubectlInstalled = () => true;
    cluster.fetchClusterManifests = () => JSON.stringify({ kind: 'List', items: [
      { apiVersion: 'batch/v1', kind: 'CronJob', metadata: { name: 'nightly' } },
    ] });
    console.log = () => {};
    try {
      process.exitCode = 0;
      app.handleCluster({ cluster: true, audit: true, format: 'json', quiet: true,
        check: true, requireOriginal: true });
      assert.equal(process.exitCode, 1);
    } finally {
      process.exitCode = previousExitCode;
      cluster.fetchClusterManifests = originalFetch;
      cluster.isKubectlInstalled = originalIsInstalled;
      console.log = originalLog;
    }
  });

  it('should migrate resources inside a kubectl List in diff mode', () => {
    const originalFetch = cluster.fetchClusterManifests;
    const originalIsInstalled = cluster.isKubectlInstalled;
    const originalLog = console.log;
    cluster.isKubectlInstalled = () => true;
    cluster.fetchClusterManifests = () => 'kind: List\nitems:\n  - apiVersion: batch/v1beta1\n    kind: CronJob\n    metadata:\n      name: nightly\n';
    let diff = '';
    console.log = (message) => { diff += message; };
    try {
      app.handleCluster({ cluster: true, diff: true, quiet: true });
      assert.match(diff, /\+ apiVersion: batch\/v1/);
    } finally {
      cluster.fetchClusterManifests = originalFetch;
      cluster.isKubectlInstalled = originalIsInstalled;
      console.log = originalLog;
    }
  });

  it('should fail check mode without writing a cluster export', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-cluster-check-'));
    const output = path.join(dir, 'export.yaml');
    const originalFetch = cluster.fetchClusterManifests;
    const originalIsInstalled = cluster.isKubectlInstalled;
    const previousExitCode = process.exitCode;
    cluster.isKubectlInstalled = () => true;
    cluster.fetchClusterManifests = () => 'kind: List\nitems:\n  - apiVersion: batch/v1beta1\n    kind: CronJob\n    metadata:\n      name: nightly\n';
    try {
      app.handleCluster({ cluster: true, out: output, check: true, quiet: true });
      assert.equal(process.exitCode, 1);
      assert.equal(fs.existsSync(output), false);
    } finally {
      process.exitCode = previousExitCode;
      cluster.fetchClusterManifests = originalFetch;
      cluster.isKubectlInstalled = originalIsInstalled;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should support cluster diff mode', () => {
    const originalFetch = cluster.fetchClusterManifests;
    const originalIsInstalled = cluster.isKubectlInstalled;

    cluster.isKubectlInstalled = () => true;
    cluster.fetchClusterManifests = () => `
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: cluster-cron
`;

    let capturedDiff = '';
    const originalLog = console.log;
    console.log = (msg) => {
      capturedDiff += msg + '\n';
    };

    try {
      app.handleCluster({
        cluster: true,
        diff: true,
        quiet: true,
      });

      assert.match(capturedDiff, /--- a\/Live Cluster/);
      assert.match(capturedDiff, /\+ apiVersion: batch\/v1/);
    } finally {
      console.log = originalLog;
      cluster.fetchClusterManifests = originalFetch;
      cluster.isKubectlInstalled = originalIsInstalled;
    }
  });
});
