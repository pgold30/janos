/**
 * Copyright 2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const cluster = require('./cluster');
const app = require('./app');

describe('Cluster integration module', () => {
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
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: cluster-cleanup
  namespace: kube-system
---
apiVersion: extensions/v1beta1
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
      assert.equal(parsed.deprecatedCount, 2);
      assert.equal(parsed.items[0].kind, 'CronJob');
      assert.equal(parsed.items[0].name, 'cluster-cleanup');
      assert.equal(parsed.items[1].kind, 'Ingress');
      assert.equal(parsed.items[1].name, 'cluster-ingress');
    } finally {
      console.log = originalLog;
      cluster.fetchClusterManifests = originalFetch;
      cluster.isKubectlInstalled = originalIsInstalled;
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
