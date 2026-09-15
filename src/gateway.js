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

/**
 * Converts an Ingress manifest to Gateway API resources (HTTPRoute and optional Gateway).
 * Inspired by kubernetes-sigs/ingress2gateway.
 *
 * @param {Object|YAML.Document} ingressResource
 * @param {Object} [options]
 * @param {string} [options.gatewayName]
 * @param {string} [options.gatewayNamespace]
 * @param {boolean} [options.generateGateway=true]
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

  // Determine Gateway name / parentRef
  const ingressClass =
    options.gatewayName ||
    spec.ingressClassName ||
    annotations['kubernetes.io/ingress.class'] ||
    'default-gateway';

  const hostnames = [];
  const rules = [];

  // 1. Process rules
  if (Array.isArray(spec.rules)) {
    for (const rule of spec.rules) {
      if (rule.host && !hostnames.includes(rule.host)) {
        hostnames.push(rule.host);
      }

      if (rule.http && Array.isArray(rule.http.paths)) {
        for (const p of rule.http.paths) {
          const pathType = p.pathType === 'Exact' ? 'Exact' : 'PathPrefix';
          const pathValue = p.path || '/';

          const backend = p.backend || {};
          let serviceName = backend.serviceName;
          let servicePort = backend.servicePort;

          if (backend.service) {
            serviceName = backend.service.name;
            const portVal = backend.service.port;
            if (portVal) {
              servicePort = portVal.number || portVal.name || portVal;
            }
          }

          const ruleItem = {
            matches: [
              {
                path: {
                  type: pathType,
                  value: pathValue,
                },
              },
            ],
            backendRefs: [],
          };

          if (serviceName) {
            ruleItem.backendRefs.push({
              name: serviceName,
              port: typeof servicePort === 'number' ? servicePort : parseInt(servicePort, 10) || 80,
            });
          }

          // Check for rewrite-target annotation
          const rewriteTarget =
            annotations['nginx.ingress.kubernetes.io/rewrite-target'] ||
            annotations['ingress.kubernetes.io/rewrite-target'];
          if (rewriteTarget) {
            ruleItem.filters = [
              {
                type: 'URLRewrite',
                urlRewrite: {
                  path: {
                    type: 'ReplacePrefixMatch',
                    replacePrefixMatch: rewriteTarget,
                  },
                },
              },
            ];
          }

          rules.push(ruleItem);
        }
      }
    }
  }

  // 2. Default backend
  const defaultBackend = spec.defaultBackend || spec.backend;
  if (defaultBackend) {
    let defName = defaultBackend.serviceName;
    let defPort = defaultBackend.servicePort;
    if (defaultBackend.service) {
      defName = defaultBackend.service.name;
      const p = defaultBackend.service.port;
      defPort = p ? p.number || p.name || p : 80;
    }
    if (defName) {
      rules.push({
        matches: [
          {
            path: {
              type: 'PathPrefix',
              value: '/',
            },
          },
        ],
        backendRefs: [
          {
            name: defName,
            port: typeof defPort === 'number' ? defPort : parseInt(defPort, 10) || 80,
          },
        ],
      });
    }
  }

  const parentRef = { name: ingressClass };
  if (options.gatewayNamespace) {
    parentRef.namespace = options.gatewayNamespace;
  }

  const httpRoute = {
    apiVersion: 'gateway.networking.k8s.io/v1',
    kind: 'HTTPRoute',
    metadata: {
      name: meta.name ? `${meta.name}-route` : 'ingress-route',
      ...(meta.namespace ? { namespace: meta.namespace } : {}),
      ...(meta.labels ? { labels: { ...meta.labels } } : {}),
    },
    spec: {
      parentRefs: [parentRef],
      ...(hostnames.length > 0 ? { hostnames } : {}),
      rules,
    },
  };

  const results = [httpRoute];

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
      spec.tls.forEach((tlsEntry, idx) => {
        const listenerName = tlsEntry.secretName
          ? `https-${tlsEntry.secretName}`
          : `https-${idx + 1}`;
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
        if (Array.isArray(tlsEntry.hosts) && tlsEntry.hosts.length > 0) {
          listener.hostname = tlsEntry.hosts[0];
        }
        listeners.push(listener);
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
