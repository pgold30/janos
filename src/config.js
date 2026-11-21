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

/**
 * Built-in rules for widely used Kubernetes ecosystem CRDs (opt-in via --include-ecosystem or .janos.yaml).
 * Each rule matches on both `kind` and `legacy` apiVersion so shared Kind names (e.g. Istio Gateway vs
 * Kubernetes Gateway API Gateway) never collide.
 */
const ECOSYSTEM_RULES = [
  // cert-manager
  ...['Certificate', 'Issuer', 'ClusterIssuer', 'CertificateRequest'].map((kind) => ({
    kind,
    legacy: ['cert-manager.io/v1alpha2', 'cert-manager.io/v1alpha3', 'cert-manager.io/v1beta1'],
    target: 'cert-manager.io/v1',
    removedIn: '1.25',
    ecosystem: 'cert-manager',
  })),
  ...['Order', 'Challenge'].map((kind) => ({
    kind,
    legacy: ['acme.cert-manager.io/v1alpha2', 'acme.cert-manager.io/v1alpha3', 'acme.cert-manager.io/v1beta1'],
    target: 'acme.cert-manager.io/v1',
    removedIn: '1.25',
    ecosystem: 'cert-manager',
  })),

  // External Secrets Operator
  ...['ExternalSecret', 'SecretStore', 'ClusterSecretStore'].map((kind) => ({
    kind,
    legacy: ['external-secrets.io/v1alpha1', 'external-secrets.io/v1beta1'],
    target: 'external-secrets.io/v1',
    removedIn: '1.33',
    ecosystem: 'external-secrets',
  })),

  // Traefik (containo.us -> traefik.io)
  ...['IngressRoute', 'IngressRouteTCP', 'IngressRouteUDP', 'Middleware', 'TLSOption', 'ServersTransport'].map((kind) => ({
    kind,
    legacy: ['traefik.containo.us/v1alpha1'],
    target: 'traefik.io/v1alpha1',
    removedIn: '1.30',
    ecosystem: 'traefik',
  })),

  // Istio
  ...['VirtualService', 'DestinationRule', 'Gateway', 'ServiceEntry', 'Sidecar'].map((kind) => ({
    kind,
    legacy: ['networking.istio.io/v1alpha3', 'networking.istio.io/v1beta1'],
    target: 'networking.istio.io/v1',
    removedIn: '1.32',
    ecosystem: 'istio',
  })),
  ...['AuthorizationPolicy', 'PeerAuthentication', 'RequestAuthentication'].map((kind) => ({
    kind,
    legacy: ['security.istio.io/v1beta1'],
    target: 'security.istio.io/v1',
    removedIn: '1.32',
    ecosystem: 'istio',
  })),

  // Kyverno
  ...['ClusterPolicy', 'Policy'].map((kind) => ({
    kind,
    legacy: ['kyverno.io/v1alpha2'],
    target: 'kyverno.io/v1',
    removedIn: '1.30',
    ecosystem: 'kyverno',
  })),
];

function validateCustomRules(rawRules, sourceLabel) {
  if (rawRules === undefined || rawRules === null) return [];
  if (!Array.isArray(rawRules)) {
    throw new Error(`Invalid "rules" in ${sourceLabel}: expected a YAML list.`);
  }
  return rawRules.map((rule, idx) => {
    if (!rule || typeof rule !== 'object') {
      throw new Error(`Invalid rule at index ${idx} in ${sourceLabel}: expected an object.`);
    }
    const kind = typeof rule.kind === 'string' ? rule.kind.trim() : '';
    const legacy = Array.isArray(rule.legacy)
      ? rule.legacy.map((v) => String(v).trim()).filter(Boolean)
      : typeof rule.legacy === 'string' && rule.legacy.trim()
        ? [rule.legacy.trim()]
        : [];
    const target = typeof rule.target === 'string' ? rule.target.trim() : '';
    if (!kind || legacy.length === 0 || !target) {
      throw new Error(
        `Invalid rule at index ${idx} in ${sourceLabel}: "kind", non-empty "legacy", and "target" are required.`,
      );
    }
    return {
      kind,
      legacy,
      target,
      removedIn: rule.removedIn ? String(rule.removedIn).replace(/^v/, '').trim() : '1.35',
      warning: rule.warning || null,
      custom: true,
    };
  });
}

function findConfigFile(startDir) {
  const base = startDir || process.cwd();
  for (const name of ['.janos.yaml', '.janos.yml']) {
    const candidate = path.join(base, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/**
 * Loads a .janos.yaml / .janos.yml config file if present or explicitly provided.
 *
 * @param {string} [startDir]
 * @param {string} [explicitPath]
 * @returns {Object}
 */
function loadConfig(startDir, explicitPath) {
  let configPath = null;
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(`Config file not found: ${explicitPath}`);
    }
    configPath = explicitPath;
  } else {
    configPath = findConfigFile(startDir);
  }

  if (!configPath) {
    return { configPath: null, includeEcosystem: false, rules: [] };
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const docs = yaml.parseDocuments(content);
  const raw = docs.length > 0 ? yaml.toPlainObject(docs[0]) : {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Invalid config in ${configPath}: expected a YAML mapping.`);
  }

  const rules = validateCustomRules(raw.rules, configPath);

  if (raw.failOn && !['removed', 'deprecated'].includes(String(raw.failOn).toLowerCase())) {
    throw new Error(`Invalid "failOn" in ${configPath}: must be "removed" or "deprecated".`);
  }

  return {
    configPath,
    includeEcosystem: Boolean(raw.includeEcosystem || raw['include-ecosystem']),
    targetVersion: raw.targetVersion || raw['target-version'] || undefined,
    failOn: raw.failOn || raw['fail-on'] ? String(raw.failOn || raw['fail-on']).toLowerCase() : undefined,
    ignore: Array.isArray(raw.ignore) ? raw.ignore.join(',') : raw.ignore,
    rules,
  };
}

/**
 * Builds the list of extra rules (ecosystem + custom) from CLI/config options.
 *
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
function getExtraRules(options = {}) {
  const list = [];
  if (options.includeEcosystem) {
    list.push(...ECOSYSTEM_RULES);
  }
  if (Array.isArray(options.customRules) && options.customRules.length > 0) {
    list.push(...options.customRules);
  }
  return list;
}

module.exports = {
  ECOSYSTEM_RULES,
  loadConfig,
  findConfigFile,
  validateCustomRules,
  getExtraRules,
};
