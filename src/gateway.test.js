/**
 * Copyright 2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { convertIngressToGateway } = require('./gateway');

describe('Ingress to Gateway API converter', () => {
  it('should convert standard Ingress to HTTPRoute', () => {
    const ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'web-store',
        namespace: 'production',
        labels: { app: 'store' },
        annotations: {
          'kubernetes.io/ingress.class': 'traefik-gateway',
        },
      },
      spec: {
        rules: [
          {
            host: 'shop.example.com',
            http: {
              paths: [
                {
                  path: '/items',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: 'items-service',
                      port: { number: 8080 },
                    },
                  },
                },
                {
                  path: '/checkout',
                  pathType: 'Exact',
                  backend: {
                    serviceName: 'checkout-service',
                    servicePort: 9000,
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const [route] = convertIngressToGateway(ingress);
    assert.equal(route.apiVersion, 'gateway.networking.k8s.io/v1');
    assert.equal(route.kind, 'HTTPRoute');
    assert.equal(route.metadata.name, 'web-store-route');
    assert.equal(route.metadata.namespace, 'production');
    assert.deepEqual(route.spec.parentRefs, [{ name: 'traefik-gateway' }]);
    assert.deepEqual(route.spec.hostnames, ['shop.example.com']);

    const rules = route.spec.rules;
    assert.equal(rules.length, 2);

    assert.equal(rules[0].matches[0].path.type, 'PathPrefix');
    assert.equal(rules[0].matches[0].path.value, '/items');
    assert.deepEqual(rules[0].backendRefs, [{ name: 'items-service', port: 8080 }]);

    assert.equal(rules[1].matches[0].path.type, 'Exact');
    assert.equal(rules[1].matches[0].path.value, '/checkout');
    assert.deepEqual(rules[1].backendRefs, [{ name: 'checkout-service', port: 9000 }]);
  });

  it('should translate URLRewrite annotation if present', () => {
    const ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'api',
        annotations: {
          'nginx.ingress.kubernetes.io/rewrite-target': '/v2/$1',
        },
      },
      spec: {
        rules: [
          {
            http: {
              paths: [
                {
                  path: '/api/v1/(.*)',
                  backend: { service: { name: 'api-svc', port: { number: 80 } } },
                },
              ],
            },
          },
        ],
      },
    };

    const [route] = convertIngressToGateway(ingress);
    assert.equal(route.spec.rules[0].filters[0].type, 'URLRewrite');
    assert.equal(
      route.spec.rules[0].filters[0].urlRewrite.path.replacePrefixMatch,
      '/v2/$1',
    );
  });

  it('should generate companion Gateway resource when generateGateway is true', () => {
    const ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'secure-app',
        namespace: 'default',
      },
      spec: {
        ingressClassName: 'cilium',
        tls: [
          {
            hosts: ['secure.example.com'],
            secretName: 'secure-cert-tls',
          },
        ],
        rules: [
          {
            host: 'secure.example.com',
            http: {
              paths: [{ path: '/', backend: { service: { name: 'app', port: { number: 80 } } } }],
            },
          },
        ],
      },
    };

    const resources = convertIngressToGateway(ingress, { generateGateway: true });
    assert.equal(resources.length, 2);

    const [route, gateway] = resources;
    assert.equal(route.kind, 'HTTPRoute');
    assert.equal(gateway.kind, 'Gateway');
    assert.equal(gateway.metadata.name, 'cilium');
    assert.equal(gateway.spec.gatewayClassName, 'cilium');

    const listeners = gateway.spec.listeners;
    assert.equal(listeners.length, 2);
    assert.equal(listeners[0].port, 80);
    assert.equal(listeners[1].port, 443);
    assert.equal(listeners[1].protocol, 'HTTPS');
    assert.equal(listeners[1].tls.certificateRefs[0].name, 'secure-cert-tls');
  });

  it('should translate ssl-redirect annotation into RequestRedirect filter', () => {
    const ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'ssl-app',
        annotations: {
          'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
        },
      },
      spec: {
        rules: [
          {
            http: {
              paths: [{ path: '/', backend: { service: { name: 'app', port: { number: 80 } } } }],
            },
          },
        ],
      },
    };

    const [route] = convertIngressToGateway(ingress);
    const filter = route.spec.rules[0].filters.find((f) => f.type === 'RequestRedirect');
    assert.ok(filter);
    assert.equal(filter.requestRedirect.scheme, 'https');
    assert.equal(filter.requestRedirect.port, 443);
    assert.equal(filter.requestRedirect.statusCode, 301);
  });
});
