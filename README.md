<div align="center">

<img src="assets/logo.png" alt="Janos Logo" width="220" />

# Janos

**The Automated Kubernetes Manifest Migration Tool**

*Effortlessly upgrade your Kubernetes manifests from version 1.16 to 1.32+ while keeping your YAML comments and formatting intact.*

[![CI](https://github.com/pgold30/janos/actions/workflows/ci.yml/badge.svg)](https://github.com/pgold30/janos/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE.md)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v2.1-ff69b4.svg)](CODE_OF_CONDUCT.md)

</div>

---

> **Why Janos?**
>
> In Roman mythology, **Janus** (Janos) is the god of transitions, doors, and passages — with two faces looking simultaneously into the past and into the future.
>
> When upgrading Kubernetes clusters, deprecated and removed APIs inevitably break deployments. Running manual find-and-replace across hundreds of GitOps repositories or Helm-free manifests is tedious, error-prone, and destroys your comments.
>
> **Janos bridges the gap**: it scans your manifests, updates deprecated `apiVersion`s, performs deep structural schema translations, and writes the upgraded files back — **without stripping a single comment or reformating your whitespace**.

---

## ⚡ Highlights

| Feature | Description |
| :--- | :--- |
| 🛡️ **Preserves Comments & AST** | Full AST-aware engine retaining header comments, inline comments, anchors, and blank lines. |
| 🔎 **Safe Preview & Color Diff** | `--dry-run` and `--diff` provide instant, color-coded unified diffs without modifying files. |
| 🚦 **CI / CD Pipeline Ready** | `--check` flag exits `1` when outdated manifests exist, `0` when clean. Ideal for PR gates. |
| ⚙️ **Deep Schema Migrations** | Automatically migrates Ingress `backend` (`serviceName`/`servicePort` to modern `service`), adds missing `spec.selector`s for Deployments, and updates HPA `autoscaling/v2` metrics. |
| 🚀 **Zero-Install Execution** | Run immediately anywhere with `npx janos` or use the official Docker image. |
| 🌐 **Comprehensive Coverage** | Handles Kubernetes deprecations from **v1.16 up through v1.32+**. |

---

## 🚀 Quick Start

Run instantly without cloning or installing:

```sh
# Preview changes in a folder with colorized diff:
npx janos -d ./k8s-manifests --dry-run --diff

# Apply changes in-place:
npx janos -d ./k8s-manifests
```

---

## 📦 Installation Options

### Global npm CLI
```sh
npm install -g janos
janos --help
```

### Docker
```sh
# Build local container
make build

# Run against current directory
./janos.sh -d ./manifests --diff
```

---

## 🛠️ CLI Usage & Flags

```text
Usage:
  janos [options] [path]

Options:
  -f, --file <file>     Target single manifest file to convert
  -d, --dir <dir>       Target directory to recursively scan and convert
  -n, --dry-run         Preview changes without modifying files
      --diff            Show unified diff of changes
  -c, --check           CI mode: exit 1 if any files need migration, 0 if clean
  -q, --quiet           Suppress non-essential output
  -v, --version         Print version information
  -h, --help            Print this help message
```

### Common Workflows

#### 1. Convert a single file
```sh
janos -f deployment.yaml
```

#### 2. Convert an entire GitOps repository
```sh
janos -d ./gitops/apps
```

#### 3. Inspect before applying (Dry-Run + Diff)
```sh
janos -d ./k8s-manifests --dry-run --diff
```

#### 4. Automated CI Pull Request Check
```sh
janos --check ./k8s-manifests
```

---

## 📋 Comprehensive Migration Matrix (v1.16 – v1.32+)

| Resource Kind | Deprecated / Removed Versions | Target Version | Removed In | Transformation Details |
| :--- | :--- | :--- | :---: | :--- |
| **Deployment** | `extensions/v1beta1`, `apps/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates required `spec.selector` if missing |
| **DaemonSet** | `extensions/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates required `spec.selector` if missing |
| **StatefulSet** | `apps/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates required `spec.selector` if missing |
| **ReplicaSet** | `extensions/v1beta1`, `apps/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates required `spec.selector` if missing |
| **NetworkPolicy** | `extensions/v1beta1` | `networking.k8s.io/v1` | 1.16 | API version update |
| **Role / ClusterRole** | `rbac.authorization.k8s.io/v1alpha1`, `v1beta1` | `rbac.authorization.k8s.io/v1` | 1.17 / 1.22 | Full RBAC v1 migration |
| **RoleBinding / ClusterRoleBinding** | `rbac.authorization.k8s.io/v1alpha1`, `v1beta1` | `rbac.authorization.k8s.io/v1` | 1.17 / 1.22 | Full RBAC v1 migration |
| **Ingress** | `extensions/v1beta1`, `networking.k8s.io/v1beta1` | `networking.k8s.io/v1` | 1.22 | Migrates `spec.backend` to `defaultBackend`, converts `serviceName`/`servicePort` to `service.name`/`port`, adds `pathType: Prefix` |
| **IngressClass** | `networking.k8s.io/v1beta1` | `networking.k8s.io/v1` | 1.22 | API version update |
| **CustomResourceDefinition** | `apiextensions.k8s.io/v1beta1` | `apiextensions.k8s.io/v1` | 1.22 | API version update |
| **ValidatingWebhookConfiguration** | `admissionregistration.k8s.io/v1beta1` | `admissionregistration.k8s.io/v1` | 1.22 | API version update |
| **MutatingWebhookConfiguration** | `admissionregistration.k8s.io/v1beta1` | `admissionregistration.k8s.io/v1` | 1.22 | API version update |
| **StorageClass / CSIDriver / CSINode** | `storage.k8s.io/v1beta1` | `storage.k8s.io/v1` | 1.22 | API version update |
| **VolumeAttachment** | `storage.k8s.io/v1beta1` | `storage.k8s.io/v1` | 1.22 | API version update |
| **APIService** | `apiregistration.k8s.io/v1beta1` | `apiregistration.k8s.io/v1` | 1.22 | API version update |
| **PriorityClass** | `scheduling.k8s.io/v1beta1` | `scheduling.k8s.io/v1` | 1.22 | API version update |
| **Lease** | `coordination.k8s.io/v1beta1` | `coordination.k8s.io/v1` | 1.22 | API version update |
| **CertificateSigningRequest** | `certificates.k8s.io/v1beta1` | `certificates.k8s.io/v1` | 1.22 | API version update |
| **TokenReview / SubjectAccessReview** | `authentication/authorization.k8s.io/v1beta1` | `authentication/authorization.k8s.io/v1` | 1.22 | Full v1 authorization review migration |
| **CronJob** | `batch/v1beta1` | `batch/v1` | 1.25 | Batch v1 migration |
| **PodDisruptionBudget** | `policy/v1beta1` | `policy/v1` | 1.25 | Policy v1 migration |
| **EndpointSlice** | `discovery.k8s.io/v1beta1` | `discovery.k8s.io/v1` | 1.25 | Discovery v1 migration |
| **Event** | `events.k8s.io/v1beta1` | `events.k8s.io/v1` | 1.25 | Events v1 migration |
| **RuntimeClass** | `node.k8s.io/v1beta1` | `node.k8s.io/v1` | 1.25 | Node v1 migration |
| **HorizontalPodAutoscaler** | `autoscaling/v2beta1`, `v2beta2` | `autoscaling/v2` | 1.25 / 1.26 | Migrates metric target specifications to `target.type/averageUtilization` |
| **CSIStorageCapacity** | `storage.k8s.io/v1beta1` | `storage.k8s.io/v1` | 1.27 | Storage v1 migration |
| **FlowSchema / PriorityLevelConfig** | `flowcontrol.apiserver.k8s.io/v1beta1..3` | `flowcontrol.apiserver.k8s.io/v1` | 1.26–1.32 | Flow control v1 migration |
| **PodSecurityPolicy** | `extensions/v1beta1`, `apps/v1beta2` | `policy/v1beta1` | 1.25 | Emits migration warning for Pod Security Admission |

---

## 🤖 GitHub Actions CI Workflow

Block pull requests containing deprecated APIs automatically:

```yaml
name: Validate Kubernetes Manifests

on:
  pull_request:
    paths:
      - 'k8s/**'
      - '**/*.yaml'
      - '**/*.yml'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Run Janos Check
        run: npx janos --check ./k8s
```

---

## 🧪 Development & Testing

Janos uses Node's native zero-dependency test runner (`node:test`):

```sh
# Run full test suite:
npm test

# Run tests in watch mode:
node --test --watch src/**/*.spec.js src/**/*.test.js
```

---

## 👤 Maintainer

Created and maintained with ❤️ by **Pablo Loschi**:
- **GitHub**: [@pgold30](https://github.com/pgold30)
- **Email**: [loschi.pablo@gmail.com](mailto:loschi.pablo@gmail.com)
- **Medium**: [@pgold30](https://medium.com/@pgold30)

## 📄 License

Apache License 2.0. See [LICENSE.md](LICENSE.md) for details.
