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

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MIGRATION_RULES, normalizeKind, getRemovalVersion, parseVersionNum } = require('./migration');

/**
 * Checks if a directory is a Helm chart (contains Chart.yaml or Chart.yml).
 *
 * @param {string} dirPath
 * @returns {boolean}
 */
function isHelmChart(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') return false;
  try {
    return (
      fs.existsSync(path.join(dirPath, 'Chart.yaml')) ||
      fs.existsSync(path.join(dirPath, 'Chart.yml'))
    );
  } catch {
    return false;
  }
}

/**
 * Checks whether the helm binary is available in PATH.
 *
 * @returns {boolean}
 */
function isHelmInstalled() {
  try {
    execSync('helm version --short', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders a Helm chart into a multi-document YAML stream using 'helm template'.
 *
 * @param {string} chartPath
 * @param {Object} [options]
 * @returns {string} Rendered YAML stream
 */
function renderChart(chartPath, options = {}) {
  const releaseName = options.releaseName || 'janos-release';
  let cmd = `helm template ${releaseName} "${chartPath}"`;

  if (options.values) {
    cmd += ` -f "${options.values}"`;
  }
  if (options.kubeVersion) {
    cmd += ` --kube-version "${options.kubeVersion}"`;
  }

  try {
    return execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch (err) {
    const errorMsg = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Failed to render Helm chart at "${chartPath}": ${errorMsg}`);
  }
}

/**
 * Checks whether file content contains Helm / Go template interpolations (e.g. {{ ... }}).
 *
 * @param {string} content
 * @returns {boolean}
 */
function isHelmTemplate(content) {
  if (typeof content !== 'string') return false;
  return /\{\{[-]?\s*.*?\s*[-]?\}\}/s.test(content);
}

/**
 * Audits unrendered Helm templates by scanning for apiVersion and kind declarations.
 *
 * @param {string} content
 * @param {string} [filePath]
 * @returns {Array<Object>} Deprecated items found
 */
function auditHelmTemplate(content, filePath = 'template.yaml', options = {}) {
  const lines = content.split(/\r?\n/);
  const items = [];

  let currentKind = null;
  let currentName = 'unnamed';
  let currentApi = null;

  function flushResource() {
    if (currentKind && currentApi && MIGRATION_RULES[currentKind]) {
      const rule = MIGRATION_RULES[currentKind];
      if (rule.legacy.includes(currentApi)) {
        const removedIn = getRemovalVersion(currentKind, currentApi);
        const remVer = parseVersionNum(removedIn);
        const targetVer = options.targetVersion
          ? parseVersionNum(options.targetVersion)
          : parseVersionNum('1.32');
        const status = remVer <= targetVer ? 'REMOVED' : 'DEPRECATED';

        items.push({
          kind: currentKind,
          name: currentName,
          namespace: 'default',
          currentApi,
          targetApi: rule.target,
          removedIn: `v${removedIn}`,
          status,
          file: filePath,
          warning: rule.warning || null,
          isHelmTemplate: true,
        });
      }
    }
    currentKind = null;
    currentName = 'unnamed';
    currentApi = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^---\s*$/.test(line)) {
      flushResource();
      continue;
    }

    const apiMatch = line.match(/^\s*apiVersion:\s*["']?([A-Za-z0-9_./-]+)["']?/);
    if (apiMatch) {
      currentApi = apiMatch[1].trim();
    }

    const kindMatch = line.match(/^\s*kind:\s*["']?([A-Za-z0-9_-]+)["']?/);
    if (kindMatch) {
      currentKind = normalizeKind(kindMatch[1]);
    }

    const nameMatch = line.match(/^\s*name:\s*["']?([^\s"'{}]+)["']?/);
    if (nameMatch) {
      currentName = nameMatch[1];
    }
  }

  flushResource();
  return items;
}

/**
 * Line-based migrator for unrendered Helm templates containing Go syntax.
 * Replaces deprecated apiVersion lines while preserving all Go templating blocks byte-for-byte.
 *
 * @param {string} content
 * @param {Object} [options]
 * @returns {{ content: string, changed: boolean, events: Array }}
 */
function migrateHelmTemplate(content, options = {}) {
  const lines = content.split(/\r?\n/);
  const events = [];
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const apiMatch = line.match(/^(\s*)apiVersion:\s*["']?([A-Za-z0-9_./-]+)["']?/);
    if (apiMatch) {
      const indent = apiMatch[1];
      const apiVersion = apiMatch[2].trim();

      // Lookahead or lookbehind for kind within +/- 10 lines
      let kind = null;
      for (let j = Math.max(0, i - 10); j <= Math.min(lines.length - 1, i + 10); j++) {
        const km = lines[j].match(/^\s*kind:\s*["']?([A-Za-z0-9_-]+)["']?/);
        if (km) {
          kind = normalizeKind(km[1]);
          break;
        }
      }

      if (kind && MIGRATION_RULES[kind]) {
        const rule = MIGRATION_RULES[kind];
        if (rule.legacy.includes(apiVersion)) {
          lines[i] = `${indent}apiVersion: ${rule.target}`;
          changed = true;
          events.push({
            type: 'migrated',
            message: `Replace apiVersion for "${kind}" in Helm template: ${apiVersion} -> ${rule.target}`,
          });
        }
      }
    }
  }

  return {
    content: lines.join('\n'),
    changed,
    events,
  };
}

module.exports = {
  isHelmChart,
  isHelmInstalled,
  renderChart,
  isHelmTemplate,
  auditHelmTemplate,
  migrateHelmTemplate,
};
