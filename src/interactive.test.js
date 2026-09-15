/**
 * Copyright 2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const app = require('./app');

describe('Interactive migration confirmation (-i)', () => {
  it('should apply changes when user confirms with "y"', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-interactive-y-'));
    const file = path.join(tmpDir, 'cron.yaml');
    fs.writeFileSync(
      file,
      `apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: test-cron
spec:
  schedule: "0 0 * * *"
`,
      'utf8'
    );

    let prompted = false;
    app.main(['-d', tmpDir, '-i', '--quiet'], {
      prompter: (filePath, diffFn) => {
        prompted = true;
        return 'y';
      },
    });

    assert.equal(prompted, true);
    const updated = fs.readFileSync(file, 'utf8');
    assert.match(updated, /apiVersion: batch\/v1\n/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should skip changes when user responds with "n"', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-interactive-n-'));
    const file = path.join(tmpDir, 'cron.yaml');
    const originalContent = `apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: test-cron
spec:
  schedule: "0 0 * * *"
`;
    fs.writeFileSync(file, originalContent, 'utf8');

    let prompted = false;
    app.main(['-d', tmpDir, '-i', '--quiet'], {
      prompter: () => {
        prompted = true;
        return 'n';
      },
    });

    assert.equal(prompted, true);
    const current = fs.readFileSync(file, 'utf8');
    assert.equal(current, originalContent);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should apply all remaining files when user responds with "a"', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-interactive-a-'));
    const file1 = path.join(tmpDir, 'cron1.yaml');
    const file2 = path.join(tmpDir, 'cron2.yaml');
    const cronYaml = `apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: test-cron
spec:
  schedule: "0 0 * * *"
`;
    fs.writeFileSync(file1, cronYaml, 'utf8');
    fs.writeFileSync(file2, cronYaml, 'utf8');

    let promptCount = 0;
    app.main(['-d', tmpDir, '-i', '--quiet'], {
      prompter: () => {
        promptCount++;
        return 'a';
      },
    });

    // Should only have prompted once because 'a' accepts all remaining!
    assert.equal(promptCount, 1);
    assert.match(fs.readFileSync(file1, 'utf8'), /apiVersion: batch\/v1\n/);
    assert.match(fs.readFileSync(file2, 'utf8'), /apiVersion: batch\/v1\n/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should abort immediately when user responds with "q"', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-interactive-q-'));
    const file1 = path.join(tmpDir, 'a-cron1.yaml');
    const file2 = path.join(tmpDir, 'z-cron2.yaml');
    const cronYaml = `apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: test-cron
spec:
  schedule: "0 0 * * *"
`;
    fs.writeFileSync(file1, cronYaml, 'utf8');
    fs.writeFileSync(file2, cronYaml, 'utf8');

    app.main(['-d', tmpDir, '-i', '--quiet'], {
      prompter: () => 'q',
    });

    // Neither file should be modified
    assert.equal(fs.readFileSync(file1, 'utf8'), cronYaml);
    assert.equal(fs.readFileSync(file2, 'utf8'), cronYaml);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
