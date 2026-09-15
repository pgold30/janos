/**
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
const { normalizeKind, getRemovalVersion, MIGRATION_RULES } = require('./migration');

function toJS(doc) {
  if (!doc) return doc;
  if (typeof doc.toJS === 'function') return doc.toJS();
  return doc;
}

/**
 * Scans an array of file paths and identifies all deprecated Kubernetes APIs.
 *
 * @param {Array<string>} filePaths
 * @param {Object} [options]
 * @returns {Object} Audit report containing scanned files, deprecated items, and summary.
 */
function auditFiles(filePaths, options = {}) {
  const items = [];
  let totalDocsScanned = 0;

  for (const filePath of filePaths) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const docs = yaml.parseDocuments(content);
    if (!docs || docs.length === 0) continue;

    for (const docNode of docs) {
      const doc = toJS(docNode);
      if (!doc || typeof doc !== 'object') continue;
      totalDocsScanned++;

      const rawKind = doc.kind;
      const rawApiVersion = doc.apiVersion;
      if (!rawKind || !rawApiVersion) continue;

      const kind = normalizeKind(rawKind);
      const apiVersion = typeof rawApiVersion === 'string' ? rawApiVersion.trim() : rawApiVersion;
      const name = (doc.metadata && doc.metadata.name) || 'unnamed';
      const namespace = (doc.metadata && doc.metadata.namespace) || 'default';

      const rule = MIGRATION_RULES[kind];
      if (rule && rule.legacy.includes(apiVersion)) {
        const removedIn = getRemovalVersion(kind, apiVersion);
        items.push({
          kind,
          name,
          namespace,
          currentApi: apiVersion,
          targetApi: rule.target,
          removedIn: `v${removedIn}`,
          file: path.relative(process.cwd(), filePath) || filePath,
          warning: rule.warning || null,
        });
      }
    }
  }

  return {
    filesScanned: filePaths.length,
    documentsScanned: totalDocsScanned,
    deprecatedCount: items.length,
    items,
  };
}

function formatAsciiTable(report) {
  if (report.items.length === 0) {
    return '✔ No deprecated Kubernetes APIs detected across scanned files.';
  }

  const headers = ['Kind', 'Name', 'Current API', 'Target API', 'Removed In', 'File'];
  const rows = report.items.map((i) => [
    i.kind,
    i.name.length > 25 ? i.name.slice(0, 22) + '...' : i.name,
    i.currentApi,
    i.targetApi,
    i.removedIn,
    i.file.length > 35 ? '...' + i.file.slice(-32) : i.file,
  ]);

  const colWidths = headers.map((h, idx) =>
    Math.max(h.length, ...rows.map((r) => r[idx].length)),
  );

  function makeRow(values) {
    return (
      '│ ' +
      values.map((v, idx) => v.padEnd(colWidths[idx], ' ')).join(' │ ') +
      ' │'
    );
  }

  function makeSeparator(left, mid, right, fill = '─') {
    return (
      left +
      colWidths.map((w) => fill.repeat(w + 2)).join(mid) +
      right
    );
  }

  const lines = [
    makeSeparator('┌', '┬', '┐'),
    makeRow(headers),
    makeSeparator('├', '┼', '┤'),
    ...rows.map(makeRow),
    makeSeparator('└', '┴', '┘'),
    '',
    `Summary: ${report.deprecatedCount} deprecated resource(s) found across ${report.filesScanned} file(s).`,
  ];

  return lines.join('\n');
}

function formatMarkdownTable(report) {
  if (report.items.length === 0) {
    return `### 🛡️ Janos Kubernetes Audit Report\n\n✅ **All manifests are up to date!** No deprecated Kubernetes APIs found across ${report.filesScanned} file(s).`;
  }

  const lines = [
    '### 🛡️ Janos Kubernetes Deprecation Report',
    '',
    `> ⚠️ **${report.deprecatedCount} deprecated API version(s)** detected across **${report.filesScanned}** scanned files.`,
    '',
    '| Kind | Name | Namespace | Current API | Target API | Removed In | File |',
    '| :--- | :--- | :--- | :--- | :--- | :---: | :--- |',
  ];

  for (const item of report.items) {
    lines.push(
      `| ${item.kind} | \`${item.name}\` | \`${item.namespace}\` | \`${item.currentApi}\` | **\`${item.targetApi}\`** | **${item.removedIn}** | \`${item.file}\` |`,
    );
  }

  lines.push('');
  lines.push('*Run `npx janos -d <dir>` to automatically upgrade these manifests in-place.*');

  return lines.join('\n');
}

function formatReport(report, format = 'table') {
  switch (format.toLowerCase()) {
    case 'markdown':
    case 'md':
      return formatMarkdownTable(report);
    case 'json':
      return JSON.stringify(report, null, 2);
    case 'table':
    default:
      return formatAsciiTable(report);
  }
}

module.exports = {
  auditFiles,
  formatReport,
  formatAsciiTable,
  formatMarkdownTable,
};
