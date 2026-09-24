const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hook = path.join(__dirname, '..', 'bin', 'janos-hook.js');

describe('pre-commit hook', () => {
  it('audits every filename in a batch, including names with spaces', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-hook-audit-'));
    const first = path.join(dir, 'first manifest.yaml');
    const second = path.join(dir, 'second.yaml');
    const legacy = 'apiVersion: batch/v1beta1\nkind: CronJob\nmetadata:\n  name: old\n';
    try {
      fs.writeFileSync(first, legacy);
      fs.writeFileSync(second, legacy);
      const result = spawnSync(process.execPath, [hook, 'audit', first, second], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stdout, /first manifest\.yaml/);
      assert.match(result.stdout, /second\.yaml/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('migrates every filename in a batch', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-hook-migrate-'));
    const first = path.join(dir, 'first.yaml');
    const second = path.join(dir, 'second.yaml');
    const legacy = 'apiVersion: batch/v1beta1\nkind: CronJob\nmetadata:\n  name: old\n';
    try {
      fs.writeFileSync(first, legacy);
      fs.writeFileSync(second, legacy);
      const result = spawnSync(process.execPath, [hook, 'migrate', first, second], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(fs.readFileSync(first, 'utf8'), /apiVersion: batch\/v1\n/);
      assert.match(fs.readFileSync(second, 'utf8'), /apiVersion: batch\/v1\n/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
