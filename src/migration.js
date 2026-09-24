/**
 * Copyright 2021-2026, Pablo Loschi
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

function parseVersion(v) {
  if (typeof v === 'number') return v;
  if (!v || typeof v !== 'string') return 999.0;
  const cleaned = v.replace(/^v/, '').trim();
  const match = cleaned.match(/^(\d+)\.(\d+)/);
  if (!match) return 999.0;
  return parseFloat(`${match[1]}.${match[2]}`);
}

function parseVersionNum(vStr) {
  if (!vStr) return 9999;
  const match = String(vStr).replace(/^v/, '').match(/^(\d+)\.(\d+)/);
  if (!match) return 9999;
  return parseInt(match[1], 10) * 1000 + parseInt(match[2], 10);
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

function getRemovalVersion(kind, apiVersion) {
  const norm = normalizeKind(kind);
  const v = typeof apiVersion === 'string' ? apiVersion.trim() : apiVersion;

  if (norm === 'HorizontalPodAutoscaler') {
    if (v === 'autoscaling/v2beta1') return 1.25;
    if (v === 'autoscaling/v2beta2') return 1.26;
  }
  if (norm === 'FlowSchema' || norm === 'PriorityLevelConfiguration') {
    if (v === 'flowcontrol.apiserver.k8s.io/v1beta1') return 1.26;
    if (v === 'flowcontrol.apiserver.k8s.io/v1beta2') return 1.29;
    if (v === 'flowcontrol.apiserver.k8s.io/v1beta3') return 1.32;
  }
  if (norm === 'Role' || norm === 'RoleBinding' || norm === 'ClusterRole' || norm === 'ClusterRoleBinding') {
    if (v === 'rbac.authorization.k8s.io/v1alpha1') return 1.17;
    return 1.22;
  }
  if (['Deployment', 'DaemonSet', 'StatefulSet', 'ReplicaSet', 'NetworkPolicy'].includes(norm)) {
    return 1.16;
  }
  if (norm === 'PodSecurityPolicy') {
    return 1.25;
  }
  if (['CronJob', 'PodDisruptionBudget', 'EndpointSlice', 'Event', 'RuntimeClass'].includes(norm)) {
    return 1.25;
  }
  if (norm === 'CSIStorageCapacity') {
    return 1.27;
  }
  return 1.22;
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

function manual(message) {
  return { error: message, updates: [], deletes: [] };
}

function metricTarget(source) {
  if (source.target && source.target.type) {
    const field = { Utilization: 'averageUtilization', AverageValue: 'averageValue', Value: 'value' }[source.target.type];
    return field && source.target[field] !== undefined ? source.target : null;
  }
  const choices = [
    ['targetAverageUtilization', 'Utilization', 'averageUtilization'],
    ['targetAverageValue', 'AverageValue', 'averageValue'],
    ['targetValue', 'Value', 'value'],
  ].filter(([field]) => source[field] !== undefined);
  if (choices.length !== 1) return null;
  const [field, type, targetField] = choices[0];
  return { type, [targetField]: source[field] };
}

function planHPA(resource, apiVersion) {
  const metrics = getVal(resource, ['spec', 'metrics']);
  if (metrics === undefined) return { updates: [], deletes: [] };
  if (!Array.isArray(metrics)) return manual('spec.metrics must be a list.');

  const converted = [];
  for (const metric of metrics) {
    if (!metric || typeof metric !== 'object') return manual('spec.metrics contains an invalid metric.');
    const sourceKey = {
      Resource: 'resource', ContainerResource: 'containerResource',
      Object: 'object', Pods: 'pods', External: 'external',
    }[metric.type];
    const source = sourceKey && metric[sourceKey];
    if (!source || typeof source !== 'object') {
      return manual(`spec.metrics contains an unsupported ${metric.type || 'unknown'} metric.`);
    }
    const target = metricTarget(source);
    if (!target) return manual(`${metric.type} metric needs one explicit target value.`);

    const nextSource = { ...source, target };
    delete nextSource.targetAverageUtilization;
    delete nextSource.targetAverageValue;
    delete nextSource.targetValue;

    if (apiVersion === 'autoscaling/v2beta1' && ['Object', 'Pods', 'External'].includes(metric.type)) {
      if (!source.metricName) return manual(`${metric.type} metric needs metricName.`);
      nextSource.metric = {
        name: source.metricName,
        ...(source.selector || source.metricSelector
          ? { selector: source.selector || source.metricSelector } : {}),
      };
      delete nextSource.metricName;
      delete nextSource.selector;
      delete nextSource.metricSelector;
      if (metric.type === 'Object') {
        if (!source.target || source.target.type) return manual('Object metric needs an object reference.');
        nextSource.describedObject = source.target;
        nextSource.target = target;
      }
    }
    converted.push({ ...metric, [sourceKey]: nextSource });
  }
  return { updates: [[['spec', 'metrics'], converted]], deletes: [] };
}

function planCRD(resource) {
  const spec = getVal(resource, 'spec');
  if (!spec || !spec.group || !spec.names || !spec.names.kind || !spec.names.plural) {
    return manual('CRD needs spec.group, spec.names.kind, spec.names.plural, and a structural schema.');
  }
  if (!['Namespaced', 'Cluster'].includes(spec.scope)) {
    return manual('CRD needs an explicit spec.scope of Namespaced or Cluster; Janos cannot infer scope.');
  }
  if (spec.preserveUnknownFields === true) {
    return manual('spec.preserveUnknownFields: true needs a manual structural schema migration.');
  }
  let versions = Array.isArray(spec.versions) ? spec.versions.map((v) => ({ ...v })) : null;
  if (!versions || versions.length === 0) {
    if (!spec.version) return manual('CRD needs spec.version or spec.versions.');
    versions = [{ name: spec.version, served: true, storage: true }];
  }
  const updates = [];
  const deletes = [];
  const converted = versions.map((version) => {
    const next = { ...version };
    if (versions.length === 1) {
      if (next.served === undefined) next.served = true;
      if (next.storage === undefined) next.storage = true;
    }
    if (!next.schema && spec.validation) next.schema = spec.validation;
    if (!next.subresources && spec.subresources) next.subresources = spec.subresources;
    if (!next.additionalPrinterColumns && spec.additionalPrinterColumns) {
      next.additionalPrinterColumns = spec.additionalPrinterColumns;
    }
    if (Array.isArray(next.additionalPrinterColumns)) {
      next.additionalPrinterColumns = next.additionalPrinterColumns.map((column) => {
        const updated = { ...column };
        if (updated.JSONPath !== undefined && updated.jsonPath === undefined) {
          updated.jsonPath = updated.JSONPath;
        }
        delete updated.JSONPath;
        return updated;
      });
    }
    return next;
  });
  if (converted.some((version) => !version.name || typeof version.served !== 'boolean' ||
      typeof version.storage !== 'boolean' || !version.schema || !version.schema.openAPIV3Schema)) {
    return manual('Every CRD version needs name, served, storage, and schema.openAPIV3Schema.');
  }
  if (converted.filter((version) => version.storage).length !== 1) {
    return manual('Exactly one CRD version must have storage: true.');
  }
  if (new Set(converted.map((version) => version.name)).size !== converted.length ||
      !converted.some((version) => version.served)) {
    return manual('CRD version names must be unique and at least one version must be served.');
  }
  updates.push([['spec', 'versions'], converted]);
  for (const field of ['version', 'validation', 'subresources', 'additionalPrinterColumns', 'preserveUnknownFields']) {
    if (spec[field] !== undefined) deletes.push(['spec', field]);
  }
  if (spec.conversion && spec.conversion.strategy === 'Webhook') {
    const webhook = spec.conversion.webhook || {};
    const clientConfig = webhook.clientConfig || spec.conversion.webhookClientConfig;
    const reviewVersions = webhook.conversionReviewVersions || spec.conversion.conversionReviewVersions;
    if (!clientConfig || !Array.isArray(reviewVersions) || reviewVersions.length === 0) {
      return manual('CRD conversion webhook needs clientConfig and conversionReviewVersions.');
    }
    updates.push([['spec', 'conversion', 'webhook'], { ...webhook, clientConfig,
      conversionReviewVersions: reviewVersions }]);
    for (const field of ['webhookClientConfig', 'conversionReviewVersions']) {
      if (spec.conversion[field] !== undefined) deletes.push(['spec', 'conversion', field]);
    }
  }
  return { updates, deletes };
}

function planWebhook(resource) {
  const webhooks = getVal(resource, 'webhooks');
  if (!Array.isArray(webhooks) || webhooks.length === 0) return manual('webhooks must be a non-empty list.');
  const names = new Set();
  const converted = [];
  for (const webhook of webhooks) {
    if (!webhook || !webhook.name || names.has(webhook.name)) {
      return manual('Webhook names must be present and unique.');
    }
    names.add(webhook.name);
    if (!['None', 'NoneOnDryRun'].includes(webhook.sideEffects)) {
      return manual(`${webhook.name} needs sideEffects: None or NoneOnDryRun; this cannot be inferred.`);
    }
    if (!Array.isArray(webhook.admissionReviewVersions) || webhook.admissionReviewVersions.length === 0 ||
        webhook.admissionReviewVersions.some((version) => !['v1', 'v1beta1'].includes(version))) {
      return manual(`${webhook.name} needs supported admissionReviewVersions.`);
    }
    if (!webhook.clientConfig || (!webhook.clientConfig.service && !webhook.clientConfig.url)) {
      return manual(`${webhook.name} needs a webhook clientConfig.`);
    }
    converted.push({ failurePolicy: 'Ignore', matchPolicy: 'Exact', timeoutSeconds: 30, ...webhook });
  }
  return { updates: [[['webhooks'], converted]], deletes: [] };
}

const CSR_USAGES = new Set([
  'signing', 'digital signature', 'content commitment', 'key encipherment',
  'key agreement', 'data encipherment', 'cert sign', 'crl sign', 'encipher only',
  'decipher only', 'any', 'server auth', 'client auth', 'code signing',
  'email protection', 's/mime', 'ipsec end system', 'ipsec tunnel',
  'ipsec user', 'timestamping', 'ocsp signing', 'microsoft sgc', 'netscape sgc',
]);

function planCSR(resource) {
  const spec = getVal(resource, 'spec');
  if (!spec || !spec.signerName || spec.signerName === 'kubernetes.io/legacy-unknown') {
    return manual('CSR needs an explicit v1 spec.signerName; Janos cannot choose a signer.');
  }
  if (!spec.request) return manual('CSR needs spec.request.');
  if (!Array.isArray(spec.usages) || spec.usages.length === 0 ||
      spec.usages.some((usage) => !CSR_USAGES.has(usage)) ||
      new Set(spec.usages).size !== spec.usages.length) {
    return manual('CSR needs non-empty, distinct, supported spec.usages.');
  }
  const conditions = getVal(resource, ['status', 'conditions']);
  if (Array.isArray(conditions) && (conditions.some((condition) => !condition.type || !condition.status) ||
      new Set(conditions.map((condition) => condition.type)).size !== conditions.length)) {
    return manual('CSR status.conditions needs unique types and explicit statuses.');
  }
  return { updates: [], deletes: [] };
}

function planSchemaMigration(resource, kind, apiVersion) {
  if (kind === 'PodSecurityPolicy') {
    return manual('PodSecurityPolicy has no replacement API. Migrate its policy to Pod Security Admission or another admission controller.');
  }
  if (kind === 'CustomResourceDefinition') return planCRD(resource);
  if (kind === 'ValidatingWebhookConfiguration' || kind === 'MutatingWebhookConfiguration') {
    return planWebhook(resource);
  }
  if (kind === 'CertificateSigningRequest') return planCSR(resource);
  if (kind === 'HorizontalPodAutoscaler') return planHPA(resource, apiVersion);
  return { updates: [], deletes: [] };
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
    legacy: ['extensions/v1beta1', 'policy/v1beta1'],
    target: 'Pod Security Admission (manual)',
  },
  HorizontalPodAutoscaler: {
    legacy: ['autoscaling/v2beta1', 'autoscaling/v2beta2'],
    target: 'autoscaling/v2',
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

function parseDocs(docs, optionsOrReporter) {
  if (!Array.isArray(docs)) {
    return [];
  }

  let options = {};
  if (typeof optionsOrReporter === 'function') {
    options = { reporter: optionsOrReporter };
  } else if (optionsOrReporter && typeof optionsOrReporter === 'object') {
    options = { ...optionsOrReporter };
  }

  return docs
    .filter((doc) => doc != null)
    .map((doc) => replaceDeprecatedAPIs(doc, options))
    .map((doc) => addSpecSelector(doc, options.reporter));
}

function replaceDeprecatedAPIs(resource, reporterOrOptions, targetVersionArg) {
  const rawKind = getVal(resource, 'kind');
  if (!rawKind) return resource;

  let reporter = null;
  let targetVersion = targetVersionArg;
  let annotate = false;
  let annotateInline = false;

  if (typeof reporterOrOptions === 'function') {
    reporter = reporterOrOptions;
  } else if (reporterOrOptions && typeof reporterOrOptions === 'object') {
    reporter = reporterOrOptions.reporter;
    targetVersion = reporterOrOptions.targetVersion !== undefined ? reporterOrOptions.targetVersion : targetVersionArg;
    annotate = Boolean(reporterOrOptions.annotate || reporterOrOptions.stamp);
    annotateInline = Boolean(reporterOrOptions.annotateInline || reporterOrOptions['annotate-inline']);
  }

  const kind = normalizeKind(rawKind);
  const rawApiVersion = getVal(resource, 'apiVersion');
  const apiVersion = typeof rawApiVersion === 'string' ? rawApiVersion.trim() : rawApiVersion;
  const name = getVal(resource, ['metadata', 'name']) || 'unnamed';

  const rule = MIGRATION_RULES[kind];
  if (rule && rule.legacy.includes(apiVersion)) {
    const removalVer = getRemovalVersion(kind, apiVersion);

    if (targetVersion) {
      const maxVer = parseVersionNum(targetVersion);
      if (parseVersionNum(removalVer) > maxVer) {
        // Target version is lower than when this API was removed; skip upgrading it.
        return resource;
      }
    }

    const plan = planSchemaMigration(resource, kind, apiVersion);
    if (plan.error) {
      const message = `${kind} "${name}" (${apiVersion}): ${plan.error}`;
      if (reporter) reporter({ type: 'manual', kind, name, message });
      else console.warn(message);
      return resource;
    }

    if (reporter) {
      reporter({
        type: 'migrated',
        kind,
        name,
        from: apiVersion,
        to: rule.target,
        removedIn: removalVer,
        message: `Replace apiVersion for "${kind}" - "${name}" (${apiVersion} -> ${rule.target}) [v${removalVer}]`,
      });
    } else {
      console.log(`Replace apiVersion for "${kind}" - "${name}"`);
    }

    setVal(resource, 'apiVersion', rule.target);

    for (const [fieldPath, value] of plan.updates) setVal(resource, fieldPath, value);
    for (const fieldPath of plan.deletes) deleteVal(resource, fieldPath);

    if (annotateInline && isYamlDoc(resource)) {
      const apiNode = resource.get('apiVersion', true);
      if (apiNode) {
        apiNode.comment = ` [janos]: migrated from ${apiVersion}`;
      }
    }

    if (annotate) {
      const today = new Date().toISOString().split('T')[0];
      setVal(resource, ['metadata', 'annotations', 'janos.io/migrated-from'], apiVersion);
      setVal(resource, ['metadata', 'annotations', 'janos.io/migrated-at'], today);
      setVal(resource, ['metadata', 'annotations', 'janos.io/upgraded-by'], 'janos');
    }

    if (typeof rule.transform === 'function') {
      rule.transform(resource);
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
  getRemovalVersion,
  parseVersion,
  parseVersionNum,
  MIGRATION_RULES,
};
