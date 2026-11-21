/**
 * Copyright 2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const kustomize = require('./kustomize');
const app = require('./app');
const cli = require('./cli');

describe('Kustomize integration module', () => {
  it('detects Kustomize directories via isKustomizeDir', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-kust-'));
    try {
      assert.equal(kustomize.isKustomizeDir(tmpDir), false);
      fs.writeFileSync(path.join(tmpDir, 'kustomization.yaml'), 'resources:\n  - deploy.yaml\n');
      assert.equal(kustomize.isKustomizeDir(tmpDir), true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('parses --kustomize / -k and --helm-releases CLI flags', () => {
    const parsedLong = cli.parseArgs(['--kustomize', './overlays/prod', '--audit', '--format', 'sarif']);
    assert.ok(parsedLong.kustomize.endsWith(path.join('overlays', 'prod')));
    assert.equal(parsedLong.audit, true);
    assert.equal(parsedLong.format, 'sarif');

    const parsedShort = cli.parseArgs(['-k', './base', '--check']);
    assert.ok(parsedShort.kustomize.endsWith('base'));
    assert.equal(parsedShort.check, true);

    const parsedCluster = cli.parseArgs(['--cluster', '--helm-releases']);
    assert.equal(parsedCluster.cluster, true);
    assert.equal(parsedCluster.helmReleases, true);
  });

  it('audits and checks rendered Kustomize output via handleKustomize', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-kust-run-'));
    const origAvail = kustomize.isKustomizeAvailable;
    const origRender = kustomize.renderKustomize;
    const origLog = console.log;
    const prevExitCode = process.exitCode;

    kustomize.isKustomizeAvailable = () => true;
    kustomize.renderKustomize = () =>
      'apiVersion: batch/v1beta1\nkind: CronJob\nmetadata:\n  name: nightly\n';

    let output = '';
    console.log = (msg) => { output += msg; };

    try {
      process.exitCode = 0;
      app.handleKustomize({
        kustomize: dir,
        audit: true,
        format: 'json',
        check: true,
        quiet: true,
      });

      const report = JSON.parse(output);
      assert.equal(report.deprecatedCount, 1);
      assert.equal(report.items[0].kind, 'CronJob');
      assert.equal(process.exitCode, 1);
    } finally {
      process.exitCode = prevExitCode;
      console.log = origLog;
      kustomize.isKustomizeAvailable = origAvail;
      kustomize.renderKustomize = origRender;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
