const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const migration = require('./migration');

function migrate(resource) {
  const events = [];
  const [result] = migration.parseDocs([resource], { reporter: (event) => events.push(event) });
  return { result, events };
}

describe('schema-aware migration', () => {
  it('moves CRD v1beta1 fields into a served and stored v1 version', () => {
    const { result, events } = migrate({
      apiVersion: 'apiextensions.k8s.io/v1beta1', kind: 'CustomResourceDefinition',
      metadata: { name: 'widgets.example.com' },
      spec: {
        group: 'example.com', names: { kind: 'Widget', plural: 'widgets' }, scope: 'Namespaced', version: 'v1',
        validation: { openAPIV3Schema: { type: 'object' } },
        additionalPrinterColumns: [{ name: 'State', type: 'string', JSONPath: '.spec.state' }],
      },
    });
    assert.equal(result.apiVersion, 'apiextensions.k8s.io/v1');
    assert.equal(result.spec.scope, 'Namespaced');
    assert.equal(result.spec.version, undefined);
    assert.equal(result.spec.validation, undefined);
    assert.deepEqual(result.spec.versions[0].schema.openAPIV3Schema, { type: 'object' });
    assert.equal(result.spec.versions[0].served, true);
    assert.equal(result.spec.versions[0].storage, true);
    assert.equal(result.spec.versions[0].additionalPrinterColumns[0].jsonPath, '.spec.state');
    assert.equal(events[0].type, 'migrated');
  });

  it('leaves CRDs without structural schemas unchanged', () => {
    const { result, events } = migrate({
      apiVersion: 'apiextensions.k8s.io/v1beta1', kind: 'CustomResourceDefinition',
      spec: { group: 'example.com', names: { kind: 'Widget', plural: 'widgets' }, scope: 'Namespaced', version: 'v1' },
    });
    assert.equal(result.apiVersion, 'apiextensions.k8s.io/v1beta1');
    assert.equal(events[0].type, 'manual');
    assert.match(events[0].message, /schema\.openAPIV3Schema/);
  });

  it('does not guess CRD scope', () => {
    const { result, events } = migrate({
      apiVersion: 'apiextensions.k8s.io/v1beta1', kind: 'CustomResourceDefinition',
      spec: { group: 'example.com', names: { kind: 'Widget', plural: 'widgets' }, version: 'v1',
        validation: { openAPIV3Schema: { type: 'object' } } },
    });
    assert.equal(result.apiVersion, 'apiextensions.k8s.io/v1beta1');
    assert.match(events[0].message, /spec\.scope/);
  });

  it('leaves webhooks with unknown dry-run behavior unchanged', () => {
    const { result, events } = migrate({
      apiVersion: 'admissionregistration.k8s.io/v1beta1', kind: 'ValidatingWebhookConfiguration',
      webhooks: [{ name: 'validate.example.com', admissionReviewVersions: ['v1'],
        clientConfig: { url: 'https://example.com/validate' } }],
    });
    assert.equal(result.apiVersion, 'admissionregistration.k8s.io/v1beta1');
    assert.equal(events[0].type, 'manual');
    assert.match(events[0].message, /sideEffects/);
  });

  it('preserves v1beta1 webhook defaults when converting to v1', () => {
    const { result, events } = migrate({
      apiVersion: 'admissionregistration.k8s.io/v1beta1', kind: 'MutatingWebhookConfiguration',
      webhooks: [{ name: 'mutate.example.com', sideEffects: 'None',
        admissionReviewVersions: ['v1'], clientConfig: { url: 'https://example.com/mutate' } }],
    });
    assert.equal(events[0].type, 'migrated');
    assert.equal(result.apiVersion, 'admissionregistration.k8s.io/v1');
    assert.equal(result.webhooks[0].failurePolicy, 'Ignore');
    assert.equal(result.webhooks[0].matchPolicy, 'Exact');
    assert.equal(result.webhooks[0].timeoutSeconds, 30);
  });

  it('requires a valid CSR signer instead of guessing one', () => {
    const { result, events } = migrate({
      apiVersion: 'certificates.k8s.io/v1beta1', kind: 'CertificateSigningRequest',
      spec: { request: 'Y2VydA==', usages: ['client auth'] },
    });
    assert.equal(result.apiVersion, 'certificates.k8s.io/v1beta1');
    assert.match(events[0].message, /signerName/);
  });

  it('converts v2beta1 HPA object, pods, and external metrics', () => {
    const { result, events } = migrate({
      apiVersion: 'autoscaling/v2beta1', kind: 'HorizontalPodAutoscaler',
      spec: { metrics: [
        { type: 'Object', object: { target: { apiVersion: 'v1', kind: 'Service', name: 'api' },
          metricName: 'requests', targetValue: '10' } },
        { type: 'Pods', pods: { metricName: 'queue', targetAverageValue: '5' } },
        { type: 'External', external: { metricName: 'lag', targetAverageValue: '20' } },
      ] },
    });
    assert.equal(events[0].type, 'migrated');
    assert.equal(result.apiVersion, 'autoscaling/v2');
    assert.deepEqual(result.spec.metrics[0].object.describedObject,
      { apiVersion: 'v1', kind: 'Service', name: 'api' });
    assert.deepEqual(result.spec.metrics[0].object.metric, { name: 'requests' });
    assert.deepEqual(result.spec.metrics[0].object.target, { type: 'Value', value: '10' });
    assert.deepEqual(result.spec.metrics[1].pods.target, { type: 'AverageValue', averageValue: '5' });
    assert.deepEqual(result.spec.metrics[2].external.metric, { name: 'lag' });
  });

  it('leaves ambiguous HPA targets unchanged', () => {
    const { result, events } = migrate({
      apiVersion: 'autoscaling/v2beta1', kind: 'HorizontalPodAutoscaler',
      spec: { metrics: [{ type: 'Resource', resource: { name: 'cpu' } }] },
    });
    assert.equal(result.apiVersion, 'autoscaling/v2beta1');
    assert.equal(events[0].type, 'manual');
  });

  it('keeps explicit v2beta2 HPA metric targets in v2 form', () => {
    const { result, events } = migrate({
      apiVersion: 'autoscaling/v2beta2', kind: 'HorizontalPodAutoscaler',
      spec: { metrics: [{ type: 'Resource', resource: { name: 'cpu',
        target: { type: 'Utilization', averageUtilization: 70 } } }] },
    });
    assert.equal(events[0].type, 'migrated');
    assert.equal(result.apiVersion, 'autoscaling/v2');
    assert.deepEqual(result.spec.metrics[0].resource.target,
      { type: 'Utilization', averageUtilization: 70 });
  });

  it('fails check mode on a PSP without changing the source file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-psp-check-'));
    const file = path.join(dir, 'psp.yaml');
    const content = 'apiVersion: policy/v1beta1\nkind: PodSecurityPolicy\nmetadata:\n  name: restrictive\n';
    try {
      fs.writeFileSync(file, content);
      const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'janos.js'),
        '-f', file, '--check'], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stdout, /Pod Security Admission/);
      assert.equal(fs.readFileSync(file, 'utf8'), content);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
