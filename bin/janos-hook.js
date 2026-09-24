#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const [mode, ...files] = process.argv.slice(2);
if (!['audit', 'migrate'].includes(mode)) {
  console.error('Usage: janos-hook <audit|migrate> [file ...]');
  process.exitCode = 2;
} else {
  const cli = path.join(__dirname, 'janos.js');
  let failed = false;
  for (const file of files) {
    const commands = mode === 'audit'
      ? [['-f', file, '--audit', '--check']]
      : [['-f', file], ['-f', file, '--check']];
    for (const args of commands) {
      const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
      if (result.error) console.error(`${file}: ${result.error.message}`);
      if (result.error || result.status !== 0) {
        failed = true;
        break;
      }
    }
  }
  if (failed) process.exitCode = 1;
}
