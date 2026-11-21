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
const { normalizeKind, resolveMigrationRule, parseVersionNum, LATEST_K8S_VERSION } = require('./migration');
const { getVersion } = require('./cli');

const helm = require('./helm');

function toJS(doc) {
  if (!doc) return doc;
  if (typeof doc.toJS === 'function') return doc.toJS();
  return doc;
}

function lineFromOffset(content, offset) {
  if (typeof content !== 'string' || typeof offset !== 'number' || offset < 0) return null;
  let line = 1;
  const end = Math.min(offset, content.length);
  for (let i = 0; i < end; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function getApiVersionLine(docNode, content) {
  if (!docNode || typeof docNode.get !== 'function') return null;
  const apiNode = docNode.get('apiVersion', true);
  if (apiNode && Array.isArray(apiNode.range) && typeof apiNode.range[0] === 'number') {
    return lineFromOffset(content, apiNode.range[0]);
  }
  return null;
}

function filterRemovedItems(items, options = {}) {
  if (!options.onlyRemoved) return items;
  const targetVer = options.targetVersion
    ? parseVersionNum(options.targetVersion)
    : parseVersionNum(LATEST_K8S_VERSION);
  return items.filter((item) => {
    const remVer = parseVersionNum(item.removedIn);
    return remVer <= targetVer;
  });
}

/**
 * Audits a string of YAML (or Helm template) content.
 *
 * @param {string} content
 * @param {string} [sourceName]
 * @param {Object} [options]
 * @returns {{ documentsScanned: number, items: Array<Object> }}
 */
function auditContent(content, sourceName = 'STDIN', options = {}) {
  const items = [];
  let documentsScanned = 0;

  if (helm.isHelmTemplate(content)) {
    const templateItems = filterRemovedItems(helm.auditHelmTemplate(content, sourceName, options), options);
    return {
      documentsScanned: templateItems.length > 0 ? templateItems.length : 1,
      items: templateItems,
    };
  }

  const docs = yaml.parseDocuments(content);

  if (!docs || docs.length === 0) {
    return { documentsScanned: 0, items: [] };
  }

  for (const docNode of docs) {
    const root = toJS(docNode);
    const isList = Boolean(root && root.kind === 'List' && Array.isArray(root.items));
    const docLine = isList ? null : getApiVersionLine(docNode, content);
    const resources = isList ? root.items : [root];
    for (const doc of resources) {
      if (!doc || typeof doc !== 'object') continue;
      documentsScanned++;

      const rawKind = doc.kind;
      const rawApiVersion = doc.apiVersion;
      if (!rawKind || !rawApiVersion) continue;

      const kind = normalizeKind(rawKind);
      const apiVersion = typeof rawApiVersion === 'string' ? rawApiVersion.trim() : rawApiVersion;
      const name = (doc.metadata && doc.metadata.name) || 'unnamed';
      const namespace = (doc.metadata && doc.metadata.namespace) || 'default';

      const resolved = resolveMigrationRule(kind, apiVersion, options);
      if (resolved) {
        const { rule, removedIn } = resolved;
        const remVer = parseVersionNum(removedIn);
        const targetVer = options.targetVersion
          ? parseVersionNum(options.targetVersion)
          : parseVersionNum(LATEST_K8S_VERSION);
        const status = remVer <= targetVer ? 'REMOVED' : 'DEPRECATED';

        const item = {
          kind,
          name,
          namespace,
          currentApi: apiVersion,
          targetApi: rule.target,
          removedIn: `v${removedIn}`,
          status,
          file: sourceName,
          warning: rule.warning || null,
        };
        if (docLine !== null) {
          item.line = docLine;
        }
        items.push(item);
      }
    }
  }

  return { documentsScanned, items: filterRemovedItems(items, options) };
}

/**
 * Scans an array of file paths and identifies all deprecated Kubernetes APIs.
 *
 * @param {Array<string>} filePaths
 * @param {Object} [options]
 * @returns {Object} Audit report containing scanned files, deprecated items, and summary.
 */
function auditFiles(filePaths, options = {}) {
  const allItems = [];
  let totalDocsScanned = 0;

  for (const filePath of filePaths) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const relPath = path.relative(process.cwd(), filePath) || filePath;
    let result;
    try {
      result = auditContent(content, relPath, options);
    } catch (err) {
      throw new Error(`Invalid YAML in ${relPath}: ${err.message}`);
    }
    totalDocsScanned += result.documentsScanned;
    allItems.push(...result.items);
  }

  return {
    filesScanned: filePaths.length,
    documentsScanned: totalDocsScanned,
    deprecatedCount: allItems.length,
    items: allItems,
  };
}

function formatAsciiTable(report) {
  const coverage = formatCoverage(report);
  if (report.items.length === 0) {
    return '✔ No deprecated Kubernetes APIs detected across scanned files.' + coverage;
  }

  const headers = ['Kind', 'Name', 'Current API', 'Target API', 'Removed In', 'Status', 'File'];
  const rows = report.items.map((i) => [
    i.kind,
    i.name.length > 25 ? i.name.slice(0, 22) + '...' : i.name,
    i.currentApi,
    i.targetApi,
    i.removedIn,
    i.status || 'REMOVED',
    i.file.length > 30 ? '...' + i.file.slice(-27) : i.file,
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

  return lines.join('\n') + coverage;
}

function formatCoverage(report) {
  if (!report.coverage) return '';
  const { resources, original, liveOnly, invalidOriginal } = report.coverage;
  return `\nSource coverage: ${original}/${resources} original manifests; ${liveOnly} served-API only; ${invalidOriginal} invalid stored originals. A served API does not prove which version was applied.`;
}

function formatMarkdownTable(report) {
  const coverage = formatCoverage(report);
  if (report.items.length === 0) {
    return `### 🛡️ Janos Kubernetes Audit Report\n\nNo deprecated APIs were detected in the available sources across ${report.filesScanned} file(s).${coverage}`;
  }

  const lines = [
    '### 🛡️ Janos Kubernetes Deprecation Report',
    '',
    `> ⚠️ **${report.deprecatedCount} deprecated API version(s)** detected across **${report.filesScanned}** scanned files.`,
    '',
    '| Kind | Name | Namespace | Current API | Target API | Removed In | Status | File |',
    '| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |',
  ];

  for (const item of report.items) {
    const statusBadge = item.status === 'REMOVED' ? '🔴 REMOVED' : '🟡 DEPRECATED';
    lines.push(
      `| ${item.kind} | \`${item.name}\` | \`${item.namespace}\` | \`${item.currentApi}\` | **\`${item.targetApi}\`** | **${item.removedIn}** | ${statusBadge} | \`${item.file}\` |`,
    );
  }

  lines.push('');
  lines.push('*Run `janos -d <dir>` to upgrade supported manifests in-place. Review manual-migration diagnostics.*');

  return lines.join('\n') + coverage;
}

function escapeGitHubProperty(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

function escapeGitHubMessage(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function formatGitHubAnnotations(report) {
  if (!report || !report.items || report.items.length === 0) {
    return '';
  }

  return report.items
    .map((item) => {
      const props = [`file=${escapeGitHubProperty(item.file)}`];
      if (item.line) {
        props.push(`line=${item.line}`);
      }
      props.push(`title=${escapeGitHubProperty(`Deprecated Kubernetes API (${item.kind})`)}`);
      const msg = escapeGitHubMessage(
        `${item.kind} "${item.name}" uses deprecated ${item.currentApi} (removed in ${item.removedIn}). Replace with ${item.targetApi}.`,
      );
      return `::warning ${props.join(',')}::${msg}`;
    })
    .join('\n');
}

function formatSarif(report) {
  const items = (report && Array.isArray(report.items)) ? report.items : [];
  const rulesMap = new Map();

  for (const item of items) {
    const ruleId = `janos/deprecated-api/${item.kind}`;
    if (!rulesMap.has(ruleId)) {
      rulesMap.set(ruleId, {
        id: ruleId,
        name: `Deprecated${item.kind}API`,
        shortDescription: {
          text: `Deprecated Kubernetes ${item.kind} API version`,
        },
        fullDescription: {
          text: `Kubernetes ${item.kind} manifests should migrate from deprecated API versions to ${item.targetApi}.`,
        },
        helpUri: 'https://kubernetes.io/docs/reference/using-api/deprecation-guide/',
        properties: {
          tags: ['kubernetes', 'deprecation', 'upgrade'],
        },
      });
    }
  }

  const results = items.map((item) => {
    const ruleId = `janos/deprecated-api/${item.kind}`;
    const level = item.status === 'REMOVED' ? 'error' : 'warning';
    const location = {
      physicalLocation: {
        artifactLocation: {
          uri: String(item.file || 'STDIN').replace(/\\/g, '/'),
        },
        ...(item.line ? { region: { startLine: item.line } } : {}),
      },
    };
    return {
      ruleId,
      level,
      message: {
        text: `${item.kind} "${item.name}" in namespace "${item.namespace || 'default'}" uses ${item.currentApi} (removed in ${item.removedIn}). Replace with ${item.targetApi}.`,
      },
      locations: [location],
    };
  });

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Janos',
            version: getVersion(),
            informationUri: 'https://github.com/pgold30/janos',
            rules: Array.from(rulesMap.values()),
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

function formatReport(report, format = 'table') {
  switch (format.toLowerCase()) {
    case 'markdown':
    case 'md':
      return formatMarkdownTable(report);
    case 'json':
      return JSON.stringify(report, null, 2);
    case 'sarif':
      return formatSarif(report);
    case 'annotations':
      return formatGitHubAnnotations(report);
    case 'table':
    default:
      return formatAsciiTable(report);
  }
}

function shouldFailAudit(report, options = {}) {
  if (!report || !Array.isArray(report.items) || report.items.length === 0) {
    return false;
  }
  const failOn = options.failOn ? String(options.failOn).toLowerCase() : 'deprecated';
  if (failOn === 'removed') {
    return report.items.some((item) => item.status === 'REMOVED');
  }
  return report.items.length > 0;
}

module.exports = {
  auditFiles,
  auditContent,
  shouldFailAudit,
  formatReport,
  formatAsciiTable,
  formatMarkdownTable,
  formatGitHubAnnotations,
  formatSarif,
};
