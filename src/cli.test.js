/**
 * Copyright 2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const cli = require('./cli');

describe('CLI argument parser', () => {
  it('should parse -f / --file', () => {
    const res1 = cli.parseArgs(['-f', 'deploy.yaml']);
    assert.ok(res1.file.endsWith('deploy.yaml'));

    const res2 = cli.parseArgs(['--file', 'deploy.yaml']);
    assert.ok(res2.file.endsWith('deploy.yaml'));
  });

  it('should parse -d / --dir', () => {
    const res1 = cli.parseArgs(['-d', './k8s']);
    assert.ok(res1.dir.endsWith('k8s'));

    const res2 = cli.parseArgs(['--dir', './k8s']);
    assert.ok(res2.dir.endsWith('k8s'));
  });

  it('should parse dry-run, diff, check flags', () => {
    const res = cli.parseArgs(['-f', 'deploy.yaml', '-n', '--diff', '-c']);
    assert.equal(res.dryRun, true);
    assert.equal(res.diff, true);
    assert.equal(res.check, true);
  });

  it('should handle positional arguments', () => {
    const res = cli.parseArgs(['./package.json']);
    assert.ok(res.file.endsWith('package.json'));
  });

  it('should support legacy argument object for backwards compatibility', () => {
    const res = cli.parseArgs({ f: 'test.yaml' });
    assert.ok(res.file.endsWith('test.yaml'));
  });

  it('should throw error when neither -d nor -f provided in legacy mode', () => {
    assert.throws(() => cli.parseArgs({}), /argument -d or -f must be provided/);
  });

  it('should parse stdin flag and positional hyphen -', () => {
    const res1 = cli.parseArgs(['-']);
    assert.equal(res1.stdin, true);
    assert.equal(res1.file, undefined);

    const res2 = cli.parseArgs(['--stdin']);
    assert.equal(res2.stdin, true);

    const res3 = cli.parseArgs(['-f', '-']);
    assert.equal(res3.stdin, true);
  });

  it('should parse --chart, --helm, and --values', () => {
    const res1 = cli.parseArgs(['--chart', './my-chart', '--values', './val.yaml']);
    assert.ok(res1.chart.endsWith('my-chart'));
    assert.ok(res1.values.endsWith('val.yaml'));

    const res2 = cli.parseArgs(['--helm', './other-chart']);
    assert.ok(res2.chart.endsWith('other-chart'));
  });

  it('should parse --ignore and --annotations', () => {
    const res = cli.parseArgs(['-d', './k8s', '--ignore', '*.tmp.yaml', '--annotations']);
    assert.equal(res.ignore, '*.tmp.yaml');
    assert.equal(res.annotations, true);
  });

  it('should parse --only-removed and --output-file', () => {
    const res = cli.parseArgs(['-d', './k8s', '--only-removed', '--output-file', 'report.md']);
    assert.equal(res.onlyRemoved, true);
    assert.ok(res.outputFile.endsWith('report.md'));
  });

  it('should return version string', () => {
    const version = cli.getVersion();
    assert.equal(typeof version, 'string');
    assert.match(version, /^\d+\.\d+\.\d+/);
  });

  it('should return formatted help text', () => {
    const help = cli.getHelpText();
    assert.match(help, /Usage:/);
    assert.match(help, /--dry-run/);
    assert.match(help, /--chart/);
    assert.match(help, /--check/);
  });
});
