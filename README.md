# Janos 🚀

> Automated Kubernetes manifest migration tool for API version upgrades.

[![CI](https://github.com/pgold30/janos/actions/workflows/ci.yml/badge.svg)](https://github.com/pgold30/janos/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE.md)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v1.4%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)

Janos automatically upgrades Kubernetes YAML manifests to replace deprecated and removed `apiVersion`s across cluster upgrades (from Kubernetes **1.16** all the way to **1.32+**).

Unlike older tools, **Janos preserves all YAML comments, whitespace, and formatting** using AST-based document manipulation.

---

## ✨ Key Features

- **AST Comment & Formatting Preservation**: Inline comments, headers, and document structures remain untouched.
- **Preview & Safe Execution**:
  - `--dry-run`: Preview changes without altering files.
  - `--diff`: Inspect changes with colorized unified diffs in your terminal.
- **CI / CD Ready**:
  - `--check`: Exits with code `1` if manifests need migration, `0` if clean. Perfect for pull request validation!
- **Deep Manifest Transformations**:
  - Automatically adds required `spec.selector` for `Deployment`, `DaemonSet`, `StatefulSet`, and `ReplicaSet`.
  - Migrates Ingress v1 schemas (`spec.backend` -> `spec.defaultBackend`, `serviceName`/`servicePort` -> `service.name`/`service.port`, and injects required `pathType: Prefix`).
  - Migrates HorizontalPodAutoscaler to `autoscaling/v2` with updated metric target specifications.
- **Zero-Dependency Core**: Fast, lightweight, and modern.

---

## 📦 Installation

### Option 1: Run directly with npx (no install required)

```sh
npx janos -f deployment.yaml --diff
```

### Option 2: Install globally via npm

```sh
npm install -g janos
janos --help
```

### Option 3: Run with Docker

```sh
# Build image
make build

# Run via docker helper
./janos.sh -d ./manifests --diff
```

---

## 🛠️ Usage

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

### Examples

```sh
# Convert a single manifest in-place:
janos -f deployment.yaml

# Recursively scan and convert a folder:
janos -d ./k8s-manifests

# Preview changes with colored diff without touching files:
janos -d ./k8s-manifests --dry-run --diff

# Validate in CI pipeline (fails if outdated manifests are found):
janos --check ./k8s-manifests

# Positional arguments are also supported:
janos ./k8s-manifests
```

---

## 📋 Supported API Migrations Matrix

| Kind | Deprecated / Removed Versions | Target Version | First Removed / Deprecated In | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Deployment** | `extensions/v1beta1`, `apps/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates `spec.selector` if missing |
| **DaemonSet** | `extensions/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates `spec.selector` if missing |
| **StatefulSet** | `apps/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates `spec.selector` if missing |
| **ReplicaSet** | `extensions/v1beta1`, `apps/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates `spec.selector` if missing |
| **NetworkPolicy** | `extensions/v1beta1` | `networking.k8s.io/v1` | 1.16 | |
| **PodSecurityPolicy** | `extensions/v1beta1`, `apps/v1beta2` | `policy/v1beta1` | 1.16 / 1.25 | Removed in 1.25 (warning emitted for Pod Security Standards) |
| **Role / ClusterRole** | `rbac.authorization.k8s.io/v1alpha1`, `v1beta1` | `rbac.authorization.k8s.io/v1` | 1.17 / 1.22 | |
| **RoleBinding / ClusterRoleBinding** | `rbac.authorization.k8s.io/v1alpha1`, `v1beta1` | `rbac.authorization.k8s.io/v1` | 1.17 / 1.22 | |
| **Ingress** | `extensions/v1beta1`, `networking.k8s.io/v1beta1` | `networking.k8s.io/v1` | 1.22 | Migrates `backend` to `service.name`/`port` & adds `pathType` |
| **IngressClass** | `networking.k8s.io/v1beta1` | `networking.k8s.io/v1` | 1.22 | |
| **CustomResourceDefinition** | `apiextensions.k8s.io/v1beta1` | `apiextensions.k8s.io/v1` | 1.22 | |
| **ValidatingWebhookConfiguration** | `admissionregistration.k8s.io/v1beta1` | `admissionregistration.k8s.io/v1` | 1.22 | |
| **MutatingWebhookConfiguration** | `admissionregistration.k8s.io/v1beta1` | `admissionregistration.k8s.io/v1` | 1.22 | |
| **StorageClass / CSIDriver / CSINode** | `storage.k8s.io/v1beta1` | `storage.k8s.io/v1` | 1.22 | |
| **VolumeAttachment** | `storage.k8s.io/v1beta1` | `storage.k8s.io/v1` | 1.22 | |
| **APIService** | `apiregistration.k8s.io/v1beta1` | `apiregistration.k8s.io/v1` | 1.22 | |
| **PriorityClass** | `scheduling.k8s.io/v1beta1` | `scheduling.k8s.io/v1` | 1.22 | |
| **Lease** | `coordination.k8s.io/v1beta1` | `coordination.k8s.io/v1` | 1.22 | |
| **CertificateSigningRequest** | `certificates.k8s.io/v1beta1` | `certificates.k8s.io/v1` | 1.22 | |
| **TokenReview / SubjectAccessReview** | `authentication/authorization.k8s.io/v1beta1` | `authentication/authorization.k8s.io/v1` | 1.22 | |
| **CronJob** | `batch/v1beta1` | `batch/v1` | 1.25 | |
| **PodDisruptionBudget** | `policy/v1beta1` | `policy/v1` | 1.25 | |
| **EndpointSlice** | `discovery.k8s.io/v1beta1` | `discovery.k8s.io/v1` | 1.25 | |
| **Event** | `events.k8s.io/v1beta1` | `events.k8s.io/v1` | 1.25 | |
| **RuntimeClass** | `node.k8s.io/v1beta1` | `node.k8s.io/v1` | 1.25 | |
| **HorizontalPodAutoscaler** | `autoscaling/v2beta1`, `v2beta2` | `autoscaling/v2` | 1.25 / 1.26 | Migrates `targetAverageUtilization` to `target.type/averageUtilization` |
| **CSIStorageCapacity** | `storage.k8s.io/v1beta1` | `storage.k8s.io/v1` | 1.27 | |
| **FlowSchema / PriorityLevelConfiguration** | `flowcontrol.apiserver.k8s.io/v1beta1`, `v1beta2`, `v1beta3` | `flowcontrol.apiserver.k8s.io/v1` | 1.26 / 1.29 / 1.32 | |

---

## 🤖 CI / CD Integration Example

Easily block deprecated Kubernetes manifests in GitHub Actions pull requests:

```yaml
name: Validate Kubernetes Manifests

on:
  pull_request:
    paths:
      - 'k8s/**'
      - '**/*.yaml'
      - '**/*.yml'

jobs:
  check-manifests:
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

## 🧪 Testing

Run the native test suite:

```sh
npm test
```

---

## 👤 Maintainer

- **Pablo Loschi** - [loschi.pablo@gmail.com](mailto:loschi.pablo@gmail.com)

## 📄 License

This project is licensed under the Apache-2.0 License - see the [LICENSE.md](LICENSE.md) file for details.
