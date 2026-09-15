<div align="center">

<img src="assets/logo.png" alt="Janos Logo" width="220" />

# Janos

**The Automated Kubernetes Manifest Migration & Gateway API Transition Tool**

*Effortlessly upgrade your Kubernetes manifests from version 1.16 to 1.32+, audit deprecated APIs, and convert Ingress to Gateway API — while keeping 100% of your YAML comments and formatting intact.*

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
> **Janos bridges the gap**: it audits your manifests (like Pluto), updates deprecated `apiVersion`s in-place with target version gating, converts Ingresses to modern Gateway API `HTTPRoute`s (like `ingress2gateway`), and writes upgraded files back — **without stripping a single comment or reformatting your whitespace**.

---

## 🥊 Why Janos vs. `kubectl-convert`, Pluto & `ingress2gateway`?

| Capability | `kubectl-convert` (Official) | Pluto (Fairwinds) | `ingress2gateway` (SIG-Network) | **Janos 2.1** |
| :--- | :---: | :---: | :---: | :---: |
| **In-Place File Updates** | ❌ (Stdout only) | ❌ (Read-only) | ❌ (Stdout / separate file) | ✅ **Yes, recursive directory updates** |
| **Preserves Comments & Whitespace** | ❌ **Strips all comments** | N/A | ❌ **Strips comments** | ✅ **100% Preserved (AST engine)** |
| **First-Class Helm Support** | ❌ No | ⚠️ Rendered only | ❌ No | ✅ **Direct chart render (`--chart`) + template migrator** |
| **STDIN Piping (Helm & Kustomize)** | ❌ No | ⚠️ Partial | ❌ No | ✅ **`helm/kustomize \| janos -`** |
| **Ingress ➔ Gateway API Migration** | ❌ (Not supported) | ❌ (Not supported) | ✅ Yes | ✅ **Built-in (`--ingress-to-gateway`)** |
| **Read-Only Deprecation Audit** | ❌ No | ✅ Yes | ❌ No | ✅ **`--audit` / `--scan`** |
| **Only Show Removed APIs** | ❌ No | ✅ Yes | ❌ No | ✅ **`--only-removed`** |
| **Target Version Gating** | ❌ (Latest only) | N/A | ❌ No | ✅ **`--target-version <v>`** |
| **Safe Color Diffs & Dry-Run** | ❌ No | N/A | ❌ No | ✅ **`--diff` and `--dry-run`** |
| **CI / CD PR Gate & Markdown Reports** | ❌ No | ⚠️ Partial | ❌ No | ✅ **`--check` & `--format markdown`** |
| **Official GitHub Action & Annotations** | ❌ No | ⚠️ Custom setup | ❌ No | ✅ **`uses: pgold30/janos@master`** |
| **Pre-commit Hooks** | ❌ No | ❌ No | ❌ No | ✅ **`.pre-commit-hooks.yaml` included** |
| **Zero-Install (`npx`)** | ❌ (Separate binary) | ❌ (Separate binary) | ❌ (Separate Go install) | ✅ **Instant via `npx janos`** |

---

## ⚡ Highlights

- 🛡️ **Preserves Comments & AST**: Full AST-aware engine retaining header comments, inline comments, anchors, and blank lines.
- 🎯 **Target Version Gating**: `--target-version 1.25`: Only apply deprecations up to your cluster's target version, leaving future removals untouched.
- 📊 **Pluto-Style Read-Only Audit**: `--audit` / `--scan`: Instant overview table of all deprecated APIs across your repo without touching files.
- ⛔ **Filter Removed APIs**: `--only-removed`: Focus exclusively on APIs that are completely removed and broken in your target Kubernetes release.
- 📝 **PR-Ready Markdown Reports**: `--format markdown --output-file <file>`: Generate GitHub Actions-ready summary tables to post directly as PR comments.
- ⎈ **First-Class Helm Support**: Render and audit charts with `--chart <dir>` or migrate raw `templates/*.yaml` files while keeping Go template blocks (`{{ ... }}`) intact.
- 🚰 **Unix Pipeline Streaming**: Read from standard input (`janos -`) to integrate seamlessly with `helm template` and `kustomize build`.
- 🌉 **Ingress to Gateway API**: `--ingress-to-gateway`: Translate legacy Ingress manifests into modern Kubernetes Gateway API `HTTPRoute` (with redirect & rewrite filters) and companion `Gateway` resources.
- 🔎 **Safe Preview & Color Diff**: `--dry-run` and `--diff` provide instant, color-coded unified diffs without modifying files.
- 🚦 **CI / CD Pipeline Gate**: `--check` flag exits `1` when outdated manifests exist, `0` when clean. Ideal for PR gates.
- 🚀 **Zero-Install Execution**: Run immediately anywhere with `npx janos` or use the official Docker image.

---

## 🚀 Quick Start

Run instantly without cloning or installing:

```sh
# 1. Pluto-style read-only deprecation audit:
npx janos --audit -d ./k8s-manifests

# 2. Focus only on APIs that are completely removed in Kubernetes 1.25:
npx janos --audit -d ./k8s-manifests --target-version 1.25 --only-removed

# 3. Preview changes with colorized diff:
npx janos -d ./k8s-manifests --dry-run --diff

# 4. Gate migration up to Kubernetes 1.25 only:
npx janos -d ./k8s-manifests --target-version 1.25

# 5. Audit a Helm chart directory:
npx janos --chart ./charts/my-app --audit

# 6. Convert Ingress manifests to Gateway API HTTPRoutes:
npx janos --ingress-to-gateway -f ingress.yaml
```

---

## 🛠️ CLI Usage & Options

```text
Usage:
  janos [options] [path]
  <stream> | janos - [options]

Core Options:
  -f, --file <file>             Target single manifest file to convert ('-' for stdin)
  -d, --dir <dir>               Target directory to recursively scan and convert
      --stdin                   Read manifests from standard input (pipe)
  -n, --dry-run                 Preview changes without modifying files
      --diff                    Show unified color diff of changes
  -c, --check                   CI mode: exit 1 if any files need migration, 0 if clean

Advanced Options:
      --target-version <ver>    Gate migrations up to a specific Kubernetes version (e.g. 1.25)
      --audit, --scan           Pluto-style read-only audit: scan and print summary table
      --only-removed            Audit: only list APIs that are completely removed in target version
      --format <format>         Output format: table (default), markdown, json, or annotations
      --output-file <file>      Write audit report directly to a file
      --ingress-to-gateway      Translate Ingress manifests to Gateway API (HTTPRoute)
      --generate-gateway        Generate companion Gateway resource with --ingress-to-gateway
      --out <file>              Output file path for generated resources (default: in-place or stdout)
      --ignore <patterns>       Comma-separated glob ignore patterns (or use .janosignore)
      --annotations             Emit GitHub Actions workflow annotations (auto in CI)

Helm Options:
      --chart, --helm <dir>     Scan or render Helm chart directory via 'helm template'
      --values <file>           Specify values YAML file for Helm chart rendering

General:
  -q, --quiet                   Suppress non-essential output
  -v, --version                 Print version information
  -h, --help                    Print this help message
```

---

## 📖 Step-by-Step Guide & Recipes (How to Use)

### Scenario 1: Auditing your GitOps repository before a cluster upgrade
Want to see every deprecated or removed API across your repository without modifying a single file?
```sh
# Audit all manifests in your repository:
npx janos --audit -d ./k8s

# Check only APIs that will hard-break on Kubernetes 1.25:
npx janos --audit -d ./k8s --target-version 1.25 --only-removed

# Export audit table as a GitHub PR-ready Markdown report:
npx janos --audit -d ./k8s --format markdown --output-file audit-report.md
```

### Scenario 2: Previewing and applying migrations in-place
Never upgrade code blindly. Preview color-coded unified diffs first, then apply in-place:
```sh
# Step 1: Preview changes with colored diff without touching files:
npx janos -d ./k8s --dry-run --diff

# Step 2: Gate migrations up to your target version (e.g. 1.25):
npx janos -d ./k8s --target-version 1.25 --diff

# Step 3: Apply migrations in-place (preserves 100% of comments):
npx janos -d ./k8s
```

### Scenario 3: Working with Helm Charts & Templates
Janos provides first-class support for Helm:
```sh
# A. Render and audit a Helm chart directory:
npx janos --chart ./charts/my-app --audit

# B. Render with custom production values:
npx janos --chart ./charts/my-app --values ./values-prod.yaml --audit --format markdown

# C. Directly upgrade raw Helm template files (preserves all Go {{ ... }} syntax):
npx janos -d ./charts/my-app/templates
```

### Scenario 4: Unix Piping with Helm & Kustomize
Janos treats standard input (`-`) as a first-class stream:
```sh
# Pipe Helm rendered output into Janos:
helm template my-release ./charts/my-app | npx janos - --audit --format markdown

# Pipe Kustomize build output and view colored diffs:
kustomize build overlays/production | npx janos - --diff

# Pipe and save migrated manifests to a file:
cat legacy-deploy.yaml | npx janos - > modern-deploy.yaml
```

### Scenario 5: Migrating Ingress to Gateway API (HTTPRoute)
Transition seamlessly from legacy Ingress to the modern Kubernetes Gateway API:
```sh
# Generate HTTPRoute alongside your Ingress:
npx janos --ingress-to-gateway -f ingress.yaml

# Generate HTTPRoute AND companion Gateway resource:
npx janos --ingress-to-gateway --generate-gateway -f ingress.yaml --out gateway-resources.yaml
```

---

## 💡 Advanced Features & Workflows

### 1. Target Version Gating (`--target-version`)
Upgrading from 1.21 to 1.25? Don't prematurely apply 1.26 or 1.29 changes (such as HPA v2beta2 removals or FlowControl v1). Janos lets you gate migrations strictly to your target version:

```sh
janos -d ./k8s-manifests --target-version 1.25 --diff
```

### 2. Pluto-Style Audit & PR Markdown Comments (`--audit --format markdown`)
Generate clean reports for developers or automated CI pull request checks:

```sh
# Terminal ASCII table:
janos --audit -d ./k8s

# Markdown output for GitHub Actions / GitLab CI:
janos --audit -d ./k8s --format markdown

# JSON output for programmatic pipelines:
janos --audit -d ./k8s --format json
```

Example Markdown Report generated by Janos:

| Kind | Name | Namespace | Current API | Target API | Removed In | File |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| Ingress | `web-ingress` | `default` | `extensions/v1beta1` | **`networking.k8s.io/v1`** | **v1.22** | `k8s/ingress.yaml` |
| CronJob | `cleanup` | `prod` | `batch/v1beta1` | **`batch/v1`** | **v1.25** | `k8s/cron.yaml` |

### 3. Ingress to Gateway API Migration (`--ingress-to-gateway`)
With the retirement of `ingress-nginx` and the rise of the **Kubernetes Gateway API**, migrating from Ingress to `HTTPRoute` is the new cloud-native standard.

Janos automatically transforms your Ingress into Gateway API resources:
- Translates `spec.rules[*].host` to `HTTPRoute.spec.hostnames`.
- Translates `paths` into `HTTPRoute.spec.rules[*].matches.path` (`PathPrefix` or `Exact`).
- Translates `serviceName`/`servicePort` to `backendRefs`.
- Maps Ingress class to `parentRefs`.
- Translates rewrite annotations (`nginx.ingress.kubernetes.io/rewrite-target`) into `URLRewrite` filters.
- Generates companion `Gateway` with HTTP (port 80) and HTTPS/TLS (port 443) listeners with `--generate-gateway`.

```sh
# Generate HTTPRoute alongside your Ingress:
janos --ingress-to-gateway -f ingress.yaml

# Generate HTTPRoute and companion Gateway resource:
janos --ingress-to-gateway --generate-gateway -f ingress.yaml --out gateway-resources.yaml
```

### 4. ⎈ First-Class Helm Chart & Template Support
Janos provides three powerful ways to work with Helm:

#### A. Direct Chart Rendering & Auditing (`--chart` / `--helm`)
Point Janos directly to your Helm chart directory. Janos renders the chart via `helm template` under the hood and audits or diffs the rendered resources:

```sh
# Audit a Helm chart directory:
janos --chart ./charts/my-app --audit

# Audit a Helm chart with custom production values:
janos --chart ./charts/my-app --values ./values-prod.yaml --audit --format markdown
```

#### B. Direct Helm Template In-Place Migration
Have raw Helm templates (`templates/*.yaml`) full of Go template interpolations (`{{ .Values... }}`, `{{- if ... }}`)?
Janos's template engine detects Go template blocks, updates deprecated `apiVersion:` lines, and preserves all `{{ ... }}` template expressions byte-for-byte:

```sh
# Safely upgrade deprecated APIs inside Helm template files:
janos -d ./charts/my-app/templates
```

#### C. Helm STDIN Streaming
Pipe rendered Helm outputs directly into Janos:

```sh
helm template my-release ./charts/my-app | janos - --audit --format markdown
helm template my-release ./charts/my-app | janos - --diff
```

---

### 5. 🚰 STDIN & Unix Pipeline Integration (Helm & Kustomize)
Janos treats standard input (`-`) as a first-class citizen. Output pure migrated YAML to `stdout` while logs and warnings are routed cleanly to `stderr`:

```sh
# Kustomize pipeline diff:
kustomize build overlays/production | janos - --diff

# Pipe and save migrated manifests:
cat legacy-deploy.yaml | janos - > modern-deploy.yaml
```

---

### 6. 🤖 Official GitHub Action (`action.yml`)
Add Janos directly to your GitHub Actions workflows with zero installation:

```yaml
name: Kubernetes Deprecation Gate

on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Audit Kubernetes Manifests
        uses: pgold30/janos@master
        with:
          path: './k8s'
          args: '--audit --format markdown'
          check: 'true'
          target-version: '1.25'
```

*When running in GitHub Actions, Janos automatically creates PR line annotations (`::warning`) and writes markdown reports to the Job Summary!*

---

### 7. 🪝 Pre-commit Hook Integration
Prevent deprecated Kubernetes manifests from ever being committed to your git repository. Add Janos to your `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/pgold30/janos
    rev: v2.1.0
    hooks:
      - id: janos-audit     # Read-only verification before commit
      # - id: janos-migrate # Or auto-migrate in-place before commit
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
| **Ingress** | `extensions/v1beta1`, `networking.k8s.io/v1beta1` | `networking.k8s.io/v1` | 1.22 | Migrates `spec.backend` to `defaultBackend`, converts `serviceName`/`servicePort` to `service.name`/`port`, adds `pathType: Prefix` (or convert to Gateway API with `--ingress-to-gateway`) |
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

Automatically scan pull requests and post an audit comment:

```yaml
name: Kubernetes Deprecation Check

on:
  pull_request:
    paths:
      - 'k8s/**'
      - '**/*.yaml'
      - '**/*.yml'

jobs:
  audit-manifests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Run Janos Deprecation Audit
        run: |
          npx janos --audit -d ./k8s --check --format markdown > report.md

      - name: Post PR Comment
        if: failure()
        uses: thollander/actions-comment-pull-request@v2
        with:
          filePath: report.md
```

---

## 🧪 Development & Testing

Janos uses Node's native zero-dependency test runner (`node:test`):

```sh
# Run full test suite:
npm test

# Run tests in watch mode:
node --test --watch
```

---

## 👤 Maintainer

Created and maintained with ❤️ by **Pablo Loschi**:
- **GitHub**: [@pgold30](https://github.com/pgold30)
- **Email**: [loschi.pablo@gmail.com](mailto:loschi.pablo@gmail.com)
- **Medium**: [@pgold30](https://medium.com/@pgold30)

## 📄 License

Apache License 2.0. See [LICENSE.md](LICENSE.md) for details.
