# Janos
Janos is a K8s migration tool that update your manifests in order to be compatible with newer versions. __It does not work with Helm templates, just with pure yaml files.__

[![License](https://img.shields.io/badge/license--lightgrey.svg)](LICENSE.md)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v1.4%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)

<div align="center">

# <Janos>

<Janos is a K8s migration tool that update your manifests in order to be compatible with newer versions>

</div>

> **TLDR;**
> Have your Kuberenetes manifests up to date


##### Table of contents

- [Installation](#installation)
- [Usage](#usage)
- [List of Changes](#list-of-changes)
- [More Info](#more-info)

## Overview
Janos will convert all your manifest files, updating it inplace. If you pass a directory as a parameter, it will do a recursive search. All comments are removed, and the file formatting may change.

## Installation

Build the image before running the script, because it will be executed inside the container.
```sh
# Build image
make build

# Copy entrypoint script to /usr/local/bin
make install
```

## Usage

```sh
janos {-d|-f}
-f file       The file to be converted.
-d dir        The directory with the yaml files to be converted.
```
All the rules are in the file migration.js.

## List of Changes
  - 1.16: for Kind: Deployment |Daemonset |Statefulset |ReplicaSet Replace for extensions/v1beta1 | apps/v1beta1 | apps/v1beta2 with apps/v1
  - 1.16: for Kind: Ingress. Replace: extensions/v1beta1 with networking.k8s.io/v1beta1
  - 1.16: for Kind: PodSecurityPolicy. Replace: extensions/v1beta1 |apps/v1beta2 with policy/v1beta1
  - 1.16: Generates the now required spec.selector for Kind Deployment |Daemonset |Statefulset |ReplicaSet (using matchLabels app name, you can read more about these here), only if it doesn't exist
  - 1.17: for Kinds:Role |ClusterRole |RoleBinding |ClusterRoleBinding: Replace rbac.authorization.k8s.io/v1alpha1 | rbac.authorization.k8s.io/v1beta1 with rbac.authorization.k8s.io/v1
  - 1.19: for Kind: HorizontalPodAutoscaler. Replace: autoscaling/v2beta1 with autoscaling/v2beta2
  - 1.21: for ValidatingWebhookConfiguration and MutatingWebhookConfiguration: Replace admissionregistration.k8s.io/v1beta1 with admissionregistration.k8s.io/v1
  - 1.21: for CustomResourceDefinition |TokenReview |SubjectAccessReview |LocalSubjectAccessReview |SelfSubjectAccessReview: Replace apiextensions.k8s.io/v1beta1 with apiextensions.k8s.io/v1
  - 1.21: for CertificateSigningRequest: Replace certificates.k8s.io/v1beta1 with certificates.k8s.io/v1
  - 1.21: for Lease: Replace coordination.k8s.io/v1beta1 with coordination.k8s.io/v1
  - 1.21: for Ingress: Replace extensions/v1beta1 |networking.k8s.io/v1beta1 with networking.k8s.io/v1
  - 1.21: for RBAC: Replace rbac.authorization.k8s.io/v1beta1 with rbac.authorization.k8s.io/v1
  - 1.21: for PriorityClasss: Replace scheduling.k8s.io/v1beta1 with scheduling.k8s.io/v1
  - 1.21: for CSIDriver, CSINode and StorageClass: Replace VolumeAttachmentstorage.k8s.io/v1beta1 with storage.k8s.io/v1

## More Info
There is more information about other changes here :). Thanks https://marcincuber.medium.com/

* [1.16 to 1.17](https://marcincuber.medium.com/amazon-eks-upgrade-journey-from-1-16-to-1-17-cb9e88191165)
* [1.17 to 1.18](https://marcincuber.medium.com/amazon-eks-upgrade-journey-from-1-17-to-1-18-e35e134ca898)
* [1.18 to 1.19](https://marcincuber.medium.com/amazon-eks-upgrade-journey-from-1-18-to-1-19-cca82de84333)
* [1.19 to 1.20](https://marcincuber.medium.com/amazon-eks-upgrade-journey-from-1-19-to-1-20-78c9a7edddb5)
* [1.20 to 1.21](https://marcincuber.medium.com/amazon-eks-upgrade-journey-from-1-20-to-1-21-caf1475deaa4)
* [1.21 to 1.22](https://marcincuber.medium.com/amazon-eks-upgrade-journey-from-1-21-to-1-22-9546da932af6)
* [1.22 to 1.23](https://marcincuber.medium.com/amazon-eks-upgrade-journey-from-1-22-to-1-23-3b9eaa8c57de)
* [1.23 to 1.24](https://marcincuber.medium.com/amazon-eks-upgrade-journey-from-1-23-to-1-24-b7b0b1afa5b4)

### Maintainers
- [Pablo Loschi](mailto:loschi.pablo@gmail.com)
