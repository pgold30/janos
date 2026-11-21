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

const yaml = require('./yaml');

function isYamlDoc(obj) {
  return Boolean(obj && typeof obj.get === 'function' && typeof obj.set === 'function');
}

function toJS(doc) {
  if (!doc) return doc;
  if (typeof doc.toJS === 'function') {
    return doc.toJS();
  }
  return doc;
}

const UNSUPPORTED_NGINX_ANNOTATIONS = [
  'nginx.ingress.kubernetes.io/configuration-snippet',
  'nginx.ingress.kubernetes.io/server-snippet',
  'nginx.ingress.kubernetes.io/auth-url',
  'nginx.ingress.kubernetes.io/auth-type',
  'nginx.ingress.kubernetes.io/canary',
  'nginx.ingress.kubernetes.io/limit-rps',
  'nginx.ingress.kubernetes.io/proxy-body-size',
  'nginx.ingress.kubernetes.io/affinity',
];

function sanitizeNamePart(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'host';
}

function parseRedirectUrl(rawUrl) {
  const redirect = { statusCode: 301 };
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return redirect;
  try {
    const parsed = new URL(rawUrl.trim());
    const scheme = parsed.protocol.replace(/:$/, '');
    if (scheme === 'http' || scheme === 'https') {
      redirect.scheme = scheme;
    }
    if (parsed.hostname) {
      redirect.hostname = parsed.hostname;
    }
    if (parsed.port) {
      redirect.port = parseInt(parsed.port, 10);
    }
    if (parsed.pathname && parsed.pathname !== '/') {
      redirect.path = {
        type: 'ReplaceFullPath',
        replaceFullPath: parsed.pathname,
      };
    }
  } catch {
    if (rawUrl.startsWith('/')) {
      redirect.path = {
        type: 'ReplaceFullPath',
        replaceFullPath: rawUrl,
      };
    }
  }
  return redirect;
}

function extractBackendRef(backend, reporter, ingressName) {
  let serviceName = backend.serviceName;
  let servicePort = backend.servicePort;

  if (backend.service) {
    serviceName = backend.service.name;
    const portVal = backend.service.port;
    if (portVal) {
      servicePort = portVal.number || portVal.name || portVal;
    }
  }

  if (!serviceName) return null;

  let numericPort;
  if (typeof servicePort === 'number') {
    numericPort = servicePort;
  } else if (typeof servicePort === 'string' && /^\d+$/.test(servicePort)) {
    numericPort = parseInt(servicePort, 10);
  } else {
    if (servicePort && reporter) {
      reporter({
        type: 'warning',
        message: `Ingress "${ingressName}" backend "${serviceName}" uses named port "${servicePort}"; Gateway API requires a numeric port (defaulted to 80 — verify before applying).`,
      });
    }
    numericPort = 80;
  }

  return { name: serviceName, port: numericPort };
}

function buildFilters(annotations, reporter, ingressName) {
  const filters = [];

  const rewriteTarget =
    annotations['nginx.ingress.kubernetes.io/rewrite-target'] ||
    annotations['ingress.kubernetes.io/rewrite-target'];
  if (rewriteTarget) {
    if (/\$\d+/.test(rewriteTarget) && reporter) {
      reporter({
        type: 'warning',
        message: `Ingress "${ingressName}" uses regex capture group in rewrite-target ("${rewriteTarget}"); Gateway API ReplacePrefixMatch does literal prefix replacement — review manually or use ingress2gateway.`,
      });
    }
    filters.push({
      type: 'URLRewrite',
      urlRewrite: {
        path: {
          type: 'ReplacePrefixMatch',
          replacePrefixMatch: rewriteTarget,
        },
      },
    });
  }

  const sslRedirect =
    annotations['nginx.ingress.kubernetes.io/ssl-redirect'] ||
    annotations['ingress.kubernetes.io/ssl-redirect'];
  if (sslRedirect === 'true' || sslRedirect === true) {
    filters.push({
      type: 'RequestRedirect',
      requestRedirect: {
        scheme: 'https',
        statusCode: 301,
        port: 443,
      },
    });
  }

  const permRedirect =
    annotations['nginx.ingress.kubernetes.io/permanent-redirect'] ||
    annotations['ingress.kubernetes.io/permanent-redirect'];
  if (permRedirect) {
    filters.push({
      type: 'RequestRedirect',
      requestRedirect: parseRedirectUrl(permRedirect),
    });
  }

  return filters;
}

/**
 * Converts an Ingress manifest to Gateway API resources (HTTPRoute and optional Gateway).
 * Inspired by kubernetes-sigs/ingress2gateway.
 *
 * @param {Object|YAML.Document} ingressResource
 * @param {Object} [options]
 * @param {string} [options.gatewayName]
 * @param {string} [options.gatewayNamespace]
 * @param {boolean} [options.generateGateway=false]
 * @param {Function} [options.reporter]
 * @returns {Array<Object>} Generated Gateway API resources
 */
function convertIngressToGateway(ingressResource, options = {}) {
  const ingress = toJS(ingressResource);
  if (!ingress || ingress.kind !== 'Ingress') {
    return [];
  }

  const meta = ingress.metadata || {};
  const spec = ingress.spec || {};
  const annotations = meta.annotations || {};
  const reporter = typeof options.reporter === 'function' ? options.reporter : null;
  const ingressName = meta.name || 'ingress';

  if (reporter) {
    for (const unsupported of UNSUPPORTED_NGINX_ANNOTATIONS) {
      if (annotations[unsupported] !== undefined) {
        reporter({
          type: 'warning',
          message: `Ingress "${ingressName}" has provider-specific annotation "${unsupported}" which Janos cannot translate equivalently; consider ingress2gateway or manual policy migration.`,
        });
      }
    }
  }

  // Determine Gateway name / parentRef
  const ingressClass =
    options.gatewayName ||
    spec.ingressClassName ||
    annotations['kubernetes.io/ingress.class'] ||
    'default-gateway';

  // Group rules by host so distinct hosts get isolated HTTPRoutes
  const hostGroups = new Map();
  const baseFilters = buildFilters(annotations, reporter, ingressName);
  const useRegex =
    annotations['nginx.ingress.kubernetes.io/use-regex'] === 'true' ||
    annotations['nginx.ingress.kubernetes.io/use-regex'] === true;
  const proxyReadTimeout = annotations['nginx.ingress.kubernetes.io/proxy-read-timeout'];
  const backendTimeout =
    proxyReadTimeout && /^\d+$/.test(String(proxyReadTimeout).trim())
      ? `${String(proxyReadTimeout).trim()}s`
      : null;

  if (Array.isArray(spec.rules)) {
    for (const rule of spec.rules) {
      const hostKey = rule.host || '';
      if (!hostGroups.has(hostKey)) {
        hostGroups.set(hostKey, []);
      }
      const groupRules = hostGroups.get(hostKey);

      if (rule.http && Array.isArray(rule.http.paths)) {
        for (const p of rule.http.paths) {
          const pathType = useRegex
            ? 'RegularExpression'
            : p.pathType === 'Exact'
              ? 'Exact'
              : 'PathPrefix';
          const pathValue = p.path || '/';
          const backendRef = extractBackendRef(p.backend || {}, reporter, ingressName);

          const ruleItem = {
            matches: [
              {
                path: {
                  type: pathType,
                  value: pathValue,
                },
              },
            ],
            backendRefs: backendRef ? [backendRef] : [],
          };

          if (baseFilters.length > 0) {
            ruleItem.filters = baseFilters.map((f) => JSON.parse(JSON.stringify(f)));
          }

          if (backendTimeout) {
            ruleItem.timeouts = { backendRequest: backendTimeout };
          }

          groupRules.push(ruleItem);
        }
      }
    }
  }

  // 2. Default backend
  const defaultBackend = spec.defaultBackend || spec.backend;
  let defaultRule = null;
  if (defaultBackend) {
    const backendRef = extractBackendRef(defaultBackend, reporter, ingressName);
    if (backendRef) {
      defaultRule = {
        matches: [
          {
            path: {
              type: 'PathPrefix',
              value: '/',
            },
          },
        ],
        backendRefs: [backendRef],
      };
    }
  }

  const parentRef = { name: ingressClass };
  if (options.gatewayNamespace) {
    parentRef.namespace = options.gatewayNamespace;
  }

  const distinctHosts = Array.from(hostGroups.keys()).filter(Boolean);
  const splitByHost = distinctHosts.length > 1;
  const results = [];

  const makeRoute = (routeName, hostnames, routeRules) => ({
    apiVersion: 'gateway.networking.k8s.io/v1',
    kind: 'HTTPRoute',
    metadata: {
      name: routeName,
      ...(meta.namespace ? { namespace: meta.namespace } : {}),
      ...(meta.labels ? { labels: { ...meta.labels } } : {}),
      ...(options.annotate || options.stamp ? {
        annotations: {
          'janos.io/migrated-from': 'networking.k8s.io/v1/Ingress',
          'janos.io/migrated-at': new Date().toISOString().split('T')[0],
          'janos.io/upgraded-by': 'janos',
        },
      } : {}),
    },
    spec: {
      parentRefs: [{ ...parentRef }],
      ...(hostnames.length > 0 ? { hostnames } : {}),
      rules: routeRules,
    },
  });

  if (splitByHost) {
    for (const [hostKey, groupRules] of hostGroups.entries()) {
      const routeName = hostKey
        ? `${ingressName}-${sanitizeNamePart(hostKey)}-route`
        : `${ingressName}-default-route`;
      const routeRules = [...groupRules];
      if (!hostKey && defaultRule) {
        routeRules.push(defaultRule);
        defaultRule = null;
      }
      results.push(makeRoute(routeName, hostKey ? [hostKey] : [], routeRules));
    }
    if (defaultRule) {
      results.push(makeRoute(`${ingressName}-default-route`, [], [defaultRule]));
    }
  } else {
    const allRules = [];
    for (const groupRules of hostGroups.values()) {
      allRules.push(...groupRules);
    }
    if (defaultRule) {
      allRules.push(defaultRule);
    }
    const routeName = meta.name ? `${meta.name}-route` : 'ingress-route';
    results.push(makeRoute(routeName, distinctHosts, allRules));
  }

  // 3. Optional Gateway resource generation
  if (options.generateGateway) {
    const listeners = [
      {
        name: 'http',
        port: 80,
        protocol: 'HTTP',
        allowedRoutes: {
          namespaces: {
            from: 'Same',
          },
        },
      },
    ];

    if (Array.isArray(spec.tls) && spec.tls.length > 0) {
      const usedListenerNames = new Set(['http']);
      spec.tls.forEach((tlsEntry, idx) => {
        const baseName = tlsEntry.secretName
          ? `https-${tlsEntry.secretName}`
          : `https-${idx + 1}`;
        const tlsHosts = Array.isArray(tlsEntry.hosts) && tlsEntry.hosts.length > 0
          ? tlsEntry.hosts
          : [null];

        tlsHosts.forEach((host, hIdx) => {
          let listenerName = tlsHosts.length === 1 ? baseName : `${baseName}-${hIdx + 1}`;
          while (usedListenerNames.has(listenerName)) {
            listenerName += '-x';
          }
          usedListenerNames.add(listenerName);

          const listener = {
            name: listenerName,
            port: 443,
            protocol: 'HTTPS',
            tls: {
              mode: 'Terminate',
              certificateRefs: [
                {
                  name: tlsEntry.secretName || 'default-cert',
                },
              ],
            },
          };
          if (host) {
            listener.hostname = host;
          }
          listeners.push(listener);
        });
      });
    }

    const gateway = {
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'Gateway',
      metadata: {
        name: ingressClass,
        ...(meta.namespace ? { namespace: meta.namespace } : {}),
      },
      spec: {
        gatewayClassName: ingressClass,
        listeners,
      },
    };

    results.push(gateway);
  }

  return results;
}

module.exports = {
  convertIngressToGateway,
};
