/**
 * Copyright 2021-2026, Pablo Loschi
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

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const yaml = require('./yaml');
const migration = require('./migration');

describe('migration engine', () => {
  it('should migrate Kubernetes 1.16 workloads and add spec.selector', () => {
    const input = [
      {
        apiVersion: 'extensions/v1beta1',
        kind: 'Deployment',
        metadata: { name: 'my-deploy' },
        spec: {
          template: {
            metadata: { labels: { app: 'my-deploy' } },
          },
        },
      },
      {
        apiVersion: 'apps/v1beta2',
        kind: 'DaemonSet',
        metadata: { name: 'my-ds' },
        spec: {
          template: {
            metadata: { labels: { app: 'my-ds' } },
          },
        },
      },
      {
        apiVersion: 'apps/v1beta1',
        kind: 'StatefulSet',
        metadata: { name: 'my-sts' },
        spec: {
          template: {
            metadata: { labels: { app: 'my-sts' } },
          },
        },
      },
      {
        apiVersion: 'extensions/v1beta1',
        kind: 'ReplicaSet',
        metadata: { name: 'my-rs' },
        spec: {
          template: {
            metadata: { labels: { app: 'my-rs' } },
          },
        },
      },
    ];

    const output = migration.parseDocs(input);

    for (const doc of output) {
      assert.equal(doc.apiVersion, 'apps/v1');
      assert.ok(doc.spec.selector);
      assert.ok(doc.spec.selector.matchLabels);
      assert.equal(doc.spec.selector.matchLabels.app, doc.metadata.name);
    }
  });

  it('should migrate NetworkPolicy (1.16)', () => {
    const input = [{ apiVersion: 'extensions/v1beta1', kind: 'NetworkPolicy', metadata: { name: 'np' } }];
    const [output] = migration.parseDocs(input);
    assert.equal(output.apiVersion, 'networking.k8s.io/v1');
  });

  it('should warn and migrate PodSecurityPolicy (1.16 / 1.25 removal)', () => {
    const warnings = [];
    const reporter = (e) => {
      if (e.type === 'warning') warnings.push(e);
    };
    const input = [{ apiVersion: 'extensions/v1beta1', kind: 'PodSecurityPolicy', metadata: { name: 'psp' } }];
    const [output] = migration.parseDocs(input, reporter);
    assert.equal(output.apiVersion, 'policy/v1beta1');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /removed in Kubernetes 1.25/);
  });

  it('should migrate RBAC resources (1.17 and 1.22)', () => {
    const input = [
      { apiVersion: 'rbac.authorization.k8s.io/v1alpha1', kind: 'Role', metadata: { name: 'r' } },
      { apiVersion: 'rbac.authorization.k8s.io/v1beta1', kind: 'RoleBinding', metadata: { name: 'rb' } },
      { apiVersion: 'rbac.authorization.k8s.io/v1alpha1', kind: 'ClusterRole', metadata: { name: 'cr' } },
      { apiVersion: 'rbac.authorization.k8s.io/v1beta1', kind: 'ClusterRoleBinding', metadata: { name: 'crb' } },
    ];
    const output = migration.parseDocs(input);
    for (const doc of output) {
      assert.equal(doc.apiVersion, 'rbac.authorization.k8s.io/v1');
    }
  });

  it('should migrate Ingress structure, backend and pathType (1.22)', () => {
    const inputYaml = `
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: test-ingress
spec:
  backend:
    serviceName: root-service
    servicePort: 80
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /api
        backend:
          serviceName: api-service
          servicePort: 8080
      - path: /named
        backend:
          serviceName: named-service
          servicePort: http-port
`;
    const docs = yaml.parseDocuments(inputYaml);
    const [outputDoc] = migration.parseDocs(docs);
    const obj = yaml.toPlainObject(outputDoc);

    assert.equal(obj.apiVersion, 'networking.k8s.io/v1');
    assert.equal(obj.spec.backend, undefined);
    assert.deepEqual(obj.spec.defaultBackend, {
      service: {
        name: 'root-service',
        port: { number: 80 },
      },
    });

    const paths = obj.spec.rules[0].http.paths;
    assert.equal(paths[0].pathType, 'Prefix');
    assert.deepEqual(paths[0].backend, {
      service: {
        name: 'api-service',
        port: { number: 8080 },
      },
    });

    assert.equal(paths[1].pathType, 'Prefix');
    assert.deepEqual(paths[1].backend, {
      service: {
        name: 'named-service',
        port: { name: 'http-port' },
      },
    });
  });

  it('should migrate IngressClass, CRD, and Webhooks (1.22)', () => {
    const input = [
      { apiVersion: 'networking.k8s.io/v1beta1', kind: 'IngressClass', metadata: { name: 'ic' } },
      { apiVersion: 'apiextensions.k8s.io/v1beta1', kind: 'CustomResourceDefinition', metadata: { name: 'crd' } },
      { apiVersion: 'admissionregistration.k8s.io/v1beta1', kind: 'ValidatingWebhookConfiguration', metadata: { name: 'vwc' } },
      { apiVersion: 'admissionregistration.k8s.io/v1beta1', kind: 'MutatingWebhookConfiguration', metadata: { name: 'mwc' } },
    ];
    const output = migration.parseDocs(input);
    assert.equal(output[0].apiVersion, 'networking.k8s.io/v1');
    assert.equal(output[1].apiVersion, 'apiextensions.k8s.io/v1');
    assert.equal(output[2].apiVersion, 'admissionregistration.k8s.io/v1');
    assert.equal(output[3].apiVersion, 'admissionregistration.k8s.io/v1');
  });

  it('should migrate Storage, Lease, APIService, PriorityClass, CSR (1.22)', () => {
    const input = [
      { apiVersion: 'storage.k8s.io/v1beta1', kind: 'StorageClass', metadata: { name: 'sc' } },
      { apiVersion: 'storage.k8s.io/v1beta1', kind: 'CSIDriver', metadata: { name: 'cd' } },
      { apiVersion: 'storage.k8s.io/v1beta1', kind: 'CSINode', metadata: { name: 'cn' } },
      { apiVersion: 'storage.k8s.io/v1beta1', kind: 'VolumeAttachment', metadata: { name: 'va' } },
      { apiVersion: 'coordination.k8s.io/v1beta1', kind: 'Lease', metadata: { name: 'ls' } },
      { apiVersion: 'apiregistration.k8s.io/v1beta1', kind: 'APIService', metadata: { name: 'as' } },
      { apiVersion: 'scheduling.k8s.io/v1beta1', kind: 'PriorityClass', metadata: { name: 'pc' } },
      { apiVersion: 'certificates.k8s.io/v1beta1', kind: 'CertificateSigningRequest', metadata: { name: 'csr' } },
    ];
    const output = migration.parseDocs(input);
    assert.equal(output[0].apiVersion, 'storage.k8s.io/v1');
    assert.equal(output[1].apiVersion, 'storage.k8s.io/v1');
    assert.equal(output[2].apiVersion, 'storage.k8s.io/v1');
    assert.equal(output[3].apiVersion, 'storage.k8s.io/v1');
    assert.equal(output[4].apiVersion, 'coordination.k8s.io/v1');
    assert.equal(output[5].apiVersion, 'apiregistration.k8s.io/v1');
    assert.equal(output[6].apiVersion, 'scheduling.k8s.io/v1');
    assert.equal(output[7].apiVersion, 'certificates.k8s.io/v1');
  });

  it('should migrate Authentication and Authorization reviews (1.22)', () => {
    const input = [
      { apiVersion: 'authentication.k8s.io/v1beta1', kind: 'TokenReview', metadata: { name: 'tr' } },
      { apiVersion: 'authorization.k8s.io/v1beta1', kind: 'SubjectAccessReview', metadata: { name: 'sar' } },
      { apiVersion: 'authorization.k8s.io/v1beta1', kind: 'LocalSubjectAccessReview', metadata: { name: 'lsar' } },
    ];
    const output = migration.parseDocs(input);
    assert.equal(output[0].apiVersion, 'authentication.k8s.io/v1');
    assert.equal(output[1].apiVersion, 'authorization.k8s.io/v1');
    assert.equal(output[2].apiVersion, 'authorization.k8s.io/v1');
  });

  it('should migrate 1.25 removals: CronJob, PDB, EndpointSlice, Event, RuntimeClass', () => {
    const input = [
      { apiVersion: 'batch/v1beta1', kind: 'CronJob', metadata: { name: 'cj' } },
      { apiVersion: 'policy/v1beta1', kind: 'PodDisruptionBudget', metadata: { name: 'pdb' } },
      { apiVersion: 'discovery.k8s.io/v1beta1', kind: 'EndpointSlice', metadata: { name: 'es' } },
      { apiVersion: 'events.k8s.io/v1beta1', kind: 'Event', metadata: { name: 'ev' } },
      { apiVersion: 'node.k8s.io/v1beta1', kind: 'RuntimeClass', metadata: { name: 'rc' } },
    ];
    const output = migration.parseDocs(input);
    assert.equal(output[0].apiVersion, 'batch/v1');
    assert.equal(output[1].apiVersion, 'policy/v1');
    assert.equal(output[2].apiVersion, 'discovery.k8s.io/v1');
    assert.equal(output[3].apiVersion, 'events.k8s.io/v1');
    assert.equal(output[4].apiVersion, 'node.k8s.io/v1');
  });

  it('should migrate HorizontalPodAutoscaler to autoscaling/v2 (1.25/1.26)', () => {
    const input = [
      {
        apiVersion: 'autoscaling/v2beta1',
        kind: 'HorizontalPodAutoscaler',
        metadata: { name: 'hpa-v1' },
        spec: {
          metrics: [
            {
              type: 'Resource',
              resource: {
                name: 'cpu',
                targetAverageUtilization: 80,
              },
            },
          ],
        },
      },
      {
        apiVersion: 'autoscaling/v2beta2',
        kind: 'HorizontalPodAutoscaler',
        metadata: { name: 'hpa-v2' },
      },
    ];
    const output = migration.parseDocs(input);
    assert.equal(output[0].apiVersion, 'autoscaling/v2');
    assert.equal(output[0].spec.metrics[0].resource.targetAverageUtilization, undefined);
    assert.deepEqual(output[0].spec.metrics[0].resource.target, {
      type: 'Utilization',
      averageUtilization: 80,
    });
    assert.equal(output[1].apiVersion, 'autoscaling/v2');
  });

  it('should migrate CSIStorageCapacity (1.27)', () => {
    const input = [{ apiVersion: 'storage.k8s.io/v1beta1', kind: 'CSIStorageCapacity', metadata: { name: 'csc' } }];
    const [output] = migration.parseDocs(input);
    assert.equal(output.apiVersion, 'storage.k8s.io/v1');
  });

  it('should migrate FlowControl resources across 1.26, 1.29, 1.32', () => {
    const input = [
      { apiVersion: 'flowcontrol.apiserver.k8s.io/v1beta1', kind: 'FlowSchema', metadata: { name: 'fs1' } },
      { apiVersion: 'flowcontrol.apiserver.k8s.io/v1beta2', kind: 'FlowSchema', metadata: { name: 'fs2' } },
      { apiVersion: 'flowcontrol.apiserver.k8s.io/v1beta3', kind: 'PriorityLevelConfiguration', metadata: { name: 'plc' } },
    ];
    const output = migration.parseDocs(input);
    assert.equal(output[0].apiVersion, 'flowcontrol.apiserver.k8s.io/v1');
    assert.equal(output[1].apiVersion, 'flowcontrol.apiserver.k8s.io/v1');
    assert.equal(output[2].apiVersion, 'flowcontrol.apiserver.k8s.io/v1');
  });

  it('should preserve comments in YAML files', () => {
    const inputYaml = `# Header comment
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: backup-job # Inline comment
spec:
  schedule: "0 2 * * *"
`;
    const docs = yaml.parseDocuments(inputYaml);
    const migrated = migration.parseDocs(docs);
    const dumped = yaml.dumpDocuments(migrated);

    assert.match(dumped, /# Header comment/);
    assert.match(dumped, /# Inline comment/);
    assert.match(dumped, /apiVersion: batch\/v1/);
    assert.match(dumped, /schedule: "0 2 \* \* \*"/);
  });
});

describe('fixtures integration test', () => {
  it('should convert input.yaml into output.yaml', () => {
    const basePath = path.join(__dirname, '__tests__/fixtures');
    const input = yaml.readFile(`${basePath}/input.yaml`);
    const output = migration.parseDocs(input);
    const expected = yaml.readFile(`${basePath}/output.yaml`);

    const outputObjects = output.map(yaml.toPlainObject);
    const expectedObjects = expected.map(yaml.toPlainObject);

    assert.deepEqual(outputObjects, expectedObjects);
  });
});

describe('target version gating', () => {
  it('should gate migrations based on targetVersion', () => {
    const input = [
      // 1.16
      { apiVersion: 'extensions/v1beta1', kind: 'Deployment', metadata: { name: 'dep-116' }, spec: { template: { metadata: { labels: { app: 'dep' } } } } },
      // 1.22
      { apiVersion: 'extensions/v1beta1', kind: 'Ingress', metadata: { name: 'ing-122' }, spec: { backend: { serviceName: 'svc', servicePort: 80 } } },
      // 1.25
      { apiVersion: 'batch/v1beta1', kind: 'CronJob', metadata: { name: 'cron-125' } },
      // 1.26
      { apiVersion: 'autoscaling/v2beta2', kind: 'HorizontalPodAutoscaler', metadata: { name: 'hpa-126' } },
      // 1.32
      { apiVersion: 'flowcontrol.apiserver.k8s.io/v1beta3', kind: 'FlowSchema', metadata: { name: 'fs-132' } },
    ];

    // Gate at 1.22: only 1.16 and 1.22 should be migrated; 1.25, 1.26, 1.32 should remain unchanged
    const out122 = migration.parseDocs(input, { targetVersion: '1.22' });
    assert.equal(out122[0].apiVersion, 'apps/v1'); // migrated (1.16)
    assert.equal(out122[1].apiVersion, 'networking.k8s.io/v1'); // migrated (1.22)
    assert.equal(out122[2].apiVersion, 'batch/v1beta1'); // UNCHANGED (removed in 1.25)
    assert.equal(out122[3].apiVersion, 'autoscaling/v2beta2'); // UNCHANGED (removed in 1.26)
    assert.equal(out122[4].apiVersion, 'flowcontrol.apiserver.k8s.io/v1beta3'); // UNCHANGED (removed in 1.32)

    // Gate at 1.25: 1.16, 1.22, 1.25 migrated; 1.26 and 1.32 unchanged
    const out125 = migration.parseDocs(input, { targetVersion: '1.25' });
    assert.equal(out125[0].apiVersion, 'apps/v1'); // migrated
    assert.equal(out125[1].apiVersion, 'networking.k8s.io/v1'); // migrated
    assert.equal(out125[2].apiVersion, 'batch/v1'); // migrated (1.25)
    assert.equal(out125[3].apiVersion, 'autoscaling/v2beta2'); // UNCHANGED (1.26)
    assert.equal(out125[4].apiVersion, 'flowcontrol.apiserver.k8s.io/v1beta3'); // UNCHANGED (1.32)
  });
});
