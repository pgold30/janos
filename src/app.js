/**
 * Copyright 2021-2026, Pablo Loschi
 * Copyright 2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const path = require('path');

const yaml = require('./yaml');
const migration = require('./migration');
const cli = require('./cli');

function findYamlFiles(targetDir) {
  const results = [];

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.yaml' || ext === '.yml') {
          results.push(fullPath);
        }
      }
    }
  }

  walk(targetDir);
  return results.sort();
}

function createUnifiedDiff(oldStr, newStr, filename = '') {
  const a = oldStr.split(/\r?\n/);
  const b = newStr.split(/\r?\n/);

  if (oldStr === newStr) return null;

  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (a[i] === b[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const edits = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      edits.unshift({ type: 'common', line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ type: 'added', line: b[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      edits.unshift({ type: 'removed', line: a[i - 1] });
      i--;
    }
  }

  const out = [];
  out.push(`\x1b[1m--- a/${filename}\x1b[0m`);
  out.push(`\x1b[1m+++ b/${filename}\x1b[0m`);

  edits.forEach((e) => {
    if (e.type === 'added') out.push(`\x1b[32m+ ${e.line}\x1b[0m`);
    else if (e.type === 'removed') out.push(`\x1b[31m- ${e.line}\x1b[0m`);
  });

  return out.join('\n');
}

function convertFile(filePath, options = {}) {
  const events = [];
  const reporter = (event) => events.push(event);

  try {
    const originalContent = fs.readFileSync(filePath, 'utf8');
    const docs = yaml.parseDocuments(originalContent);

    if (!docs || docs.length === 0) {
      return { filePath, changed: false, events: [], error: null };
    }

    const migratedDocs = migration.parseDocs(docs, reporter);
    const newContent = yaml.dumpDocuments(migratedDocs);

    const changed = originalContent.trim() !== newContent.trim();

    if (changed) {
      if (options.diff) {
        const diff = createUnifiedDiff(originalContent, newContent, filePath);
        if (diff) {
          console.log(diff + '\n');
        }
      }

      if (!options.dryRun && !options.check) {
        fs.writeFileSync(filePath, newContent, 'utf8');
      }
    }

    return { filePath, changed, events, error: null };
  } catch (err) {
    return { filePath, changed: false, events, error: err };
  }
}

function main(argv) {
  let args;
  try {
    args = cli.parseArgs(argv);
  } catch (e) {
    console.error(`\x1b[31mError:\x1b[0m ${e.message}`);
    console.log(cli.getHelpText());
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    console.log(cli.getHelpText());
    return;
  }

  if (args.version) {
    console.log(`janos v${cli.getVersion()}`);
    return;
  }

  if (!args.file && !args.dir) {
    console.error('\x1b[31mError:\x1b[0m argument -d or -f must be provided.');
    console.log(cli.getHelpText());
    process.exitCode = 1;
    return;
  }

  let filesToProcess = [];
  if (args.file) {
    if (!fs.existsSync(args.file)) {
      console.error(`\x1b[31mError:\x1b[0m File not found: ${args.file}`);
      process.exitCode = 1;
      return;
    }
    filesToProcess = [args.file];
  } else if (args.dir) {
    if (!fs.existsSync(args.dir)) {
      console.error(`\x1b[31mError:\x1b[0m Directory not found: ${args.dir}`);
      process.exitCode = 1;
      return;
    }
    filesToProcess = findYamlFiles(args.dir);
  }

  if (filesToProcess.length === 0) {
    if (!args.quiet) {
      console.log('No YAML files found to process.');
    }
    return;
  }

  if (!args.quiet) {
    const mode = args.check ? 'Checking' : args.dryRun ? 'Dry-run previewing' : 'Converting';
    console.log(`${mode} ${filesToProcess.length} YAML file(s)...`);
  }

  let changedCount = 0;
  const warnings = [];

  for (const file of filesToProcess) {
    const res = convertFile(file, args);

    if (res.error) {
      console.error(`\x1b[31m✖ Could not process file:\x1b[0m ${file}`);
      console.error(`  ${res.error.message}`);
      continue;
    }

    if (res.events) {
      for (const ev of res.events) {
        if (ev.type === 'warning') {
          warnings.push({ file, message: ev.message });
        }
      }
    }

    if (res.changed) {
      changedCount++;
      if (!args.quiet) {
        const actionLabel = args.check || args.dryRun ? 'Needs migration' : 'Converted';
        console.log(`\x1b[33m•\x1b[0m ${actionLabel}: ${file}`);
        for (const ev of res.events) {
          if (ev.message && ev.type !== 'warning') {
            console.log(`    ↳ ${ev.message}`);
          }
        }
      }
    }
  }

  if (warnings.length > 0 && !args.quiet) {
    console.log('\n\x1b[33mWarnings:\x1b[0m');
    const seen = new Set();
    for (const w of warnings) {
      const key = `${w.file}:${w.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        console.log(`  \x1b[33m⚠\x1b[0m [${path.basename(w.file)}] ${w.message}`);
      }
    }
  }

  if (!args.quiet) {
    console.log('\nSummary:');
    console.log(`  Files scanned:  ${filesToProcess.length}`);
    console.log(`  Files modified: ${changedCount}`);
    console.log(`  Files clean:    ${filesToProcess.length - changedCount}`);
  }

  if (args.check && changedCount > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  convertFile,
  findYamlFiles,
  createUnifiedDiff,
};
