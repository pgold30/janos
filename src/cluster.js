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

const { execFileSync } = require('child_process');
const yaml = require('./yaml');

const LAST_APPLIED = 'kubectl.kubernetes.io/last-applied-configuration';

/** Select the original applied manifest where kubectl stored one. */
function collectAuditSources(liveYaml) {
  const records = [];
  const coverage = { resources: 0, original: 0, liveOnly: 0, invalidOriginal: 0 };
  for (const document of yaml.parseDocuments(liveYaml)) {
    const root = yaml.toPlainObject(document);
    const resources = root && root.kind === 'List' && Array.isArray(root.items)
      ? root.items : [root];
    for (const live of resources) {
      if (!live || typeof live !== 'object' || !live.kind) continue;
      coverage.resources++;
      const stored = live.metadata && live.metadata.annotations &&
        live.metadata.annotations[LAST_APPLIED];
      if (stored === undefined) {
        coverage.liveOnly++;
        records.push({ resource: live, source: 'served API' });
        continue;
      }
      try {
        const original = JSON.parse(stored);
        const liveName = live.metadata && live.metadata.name;
        const originalName = original && original.metadata && original.metadata.name;
        const liveNamespace = live.metadata && live.metadata.namespace;
        const originalNamespace = original && original.metadata && original.metadata.namespace;
        if (!original || typeof original !== 'object' || Array.isArray(original) ||
            typeof original.apiVersion !== 'string' || original.kind !== live.kind ||
            !liveName || originalName !== liveName ||
            (originalNamespace && liveNamespace && originalNamespace !== liveNamespace)) {
          throw new Error('stored manifest does not match the live resource');
        }
        coverage.original++;
        records.push({ resource: original, source: 'last-applied' });
      } catch {
        coverage.invalidOriginal++;
        records.push({ resource: live, source: 'served API' });
      }
    }
  }
  return { records, coverage };
}

/**
 * Checks whether the kubectl binary is available in PATH.
 *
 * @returns {boolean}
 */
function isKubectlInstalled() {
  try {
    execFileSync('kubectl', ['version', '--client'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches resources from an active Kubernetes cluster via kubectl.
 *
 * @param {Object} [options]
 * @param {string} [options.namespace] Optional namespace filter
 * @param {string} [options.kubeconfig] Optional kubeconfig path
 * @returns {string} Multi-document YAML string
 */
function fetchClusterManifests(options = {}) {
  if (!isKubectlInstalled()) {
    throw new Error('"kubectl" CLI not found in PATH. Install kubectl to audit running clusters.');
  }

  const resources = [
    'deployments',
    'daemonsets',
    'statefulsets',
    'replicasets',
    'cronjobs',
    'ingresses',
    'horizontalpodautoscalers',
    'poddisruptionbudgets',
    'networkpolicies',
  ].join(',');

  const args = ['get', resources, '-o', 'yaml'];
  if (options.namespace) {
    args.push('-n', options.namespace);
  } else {
    args.push('-A');
  }

  if (options.kubeconfig) {
    args.push('--kubeconfig', options.kubeconfig);
  }

  try {
    return execFileSync('kubectl', args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const errorMsg = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Failed to query cluster via kubectl: ${errorMsg}`);
  }
}

module.exports = {
  isKubectlInstalled,
  fetchClusterManifests,
  collectAuditSources,
};
