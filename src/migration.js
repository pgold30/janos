/**
 * Copyright 2021, SumUp Ltd.
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
function parseDocs(docs) {
  return docs.map(replaceDeprecatedAPIs).map(addSpecSelector);
}

function replaceDeprecatedAPIs(resource) {
  const result = { ...resource };
  let legacyAPIs;
  switch (result.kind) {
    case 'Deployment':
    case 'Daemonset':
    case 'Statefulset':
    case 'ReplicaSet':
      legacyAPIs = ['extensions/v1beta1', 'apps/v1beta1', 'apps/v1beta2'];
      if (legacyAPIs.includes(result.apiVersion)) {
        console.log(
          `Replace apiVersion for "${resource.kind}" - "${resource.metadata.name}"`,
        );
        result.apiVersion = 'apps/v1';
      }
      break;

    case 'PodSecurityPolicy':
      legacyAPIs = ['extensions/v1beta1', 'apps/v1beta2'];
      if (legacyAPIs.includes(result.apiVersion)) {
        console.log(
          `Replace apiVersion for "${resource.kind}" - "${resource.metadata.name}"`,
        );
        result.apiVersion = 'policy/v1beta1';
      }
      break;

    case 'HorizontalPodAutoscaler':
      legacyAPIs = ['autoscaling/v2beta1'];
      if (legacyAPIs.includes(result.apiVersion)) {
        console.log(
          `Replace apiVersion for "${resource.kind}" - "${resource.metadata.name}"`,
        );
        result.apiVersion = 'autoscaling/v2beta2';
      }
      break;

    case 'Ingress':
      legacyAPIs = ['extensions/v1beta1', 'networking.k8s.io/v1beta1 '];
      if (legacyAPIs.includes(result.apiVersion)) {
        console.log(
          `Replace apiVersion for "${resource.kind}" - "${resource.metadata.name}"`,
        );
        result.apiVersion = 'networking.k8s.io/v1';
      }
      break;

    case 'CertificateSigningRequest':
      legacyAPIs = ['certificates.k8s.io/v1beta1'];
      if (legacyAPIs.includes(result.apiVersion)) {
        console.log(
          `Replace apiVersion for "${resource.kind}" - "${resource.metadata.name}"`,
        );
        result.apiVersion = 'certificates.k8s.io/v1';
      }
    break;  

    case 'PriorityClasss':
      legacyAPIs = ['scheduling.k8s.io/v1beta1'];
      if (legacyAPIs.includes(result.apiVersion)) {
        console.log(
          `Replace apiVersion for "${resource.kind}" - "${resource.metadata.name}"`,
        );
        result.apiVersion = 'scheduling.k8s.io/v1';
      }
    break;

    case 'Lease':
      legacyAPIs = ['coordination.k8s.io/v1beta1'];
      if (legacyAPIs.includes(result.apiVersion)) {
        console.log(
          `Replace apiVersion for "${resource.kind}" - "${resource.metadata.name}"`,
        );
        result.apiVersion = 'coordination.k8s.io/v1';
      }
    break;    

    case 'Role':
    case 'RoleBinding':
    case 'ClusterRole':
    case 'ClusterRoleBinding':
      legacyAPIs = [
        'rbac.authorization.k8s.io/v1alpha1',
        'rbac.authorization.k8s.io/v1beta1',
      ];
      if (legacyAPIs.includes(result.apiVersion)) {
        console.log(
          `Replace apiVersion for "${resource.kind}" - "${resource.metadata.name}"`,
        );
        result.apiVersion = 'rbac.authorization.k8s.io/v1';
      }
      break;

      case 'CustomResourceDefinition':
      case 'TokenReview':
      case 'SubjectAccessReview':
      case 'LocalSubjectAccessReview':
        legacyAPIs = ['apiextensions.k8s.io/v1beta1'];
        if (legacyAPIs.includes(result.apiVersion)) {
          console.log(
            `Replace apiVersion for "${resource.kind}" - "${resource.metadata.name}"`,
          );
          result.apiVersion = 'apiextensions.k8s.io/v1';
        }
 
      case 'ValidatingWebhookConfiguration':
      case 'MutatingWebhookConfiguration':
        legacyAPIs = ['admissionregistration.k8s.io/v1beta1'];
        if (legacyAPIs.includes(result.apiVersion)) {
          console.log(
            `Replace apiVersion for "${resource.kind}" - "${resource.metadata.name}"`,
          );
          result.apiVersion = 'admissionregistration.k8s.io/v1';
        }
        
      case 'CSIDriver':
      case 'CSINode':
      case 'StorageClass':
        legacyAPIs = ['VolumeAttachmentstorage.k8s.io/v1beta1'];
        if (legacyAPIs.includes(result.apiVersion)) {
          console.log(
            `Replace apiVersion for "${resource.kind}" - "${resource.metadata.name}"`,
          );
          result.apiVersion = 'storage.k8s.io/v1';
        }

      break;
                
    default:
  }

  return result;
}

function addSpecSelector(resource) {
  const result = { ...resource };
  const kinds = ['Deployment', 'Daemonset', 'Statefulset', 'ReplicaSet'];
  if (kinds.includes(result.kind) && !result.spec.selector) {
    console.log(
      `Adding spec.selector to "${result.kind}" - "${result.metadata.name}"`,
    );
    const labels = { ...result.spec.template.metadata.labels };
    const selector = { matchLabels: labels };
    result.spec.selector = selector;
  }
  return result;
}

module.exports = {
  parseDocs,
};
