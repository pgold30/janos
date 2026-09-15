/**
 * Copyright 2021, SumUp Ltd.
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

function isYamlDoc(obj) {
  return Boolean(obj && typeof obj.get === 'function' && typeof obj.set === 'function');
}

function getVal(doc, path) {
  if (!doc) return undefined;
  const parts = Array.isArray(path) ? path : [path];
  if (isYamlDoc(doc)) {
    const res = doc.getIn(parts);
    if (res === undefined || res === null) return res;
    return typeof res.toJS === 'function' ? res.toJS(doc) : res;
  }
  let current = doc;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function setVal(doc, path, value) {
  if (!doc) return;
  const parts = Array.isArray(path) ? path : [path];
  if (isYamlDoc(doc)) {
    doc.setIn(parts, value);
  } else {
    let current = doc;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = value;
  }
}

function deleteVal(doc, path) {
  if (!doc) return;
  const parts = Array.isArray(path) ? path : [path];
  if (isYamlDoc(doc)) {
    doc.deleteIn(parts);
  } else {
    let current = doc;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) return;
      current = current[parts[i]];
    }
    delete current[parts[parts.length - 1]];
  }
}

function normalizeKind(kind) {
  if (!kind || typeof kind !== 'string') return kind;
  const lower = kind.toLowerCase();
  const map = {
    deployment: 'Deployment',
    daemonset: 'DaemonSet',
    statefulset: 'StatefulSet',
    replicaset: 'ReplicaSet',
    networkpolicy: 'NetworkPolicy',
    podsecuritypolicy: 'PodSecurityPolicy',
    ingress: 'Ingress',
    ingressclass: 'IngressClass',
    horizontalpodautoscaler: 'HorizontalPodAutoscaler',
    certificatesigningrequest: 'CertificateSigningRequest',
    priorityclass: 'PriorityClass',
    priorityclasss: 'PriorityClass',
    lease: 'Lease',
    role: 'Role',
    rolebinding: 'RoleBinding',
    clusterrole: 'ClusterRole',
    clusterrolebinding: 'ClusterRoleBinding',
    customresourcedefinition: 'CustomResourceDefinition',
    validatingwebhookconfiguration: 'ValidatingWebhookConfiguration',
    mutatingwebhookconfiguration: 'MutatingWebhookConfiguration',
    csidriver: 'CSIDriver',
    csinode: 'CSINode',
    storageclass: 'StorageClass',
    volumeattachment: 'VolumeAttachment',
    csistoragecapacity: 'CSIStorageCapacity',
    apiservice: 'APIService',
    tokenreview: 'TokenReview',
    subjectaccessreview: 'SubjectAccessReview',
    localsubjectaccessreview: 'LocalSubjectAccessReview',
    selfsubjectaccessreview: 'SelfSubjectAccessReview',
    selfsubjectrulesreview: 'SelfSubjectRulesReview',
    cronjob: 'CronJob',
    poddisruptionbudget: 'PodDisruptionBudget',
    endpointslice: 'EndpointSlice',
    event: 'Event',
    runtimeclass: 'RuntimeClass',
    flowschema: 'FlowSchema',
    prioritylevelconfiguration: 'PriorityLevelConfiguration',
  };
  return map[lower] || kind;
}

function migrateIngressBackend(backend) {
  if (!backend || typeof backend !== 'object') return backend;
  if (backend.service) return backend;
  const { serviceName, servicePort, ...rest } = backend;
  if (serviceName !== undefined || servicePort !== undefined) {
    const port =
      typeof servicePort === 'number'
        ? { number: servicePort }
        : typeof servicePort === 'string' && /^\d+$/.test(servicePort)
          ? { number: parseInt(servicePort, 10) }
          : { name: servicePort };
    return {
      service: {
        name: serviceName,
        port,
      },
      ...rest,
    };
  }
  return backend;
}

function migrateIngress(doc) {
  const defaultBackend = getVal(doc, ['spec', 'backend']);
  if (defaultBackend) {
    const migrated = migrateIngressBackend(defaultBackend);
    deleteVal(doc, ['spec', 'backend']);
    setVal(doc, ['spec', 'defaultBackend'], migrated);
  }

  const rules = getVal(doc, ['spec', 'rules']);
  if (Array.isArray(rules)) {
    rules.forEach((rule, rIdx) => {
      if (rule && rule.http && Array.isArray(rule.http.paths)) {
        rule.http.paths.forEach((p, pIdx) => {
          if (!p.pathType) {
            setVal(doc, ['spec', 'rules', rIdx, 'http', 'paths', pIdx, 'pathType'], 'Prefix');
          }
          if (p.backend) {
            const migrated = migrateIngressBackend(p.backend);
            setVal(doc, ['spec', 'rules', rIdx, 'http', 'paths', pIdx, 'backend'], migrated);
          }
        });
      }
    });
  }
}

function migrateHPA(doc) {
  const metrics = getVal(doc, ['spec', 'metrics']);
  if (Array.isArray(metrics)) {
    metrics.forEach((m, idx) => {
      if (m && m.resource && m.resource.targetAverageUtilization !== undefined) {
        const util = m.resource.targetAverageUtilization;
        deleteVal(doc, ['spec', 'metrics', idx, 'resource', 'targetAverageUtilization']);
        setVal(doc, ['spec', 'metrics', idx, 'resource', 'target'], {
          type: 'Utilization',
          averageUtilization: util,
        });
      }
    });
  }
}

const MIGRATION_RULES = {
  Deployment: {
    legacy: ['extensions/v1beta1', 'apps/v1beta1', 'apps/v1beta2'],
    target: 'apps/v1',
  },
  DaemonSet: {
    legacy: ['extensions/v1beta1', 'apps/v1beta2'],
    target: 'apps/v1',
  },
  StatefulSet: {
    legacy: ['apps/v1beta1', 'apps/v1beta2'],
    target: 'apps/v1',
  },
  ReplicaSet: {
    legacy: ['extensions/v1beta1', 'apps/v1beta1', 'apps/v1beta2'],
    target: 'apps/v1',
  },
  NetworkPolicy: {
    legacy: ['extensions/v1beta1'],
    target: 'networking.k8s.io/v1',
  },
  PodSecurityPolicy: {
    legacy: ['extensions/v1beta1', 'apps/v1beta2'],
    target: 'policy/v1beta1',
    warning:
      'PodSecurityPolicy was completely removed in Kubernetes 1.25. Migrate to Pod Security Admission (pod-security.kubernetes.io labels).',
  },
  HorizontalPodAutoscaler: {
    legacy: ['autoscaling/v2beta1', 'autoscaling/v2beta2'],
    target: 'autoscaling/v2',
    transform: migrateHPA,
  },
  Ingress: {
    legacy: ['extensions/v1beta1', 'networking.k8s.io/v1beta1'],
    target: 'networking.k8s.io/v1',
    transform: migrateIngress,
  },
  IngressClass: {
    legacy: ['networking.k8s.io/v1beta1'],
    target: 'networking.k8s.io/v1',
  },
  CertificateSigningRequest: {
    legacy: ['certificates.k8s.io/v1beta1'],
    target: 'certificates.k8s.io/v1',
  },
  PriorityClass: {
    legacy: ['scheduling.k8s.io/v1beta1'],
    target: 'scheduling.k8s.io/v1',
  },
  Lease: {
    legacy: ['coordination.k8s.io/v1beta1'],
    target: 'coordination.k8s.io/v1',
  },
  Role: {
    legacy: ['rbac.authorization.k8s.io/v1alpha1', 'rbac.authorization.k8s.io/v1beta1'],
    target: 'rbac.authorization.k8s.io/v1',
  },
  RoleBinding: {
    legacy: ['rbac.authorization.k8s.io/v1alpha1', 'rbac.authorization.k8s.io/v1beta1'],
    target: 'rbac.authorization.k8s.io/v1',
  },
  ClusterRole: {
    legacy: ['rbac.authorization.k8s.io/v1alpha1', 'rbac.authorization.k8s.io/v1beta1'],
    target: 'rbac.authorization.k8s.io/v1',
  },
  ClusterRoleBinding: {
    legacy: ['rbac.authorization.k8s.io/v1alpha1', 'rbac.authorization.k8s.io/v1beta1'],
    target: 'rbac.authorization.k8s.io/v1',
  },
  CustomResourceDefinition: {
    legacy: ['apiextensions.k8s.io/v1beta1'],
    target: 'apiextensions.k8s.io/v1',
  },
  ValidatingWebhookConfiguration: {
    legacy: ['admissionregistration.k8s.io/v1beta1'],
    target: 'admissionregistration.k8s.io/v1',
  },
  MutatingWebhookConfiguration: {
    legacy: ['admissionregistration.k8s.io/v1beta1'],
    target: 'admissionregistration.k8s.io/v1',
  },
  CSIDriver: {
    legacy: ['storage.k8s.io/v1beta1'],
    target: 'storage.k8s.io/v1',
  },
  CSINode: {
    legacy: ['storage.k8s.io/v1beta1'],
    target: 'storage.k8s.io/v1',
  },
  StorageClass: {
    legacy: ['storage.k8s.io/v1beta1'],
    target: 'storage.k8s.io/v1',
  },
  VolumeAttachment: {
    legacy: ['storage.k8s.io/v1beta1'],
    target: 'storage.k8s.io/v1',
  },
  CSIStorageCapacity: {
    legacy: ['storage.k8s.io/v1beta1'],
    target: 'storage.k8s.io/v1',
  },
  APIService: {
    legacy: ['apiregistration.k8s.io/v1beta1'],
    target: 'apiregistration.k8s.io/v1',
  },
  TokenReview: {
    legacy: ['authentication.k8s.io/v1beta1'],
    target: 'authentication.k8s.io/v1',
  },
  SubjectAccessReview: {
    legacy: ['authorization.k8s.io/v1beta1'],
    target: 'authorization.k8s.io/v1',
  },
  LocalSubjectAccessReview: {
    legacy: ['authorization.k8s.io/v1beta1'],
    target: 'authorization.k8s.io/v1',
  },
  SelfSubjectAccessReview: {
    legacy: ['authorization.k8s.io/v1beta1'],
    target: 'authorization.k8s.io/v1',
  },
  SelfSubjectRulesReview: {
    legacy: ['authorization.k8s.io/v1beta1'],
    target: 'authorization.k8s.io/v1',
  },
  CronJob: {
    legacy: ['batch/v1beta1'],
    target: 'batch/v1',
  },
  PodDisruptionBudget: {
    legacy: ['policy/v1beta1'],
    target: 'policy/v1',
  },
  EndpointSlice: {
    legacy: ['discovery.k8s.io/v1beta1'],
    target: 'discovery.k8s.io/v1',
  },
  Event: {
    legacy: ['events.k8s.io/v1beta1'],
    target: 'events.k8s.io/v1',
  },
  RuntimeClass: {
    legacy: ['node.k8s.io/v1beta1'],
    target: 'node.k8s.io/v1',
  },
  FlowSchema: {
    legacy: [
      'flowcontrol.apiserver.k8s.io/v1beta1',
      'flowcontrol.apiserver.k8s.io/v1beta2',
      'flowcontrol.apiserver.k8s.io/v1beta3',
    ],
    target: 'flowcontrol.apiserver.k8s.io/v1',
  },
  PriorityLevelConfiguration: {
    legacy: [
      'flowcontrol.apiserver.k8s.io/v1beta1',
      'flowcontrol.apiserver.k8s.io/v1beta2',
      'flowcontrol.apiserver.k8s.io/v1beta3',
    ],
    target: 'flowcontrol.apiserver.k8s.io/v1',
  },
};

function parseDocs(docs, reporter) {
  if (!Array.isArray(docs)) {
    return [];
  }
  return docs
    .filter((doc) => doc != null)
    .map((doc) => replaceDeprecatedAPIs(doc, reporter))
    .map((doc) => addSpecSelector(doc, reporter));
}

function replaceDeprecatedAPIs(resource, reporter) {
  const rawKind = getVal(resource, 'kind');
  if (!rawKind) return resource;

  const kind = normalizeKind(rawKind);
  const rawApiVersion = getVal(resource, 'apiVersion');
  const apiVersion = typeof rawApiVersion === 'string' ? rawApiVersion.trim() : rawApiVersion;
  const name = getVal(resource, ['metadata', 'name']) || 'unnamed';

  const rule = MIGRATION_RULES[kind];
  if (rule) {
    if (rule.legacy.includes(apiVersion)) {
      if (reporter) {
        reporter({
          type: 'migrated',
          kind,
          name,
          from: apiVersion,
          to: rule.target,
          message: `Replace apiVersion for "${kind}" - "${name}" (${apiVersion} -> ${rule.target})`,
        });
      } else {
        console.log(`Replace apiVersion for "${kind}" - "${name}"`);
      }
      setVal(resource, 'apiVersion', rule.target);

      if (typeof rule.transform === 'function') {
        rule.transform(resource);
      }
    }

    if (rule.warning) {
      if (reporter) {
        reporter({
          type: 'warning',
          kind,
          name,
          message: rule.warning,
        });
      }
    }
  }

  return resource;
}

function addSpecSelector(resource, reporter) {
  const rawKind = getVal(resource, 'kind');
  if (!rawKind) return resource;

  const kind = normalizeKind(rawKind);
  const workloadKinds = ['Deployment', 'DaemonSet', 'StatefulSet', 'ReplicaSet'];

  if (workloadKinds.includes(kind)) {
    const selector = getVal(resource, ['spec', 'selector']);
    if (!selector) {
      const name = getVal(resource, ['metadata', 'name']) || 'unnamed';
      if (reporter) {
        reporter({
          type: 'selector',
          kind,
          name,
          message: `Adding spec.selector to "${kind}" - "${name}"`,
        });
      } else {
        console.log(`Adding spec.selector to "${kind}" - "${name}"`);
      }

      const templateLabels = getVal(resource, ['spec', 'template', 'metadata', 'labels']);
      let newSelector;
      if (templateLabels && typeof templateLabels === 'object' && Object.keys(templateLabels).length > 0) {
        newSelector = { matchLabels: { ...templateLabels } };
      } else {
        newSelector = { matchLabels: { app: name } };
      }
      setVal(resource, ['spec', 'selector'], newSelector);
    }
  }

  return resource;
}

module.exports = {
  parseDocs,
  replaceDeprecatedAPIs,
  addSpecSelector,
  normalizeKind,
  MIGRATION_RULES,
};
