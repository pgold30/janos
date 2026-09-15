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

  it('should return version string', () => {
    const version = cli.getVersion();
    assert.equal(typeof version, 'string');
    assert.match(version, /^\d+\.\d+\.\d+/);
  });

  it('should return formatted help text', () => {
    const help = cli.getHelpText();
    assert.match(help, /Usage:/);
    assert.match(help, /--dry-run/);
    assert.match(help, /--check/);
  });
});
