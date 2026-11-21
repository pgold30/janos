/**
 * Copyright 2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { convertFile, findYamlFiles, createUnifiedDiff, handleGitBlameIgnore } = require('./app');

describe('Application logic', () => {
  it('should find YAML files in directory recursively', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-find-'));
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'test1.yaml'), 'foo: bar\n');
    fs.writeFileSync(path.join(tmpDir, 'sub', 'test2.yml'), 'foo: baz\n');
    fs.writeFileSync(path.join(tmpDir, 'ignore.txt'), 'hello\n');

    const files = findYamlFiles(tmpDir);
    assert.equal(files.length, 2);
    assert.ok(files.some((f) => f.endsWith('test1.yaml')));
    assert.ok(files.some((f) => f.endsWith('test2.yml')));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate unified diff for modified content', () => {
    const oldStr = 'apiVersion: batch/v1beta1\nkind: CronJob\n';
    const newStr = 'apiVersion: batch/v1\nkind: CronJob\n';
    const diff = createUnifiedDiff(oldStr, newStr, 'cron.yaml');

    assert.ok(diff);
    assert.match(diff, /--- a\/cron\.yaml/);
    assert.match(diff, /\+.*apiVersion: batch\/v1/);
    assert.match(diff, /-.*apiVersion: batch\/v1beta1/);
  });

  it('should return null diff when content is identical', () => {
    const str = 'apiVersion: apps/v1\nkind: Deployment\n';
    const diff = createUnifiedDiff(str, str, 'dep.yaml');
    assert.equal(diff, null);
  });

  it('should convert file on disk when dryRun is false', () => {
    const tmpFile = path.join(os.tmpdir(), `janos-${Date.now()}.yaml`);
    fs.writeFileSync(
      tmpFile,
      'apiVersion: batch/v1beta1\nkind: CronJob\nmetadata:\n  name: nightly\n',
    );

    const res = convertFile(tmpFile, { dryRun: false });
    assert.equal(res.changed, true);

    const updated = fs.readFileSync(tmpFile, 'utf8');
    assert.match(updated, /apiVersion: batch\/v1/);

    fs.unlinkSync(tmpFile);
  });

  it('should NOT modify file on disk when dryRun is true', () => {
    const tmpFile = path.join(os.tmpdir(), `janos-dry-${Date.now()}.yaml`);
    const original = 'apiVersion: batch/v1beta1\nkind: CronJob\nmetadata:\n  name: nightly\n';
    fs.writeFileSync(tmpFile, original);

    const res = convertFile(tmpFile, { dryRun: true });
    assert.equal(res.changed, true);

    const current = fs.readFileSync(tmpFile, 'utf8');
    assert.equal(current, original);

    fs.unlinkSync(tmpFile);
  });

  it('should keep Gateway output separate and leave check mode read-only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-gateway-app-'));
    const input = path.join(dir, 'ingress.yaml');
    const output = path.join(dir, 'ingress.gateway.yaml');
    const original = 'apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: web\nspec:\n  rules:\n    - http:\n        paths:\n          - path: /\n            pathType: Prefix\n            backend:\n              service:\n                name: web\n                port:\n                  number: 80\n';
    try {
      fs.writeFileSync(input, original);
      const checked = convertFile(input, { ingressToGateway: true, check: true });
      assert.equal(checked.changed, true);
      assert.equal(fs.existsSync(output), false);
      assert.equal(fs.readFileSync(input, 'utf8'), original);

      const converted = convertFile(input, { ingressToGateway: true });
      assert.equal(converted.outPath, output);
      assert.match(fs.readFileSync(output, 'utf8'), /kind: HTTPRoute/);
      assert.equal(fs.readFileSync(input, 'utf8'), original);

      const unsafe = convertFile(input, { ingressToGateway: true, out: input });
      assert.match(unsafe.error.message, /must differ/);
      assert.equal(fs.readFileSync(input, 'utf8'), original);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should reject malformed YAML without rewriting it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-invalid-'));
    const input = path.join(dir, 'bad.yaml');
    const malformed = 'kind: CronJob\nmetadata: [broken\n';
    try {
      fs.writeFileSync(input, malformed);
      const result = convertFile(input);
      assert.ok(result.error);
      assert.equal(fs.readFileSync(input, 'utf8'), malformed);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should handle multi-document files cleanly', () => {
    const tmpFile = path.join(os.tmpdir(), `janos-multi-${Date.now()}.yaml`);
    const original = `
apiVersion: v1
kind: Service
metadata:
  name: my-svc
---
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: my-cron
`;
    fs.writeFileSync(tmpFile, original);

    const res = convertFile(tmpFile, { dryRun: false });
    assert.equal(res.changed, true);

    const updated = fs.readFileSync(tmpFile, 'utf8');
    assert.match(updated, /kind: Service/);
    assert.match(updated, /---/);
    assert.match(updated, /apiVersion: batch\/v1/);

    fs.unlinkSync(tmpFile);
  });

  it('should respect .janosignore and custom ignore options', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-ignore-'));
    fs.writeFileSync(path.join(tmpDir, '.janosignore'), 'ignored.yaml\n*.skip.yaml\n');
    fs.writeFileSync(path.join(tmpDir, 'valid.yaml'), 'kind: Pod\n');
    fs.writeFileSync(path.join(tmpDir, 'ignored.yaml'), 'kind: Pod\n');
    fs.writeFileSync(path.join(tmpDir, 'test.skip.yaml'), 'kind: Pod\n');
    fs.writeFileSync(path.join(tmpDir, 'manual.yaml'), 'kind: Pod\n');

    const files = findYamlFiles(tmpDir, { ignore: 'manual.yaml' });
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith('valid.yaml'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should convert Helm templates preserving Go templates via convertFile', () => {
    const tmpFile = path.join(os.tmpdir(), `janos-helm-template-${Date.now()}.yaml`);
    const templateContent = `{{- if .Values.enabled }}
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: {{ include "chart.name" . }}
{{- end }}
`;
    fs.writeFileSync(tmpFile, templateContent);

    const res = convertFile(tmpFile, { dryRun: false });
    assert.equal(res.changed, true);

    const updated = fs.readFileSync(tmpFile, 'utf8');
    assert.match(updated, /apiVersion: batch\/v1/);
    assert.match(updated, /\{\{- if \.Values\.enabled \}\}/);
    assert.match(updated, /\{\{ include "chart\.name" \. \}\}/);

    fs.unlinkSync(tmpFile);
  });

  it('should support convertFile with annotate and annotateInline', () => {
    const tmpFile = path.join(os.tmpdir(), `janos-annotate-${Date.now()}.yaml`);
    const content = `apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: nightly-backup
spec:
  schedule: "0 1 * * *"
`;
    fs.writeFileSync(tmpFile, content);

    const res = convertFile(tmpFile, { annotate: true, annotateInline: true });
    assert.equal(res.changed, true);

    const updated = fs.readFileSync(tmpFile, 'utf8');
    assert.match(updated, /apiVersion: batch\/v1 # \[janos\]: migrated from batch\/v1beta1/);
    assert.match(updated, /janos\.io\/migrated-from: batch\/v1beta1/);
    assert.match(updated, /janos\.io\/migrated-at:/);
    assert.match(updated, /janos\.io\/upgraded-by: janos/);

    fs.unlinkSync(tmpFile);
  });

  it('should create and configure .git-blame-ignore-revs via handleGitBlameIgnore', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-blame-'));
    const blameFile = handleGitBlameIgnore(tmpDir, true);

    assert.ok(fs.existsSync(blameFile));
    const content = fs.readFileSync(blameFile, 'utf8');
    assert.match(content, /\.git-blame-ignore-revs/);
    assert.match(content, /Janos automated migration/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('matches .janosignore patterns against relative paths without false-positive ancestor matches', () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-legacy-parent-'));
    const projectDir = path.join(parentDir, 'manifests');
    fs.mkdirSync(path.join(projectDir, 'generated'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'app'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.janosignore'), 'legacy\ngenerated/*.yaml\n');
    fs.writeFileSync(path.join(projectDir, 'app', 'deploy.yaml'), 'kind: Deployment\n');
    fs.writeFileSync(path.join(projectDir, 'generated', 'auto.yaml'), 'kind: Deployment\n');

    try {
      // Even though parentDir contains "legacy" in its path, app/deploy.yaml must NOT be ignored!
      const files = findYamlFiles(projectDir);
      assert.equal(files.length, 1);
      assert.ok(files[0].endsWith(path.join('app', 'deploy.yaml')));
    } finally {
      fs.rmSync(parentDir, { recursive: true, force: true });
    }
  });

  it('runs server dry-run validation when validate option is enabled', () => {
    const cluster = require('./cluster');
    const origValidate = cluster.validateManifestServerDryRun;
    const tmpFile = path.join(os.tmpdir(), `janos-validate-${Date.now()}.yaml`);
    fs.writeFileSync(tmpFile, 'apiVersion: batch/v1beta1\nkind: CronJob\nmetadata:\n  name: nightly\n');

    try {
      cluster.validateManifestServerDryRun = () => ({ ok: true, output: 'cronjob.batch/nightly configured (server dry run)' });
      const okRes = convertFile(tmpFile, { dryRun: true, validate: true });
      assert.equal(okRes.error, null);
      assert.ok(okRes.events.some((e) => e.type === 'validated'));

      cluster.validateManifestServerDryRun = () => ({ ok: false, error: 'field is immutable' });
      const failRes = convertFile(tmpFile, { dryRun: true, validate: true });
      assert.ok(failRes.error);
      assert.match(failRes.error.message, /Server dry-run validation failed/);
    } finally {
      cluster.validateManifestServerDryRun = origValidate;
      fs.rmSync(tmpFile, { force: true });
    }
  });
});
