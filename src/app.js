/**
 * Copyright 2021-2026, Pablo Loschi
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
const audit = require('./audit');
const helm = require('./helm');
const { convertIngressToGateway } = require('./gateway');

function loadIgnorePatterns(targetDir, extraIgnore) {
  const patterns = ['.git', 'node_modules', '_helpers.tpl', 'NOTES.txt'];
  const ignoreFile = path.join(targetDir, '.janosignore');
  if (fs.existsSync(ignoreFile)) {
    try {
      const lines = fs.readFileSync(ignoreFile, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          patterns.push(trimmed);
        }
      }
    } catch {}
  }
  if (extraIgnore) {
    extraIgnore.split(',').forEach((p) => {
      const trimmed = p.trim();
      if (trimmed) patterns.push(trimmed);
    });
  }
  return patterns;
}

function shouldIgnore(entryName, fullPath, patterns) {
  const norm = fullPath.replace(/\\/g, '/');
  for (const pattern of patterns) {
    if (pattern.startsWith('*.')) {
      if (norm.endsWith(pattern.slice(1))) return true;
    } else if (norm.includes(pattern) || entryName === pattern) {
      return true;
    }
  }
  return false;
}

function findYamlFiles(targetDir, options = {}) {
  const results = [];
  const ignorePatterns = loadIgnorePatterns(targetDir, options.ignore);

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.janosignore') {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (shouldIgnore(entry.name, fullPath, ignorePatterns)) {
        continue;
      }
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

    // If file contains Go template directives {{ ... }}, use Helm template migrator
    if (helm.isHelmTemplate(originalContent)) {
      const res = helm.migrateHelmTemplate(originalContent, options);
      if (res.changed) {
        if (options.diff) {
          const diff = createUnifiedDiff(originalContent, res.content, filePath);
          if (diff) console.log(diff + '\n');
        }
        if (!options.dryRun && !options.check) {
          fs.writeFileSync(filePath, res.content, 'utf8');
        }
      }
      return { filePath, changed: res.changed, events: res.events, error: null };
    }

    let docs;
    try {
      docs = yaml.parseDocuments(originalContent);
    } catch (parseErr) {
      if (helm.isHelmTemplate(originalContent) || filePath.endsWith('.tpl')) {
        const res = helm.migrateHelmTemplate(originalContent, options);
        return { filePath, changed: res.changed, events: res.events, error: null };
      }
      throw parseErr;
    }

    if (!docs || docs.length === 0) {
      return { filePath, changed: false, events: [], error: null };
    }

    // Ingress to Gateway API mode
    if (options.ingressToGateway) {
      const generated = [];
      for (const docNode of docs) {
        const plain = yaml.toPlainObject(docNode);
        if (plain && plain.kind === 'Ingress') {
          const routes = convertIngressToGateway(plain, {
            generateGateway: options.generateGateway,
          });
          generated.push(...routes);
        }
      }

      if (generated.length > 0) {
        const newContent = yaml.dumpDocuments(generated);
        const targetOut = options.out || filePath.replace(/\.ya?ml$/, '.gateway.yaml');
        if (!options.dryRun) {
          fs.writeFileSync(targetOut, newContent, 'utf8');
        }
        return {
          filePath,
          outPath: targetOut,
          changed: true,
          events: [{ type: 'migrated', message: `Converted Ingress to Gateway API -> ${targetOut}` }],
          error: null,
        };
      }
      return { filePath, changed: false, events: [], error: null };
    }

    const migratedDocs = migration.parseDocs(docs, {
      reporter,
      targetVersion: options.targetVersion,
    });
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

function handleStdin(args) {
  let content = '';
  try {
    content = fs.readFileSync(0, 'utf8');
  } catch (err) {
    console.error(`\x1b[31mError reading from STDIN:\x1b[0m ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (!content || !content.trim()) {
    if (!args.quiet) console.error('Empty STDIN stream received.');
    return;
  }

  if (args.audit) {
    const auditRes = audit.auditContent(content, 'STDIN', args);
    const report = {
      filesScanned: 1,
      documentsScanned: auditRes.documentsScanned,
      deprecatedCount: auditRes.items.length,
      items: auditRes.items,
    };
    const output = audit.formatReport(report, args.format);
    if (args.outputFile) {
      fs.writeFileSync(args.outputFile, output, 'utf8');
      if (!args.quiet) console.error(`Audit report written to: ${args.outputFile}`);
    } else {
      console.log(output);
    }

    if (args.annotations && args.format !== 'json') {
      const annotations = audit.formatGitHubAnnotations(report);
      if (annotations) console.log(annotations);
    }

    if (process.env.GITHUB_STEP_SUMMARY && (args.format === 'markdown' || args.format === 'md')) {
      try {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output + '\n');
      } catch {}
    }

    if (args.check && report.deprecatedCount > 0) {
      process.exitCode = 1;
    }
    return;
  }

  try {
    const docs = yaml.parseDocuments(content);
    const events = [];
    const reporter = (e) => events.push(e);

    const migratedDocs = migration.parseDocs(docs, {
      reporter,
      targetVersion: args.targetVersion,
    });
    const newContent = yaml.dumpDocuments(migratedDocs);

    if (args.diff) {
      const diff = createUnifiedDiff(content, newContent, 'STDIN');
      if (diff) console.log(diff);
      if (args.check && content.trim() !== newContent.trim()) {
        process.exitCode = 1;
      }
      return;
    }

    if (args.check) {
      if (content.trim() !== newContent.trim()) {
        process.exitCode = 1;
      }
      return;
    }

    process.stdout.write(newContent);

    if (!args.quiet && events.length > 0) {
      console.error(`\nMigrated ${events.length} resource(s) from STDIN.`);
    }
  } catch (err) {
    console.error(`\x1b[31mError processing STDIN stream:\x1b[0m ${err.message}`);
    process.exitCode = 1;
  }
}

function handleHelmChart(args) {
  if (!helm.isHelmInstalled()) {
    console.error('\x1b[31mError:\x1b[0m "helm" command not found in PATH. Install Helm (https://helm.sh) to render and audit charts.');
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(args.chart)) {
    console.error(`\x1b[31mError:\x1b[0m Helm chart path does not exist: ${args.chart}`);
    process.exitCode = 1;
    return;
  }

  if (!args.quiet) {
    console.error(`Rendering Helm chart at "${args.chart}"...`);
  }

  let renderedYaml;
  try {
    renderedYaml = helm.renderChart(args.chart, {
      values: args.values,
      kubeVersion: args.targetVersion,
    });
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (args.audit) {
    const auditRes = audit.auditContent(renderedYaml, path.basename(args.chart), args);
    const report = {
      filesScanned: 1,
      documentsScanned: auditRes.documentsScanned,
      deprecatedCount: auditRes.items.length,
      items: auditRes.items,
    };
    const output = audit.formatReport(report, args.format);
    if (args.outputFile) {
      fs.writeFileSync(args.outputFile, output, 'utf8');
      if (!args.quiet) console.error(`Audit report written to: ${args.outputFile}`);
    } else {
      console.log(output);
    }

    if (args.annotations && args.format !== 'json') {
      const annotations = audit.formatGitHubAnnotations(report);
      if (annotations) console.log(annotations);
    }

    if (process.env.GITHUB_STEP_SUMMARY && (args.format === 'markdown' || args.format === 'md')) {
      try {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output + '\n');
      } catch {}
    }

    if (args.check && report.deprecatedCount > 0) {
      process.exitCode = 1;
    }
    return;
  }

  const docs = yaml.parseDocuments(renderedYaml);
  const events = [];
  const reporter = (e) => events.push(e);
  const migratedDocs = migration.parseDocs(docs, {
    reporter,
    targetVersion: args.targetVersion,
  });
  const newContent = yaml.dumpDocuments(migratedDocs);

  if (args.diff) {
    const diff = createUnifiedDiff(renderedYaml, newContent, `Chart: ${path.basename(args.chart)}`);
    if (diff) console.log(diff);
    if (args.check && renderedYaml.trim() !== newContent.trim()) {
      process.exitCode = 1;
    }
    return;
  }

  if (args.out) {
    fs.writeFileSync(args.out, newContent, 'utf8');
    if (!args.quiet) console.error(`Rendered and migrated chart saved to: ${args.out}`);
  } else {
    process.stdout.write(newContent);
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

  // 1. STDIN Mode
  if (args.stdin) {
    handleStdin(args);
    return;
  }

  // 2. Helm Chart Mode
  if (args.chart) {
    handleHelmChart(args);
    return;
  }

  if (!args.file && !args.dir) {
    console.error('\x1b[31mError:\x1b[0m argument -d, -f, --chart, or STDIN must be provided.');
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
    filesToProcess = findYamlFiles(args.dir, { ignore: args.ignore });
  }

  if (filesToProcess.length === 0) {
    if (!args.quiet) {
      console.log('No YAML files found to process.');
    }
    return;
  }

  // Pluto-style Audit mode
  if (args.audit) {
    const report = audit.auditFiles(filesToProcess, args);
    const output = audit.formatReport(report, args.format);
    if (args.outputFile) {
      fs.writeFileSync(args.outputFile, output, 'utf8');
      if (!args.quiet) console.log(`Audit report written to: ${args.outputFile}`);
    } else {
      console.log(output);
    }

    if (args.annotations && args.format !== 'json') {
      const annotations = audit.formatGitHubAnnotations(report);
      if (annotations) console.log(annotations);
    }

    if (process.env.GITHUB_STEP_SUMMARY && (args.format === 'markdown' || args.format === 'md')) {
      try {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, output + '\n');
      } catch {}
    }

    if (args.check && report.deprecatedCount > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (!args.quiet) {
    let mode = 'Converting';
    if (args.check) mode = 'Checking';
    else if (args.dryRun) mode = 'Dry-run previewing';
    else if (args.ingressToGateway) mode = 'Migrating Ingress to Gateway API for';

    const versionNote = args.targetVersion ? ` (target version: v${args.targetVersion})` : '';
    console.log(`${mode} ${filesToProcess.length} YAML file(s)${versionNote}...`);
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
  handleStdin,
  handleHelmChart,
};
