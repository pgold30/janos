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
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: {{ include "chart.name" . }}
{{- end }}
`;
    fs.writeFileSync(tmpFile, templateContent);

    const res = convertFile(tmpFile, { dryRun: false });
    assert.equal(res.changed, true);

    const updated = fs.readFileSync(tmpFile, 'utf8');
    assert.match(updated, /apiVersion: apps\/v1/);
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
});
