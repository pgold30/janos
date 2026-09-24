const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = path.join(__dirname, '..', 'bin', 'janos.js');
const examples = path.join(__dirname, '..', 'examples');

describe('published migration examples', () => {
  for (const name of ['cronjob', 'hpa']) {
    it(`reproduces the ${name} expected manifest`, () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `janos-example-${name}-`));
      const input = path.join(dir, 'manifest.yaml');
      const legacy = fs.readFileSync(path.join(examples, name, 'legacy.yaml'), 'utf8');
      const expected = fs.readFileSync(path.join(examples, name, 'migrated.yaml'), 'utf8');
      try {
        fs.writeFileSync(input, legacy);
        const preview = spawnSync(process.execPath, [cli, '-f', input, '--dry-run', '--diff'],
          { encoding: 'utf8' });
        assert.equal(preview.status, 0, preview.stderr);
        assert.equal(fs.readFileSync(input, 'utf8'), legacy);
        const migrated = spawnSync(process.execPath, [cli, '-f', input, '--quiet'],
          { encoding: 'utf8' });
        assert.equal(migrated.status, 0, migrated.stderr);
        assert.equal(fs.readFileSync(input, 'utf8'), expected);
        const checked = spawnSync(process.execPath, [cli, '-f', input, '--check'],
          { encoding: 'utf8' });
        assert.equal(checked.status, 0, checked.stderr);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  for (const name of ['psp.yaml', 'crd-without-schema.yaml']) {
    it(`leaves manual example ${name} unchanged and fails check`, () => {
      const file = path.join(examples, 'manual', name);
      const before = fs.readFileSync(file, 'utf8');
      const checked = spawnSync(process.execPath, [cli, '-f', file, '--check'],
        { encoding: 'utf8' });
      assert.equal(checked.status, 1);
      assert.equal(fs.readFileSync(file, 'utf8'), before);
      assert.match(checked.stdout, /Manual migration required/);
    });
  }
});
