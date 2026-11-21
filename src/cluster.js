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
const zlib = require('zlib');
const yaml = require('./yaml');

const LAST_APPLIED = 'kubectl.kubernetes.io/last-applied-configuration';

/**
 * Decodes a Helm v3 release Secret (type: helm.sh/release.v1) into its parsed release object.
 * Helm v3 encodes secret.data.release as base64(base64(gzip(json))) in Kubernetes API output.
 *
 * @param {Object} secret Kubernetes Secret object
 * @returns {Object|null} Parsed Helm release object or null if invalid/non-Helm
 */
function decodeHelmReleaseSecret(secret) {
  if (!secret || secret.kind !== 'Secret') return null;
  if (secret.type !== 'helm.sh/release.v1') return null;
  const encoded = secret.data && secret.data.release;
  if (typeof encoded !== 'string' || !encoded.trim()) return null;

  try {
    // Kubernetes Secret data is base64-encoded; Helm's storage driver also base64-encodes the gzip payload.
    const firstPass = Buffer.from(encoded, 'base64');
    let gzipped = firstPass;
    // Check gzip magic bytes (0x1f 0x8b); if not gzip yet, decode the second base64 layer.
    if (firstPass.length < 2 || firstPass[0] !== 0x1f || firstPass[1] !== 0x8b) {
      gzipped = Buffer.from(firstPass.toString('utf8'), 'base64');
    }
    const jsonBytes =
      gzipped.length >= 2 && gzipped[0] === 0x1f && gzipped[1] === 0x8b
        ? zlib.gunzipSync(gzipped)
        : gzipped;
    const release = JSON.parse(jsonBytes.toString('utf8'));
    if (!release || typeof release !== 'object') return null;
    return release;
  } catch {
    return null;
  }
}

/**
 * Extracts original manifests from Helm v3 release Secrets (YAML or JSON List).
 * Only includes deployed releases by default (or all releases if options.allReleases is true).
 *
 * @param {string} secretsYaml Multi-doc YAML/JSON output from `kubectl get secrets -l owner=helm`
 * @param {Object} [options]
 * @returns {{ records: Array<{ resource: Object, source: string }>, releasesScanned: number, invalidReleases: number }}
 */
function collectHelmReleaseSources(secretsYaml, options = {}) {
  const records = [];
  let releasesScanned = 0;
  let invalidReleases = 0;

  for (const document of yaml.parseDocuments(secretsYaml)) {
    const root = yaml.toPlainObject(document);
    const items = root && root.kind === 'List' && Array.isArray(root.items)
      ? root.items
      : [root];

    for (const secret of items) {
      if (!secret || secret.kind !== 'Secret' || secret.type !== 'helm.sh/release.v1') continue;
      const release = decodeHelmReleaseSecret(secret);
      if (!release) {
        invalidReleases++;
        continue;
      }
      const status = release.info && release.info.status;
      if (!options.allReleases && status && status !== 'deployed') {
        continue;
      }
      releasesScanned++;
      if (typeof release.manifest !== 'string' || !release.manifest.trim()) continue;

      const relLabel = `helm:${release.namespace || 'default'}/${release.name || 'release'}@v${release.version || '?'}`;
      try {
        for (const doc of yaml.parseDocuments(release.manifest)) {
          const obj = yaml.toPlainObject(doc);
          if (obj && typeof obj === 'object' && obj.kind) {
            records.push({ resource: obj, source: relLabel });
          }
        }
      } catch {
        invalidReleases++;
      }
    }
  }

  return { records, releasesScanned, invalidReleases };
}

/**
 * Fetches Helm v3 release Secrets from an active Kubernetes cluster via kubectl.
 */
function fetchHelmReleaseSecrets(options = {}) {
  if (!isKubectlInstalled()) {
    throw new Error('"kubectl" CLI not found in PATH. Install kubectl to audit running clusters.');
  }

  const args = ['get', 'secrets', '-l', 'owner=helm', '-o', 'yaml'];
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
    throw new Error(`Failed to query Helm release secrets via kubectl: ${errorMsg}`);
  }
}

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
    'endpointslices',
    'roles',
    'rolebindings',
    'leases',
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

const CLUSTER_SCOPED_RESOURCES = [
  'customresourcedefinitions',
  'validatingwebhookconfigurations',
  'mutatingwebhookconfigurations',
  'ingressclasses',
  'priorityclasses',
  'storageclasses',
  'csidrivers',
  'csinodes',
  'runtimeclasses',
  'clusterroles',
  'clusterrolebindings',
  'flowschemas',
  'prioritylevelconfigurations',
];

/**
 * Fetches cluster-scoped Kubernetes resources via kubectl.
 * Queries each resource kind resiliently so RBAC restrictions or older API servers
 * missing a kind do not abort the entire cluster audit.
 *
 * @param {Object} [options]
 * @returns {{ yaml: string, skipped: Array<string> }}
 */
function fetchClusterScopedManifests(options = {}) {
  if (!isKubectlInstalled()) {
    throw new Error('"kubectl" CLI not found in PATH. Install kubectl to audit running clusters.');
  }

  const chunks = [];
  const skipped = [];
  const baseArgs = options.kubeconfig ? ['--kubeconfig', options.kubeconfig] : [];

  for (const kind of CLUSTER_SCOPED_RESOURCES) {
    try {
      const out = execFileSync('kubectl', ['get', kind, '-o', 'yaml', ...baseArgs], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (out && out.trim()) {
        chunks.push(out.trim());
      }
    } catch {
      skipped.push(kind);
    }
  }

  return {
    yaml: chunks.join('\n---\n'),
    skipped,
  };
}

/**
 * Validates a YAML manifest string against a Kubernetes API server using
 * `kubectl apply --dry-run=server -f -` without persisting any changes.
 *
 * @param {string} manifestYaml
 * @param {Object} [options]
 * @returns {{ ok: boolean, output?: string, error?: string }}
 */
function validateManifestServerDryRun(manifestYaml, options = {}) {
  if (!isKubectlInstalled()) {
    return {
      ok: false,
      error: '"kubectl" CLI not found in PATH. Install kubectl to run --validate server dry-run.',
    };
  }

  const args = ['apply', '--dry-run=server', '-f', '-'];
  if (options.namespace) {
    args.push('-n', options.namespace);
  }
  if (options.kubeconfig) {
    args.push('--kubeconfig', options.kubeconfig);
  }

  try {
    const out = execFileSync('kubectl', args, {
      input: manifestYaml,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, output: out.trim() };
  } catch (err) {
    const errorMsg = err.stderr ? err.stderr.toString().trim() : err.message;
    return { ok: false, error: errorMsg };
  }
}

module.exports = {
  CLUSTER_SCOPED_RESOURCES,
  isKubectlInstalled,
  fetchClusterManifests,
  fetchClusterScopedManifests,
  validateManifestServerDryRun,
  collectAuditSources,
  decodeHelmReleaseSecret,
  collectHelmReleaseSources,
  fetchHelmReleaseSecrets,
};
