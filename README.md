<div align="center">

<img src="assets/logo.png" alt="Janos Logo" width="220" />

# Janos

**Audit, preview, and migrate Kubernetes manifests**

[npm package](https://www.npmjs.com/package/@pgold30/janos) · [Before/after examples](examples/README.md)

*Audit deprecated Kubernetes APIs in manifests or live clusters, upgrade supported manifests, and generate Gateway API resources from Ingress definitions. Review the diff before applying a migration.*

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
> When upgrading Kubernetes clusters, deprecated and removed APIs inevitably break deployments. Running manual find-and-replace across hundreds of GitOps repositories or Helm manifests is tedious, error-prone, and destroys your comments.
>
> **Janos bridges the gap**: it audits source manifests, previews supported migrations, and applies changes across a directory with target version gating. When a safe conversion needs information Janos cannot infer, it leaves the resource unchanged and reports the required manual work. It can also generate a starter Gateway API `HTTPRoute` from an Ingress. Its YAML parser retains comments on unchanged nodes, but structural transforms can rewrite formatting or comments within replaced sections. Always review the preview diff.

---

## Where Janos fits

> *Pluto and Kube No Trouble tell you what will break. `kubectl-convert` strips your comments and converts one object at a time. **Janos** audits, previews diffs, safely migrates your GitOps source files in-place while preserving comments, blocks ambiguous upgrades instead of guessing, and enforces the result in CI.*

| Capability | **Janos v3** | [Pluto](https://pluto.docs.fairwinds.com/) | [kubent](https://github.com/doitintl/kube-no-trouble) | [kubectl-convert](https://kubernetes.io/docs/reference/using-api/deprecation-guide/) | [ingress2gateway](https://github.com/kubernetes-sigs/ingress2gateway) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **In-place manifest migration** (not just detection) | ✅ | ❌ | ❌ | ⚠️ Single-object stdout | ❌ Gateway only |
| **Preserves YAML comments on unchanged nodes** | ✅ | N/A | N/A | ❌ Strips comments | ❌ |
| **Blocks unsafe semantic changes** (empty PDB `{}`, CRD without schema, unknown webhook `sideEffects`) | ✅ | ❌ | ❌ | ❌ | N/A |
| **Target-version gating & `--fail-on removed\|deprecated`** | ✅ | ✅ (audit only) | ✅ (audit only) | ❌ | ❌ |
| **Unrendered Helm template migration** (keeps `{{ ... }}` intact) | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Kustomize & Helm chart rendering** (`--kustomize`, `--chart`) | ✅ | ⚠️ Via pipe | ❌ | ❌ | ❌ |
| **Live cluster + cluster-scoped + Helm v3 release auditing** | ✅ | ✅ | ✅ | ❌ | ✅ (Ingress only) |
| **Ecosystem CRDs & custom `.janos.yaml` rules** | ✅ | ✅ (audit only) | ❌ | ❌ | ❌ |
| **Server dry-run validation** (`--validate`) | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Interactive per-file diff/approval** (`-i`: `y/n/d/a/q`) | ✅ | ❌ | ❌ | ❌ | ❌ |
| **GitOps provenance & blame hygiene** (`--annotate`, `--git-blame-ignore`) | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SARIF 2.1.0 + GitHub Actions line-level annotations** | ✅ | ❌ | ❌ | ❌ | ❌ |

Janos is built for teams that own GitOps manifests and want one reviewable workflow: **audit → dry-run diff → migrate → validate → CI check**. For deep live-cluster Helm history or controller-specific Gateway provider policies, pair Janos with Pluto/kubent and `ingress2gateway`.

See the [before/after gallery](examples/README.md) for reproducible conversions, manual cases, and a target-cluster server dry-run command.

---

## ⚡ Quick Start: How to Use

Install Janos from npm, then run the commands below in the directory containing your manifests:

```sh
npm install --global @pgold30/janos@3.0.0
janos --version
```

For a one-off run without a global install, use `npm exec --yes --package=@pgold30/janos@3.0.0 -- janos --audit -d ./k8s`. You can also install directly from this repository with `npm install --global github:pgold30/janos`.

### 1. Audit for Deprecated APIs (Read-Only)
Find out what will break in your repository or running cluster without changing a single file:
```sh
# Audit all YAML manifests in a directory:
janos --audit -d ./k8s

# Audit an active Kubernetes cluster directly via kubectl:
janos --cluster --audit

# Include cluster-scoped kinds (CRDs, Webhooks, StorageClasses, ClusterRoles, FlowSchemas):
janos --cluster --cluster-scoped --audit

# Also decode Helm v3 release Secrets for original deployed manifests:
janos --cluster --cluster-scoped --helm-releases --audit

# Focus only on APIs completely removed in your target version:
janos --audit -d ./k8s --target-version 1.25 --only-removed

# Show all findings, but fail CI only if REMOVED APIs exist:
janos --audit -d ./k8s --target-version 1.25 --check --fail-on removed

# Include built-in ecosystem CRD rules (cert-manager, Istio, Traefik, External Secrets, Kyverno):
janos --audit -d ./k8s --include-ecosystem

# Export SARIF 2.1.0 for GitHub Code Scanning:
janos --audit -d ./k8s --format sarif --output-file janos.sarif
```

Cluster mode queries workload, networking, RBAC, and coordination kinds through `kubectl`. Add `--cluster-scoped` to also audit cluster-scoped resources (CRDs, Webhooks, IngressClasses, PriorityClasses, StorageClasses, ClusterRoles/Bindings, FlowSchemas, PriorityLevelConfigurations), skipping any kind that is unavailable or restricted by RBAC without aborting the scan. For each returned resource it prefers a matching `kubectl.kubernetes.io/last-applied-configuration` manifest, then falls back to the served API if that annotation is missing or invalid. Add `--helm-releases` to also decode deployed Helm v3 release Secrets (`sh.helm.release.v1.*`) for original rendered manifests. Reports show the coverage counts; a served API cannot establish which version was originally applied. Use `--cluster --audit --check --require-original` to fail when any original manifest is unavailable.

Example audit report output with severity tags:

| Kind | Name | Namespace | Current API | Target API | Removed In | Status | File |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| Ingress | `web-ingress` | `default` | `extensions/v1beta1` | **`networking.k8s.io/v1`** | **v1.22** | 🔴 REMOVED | `k8s/ingress.yaml` |
| CronJob | `cleanup` | `prod` | `batch/v1beta1` | **`batch/v1`** | **v1.25** | 🟡 DEPRECATED | `k8s/cron.yaml` |

### 2. Preview Changes with Colored Diff (`--diff`)
See the exact unified diff before modifying anything:
```sh
janos -d ./k8s --dry-run --diff
```

### 3. Migrate In-Place
Upgrade supported manifests after reviewing the diff. Comments on unchanged YAML nodes are retained; transformed sections may be reformatted:
```sh
# Option A: Automatic in-place migration across the entire directory:
janos -d ./k8s

# Option B: Interactive mode — review & confirm each file (y/n/d/a/q):
janos -d ./k8s -i

# Option C: Migrate and validate against a test cluster via server dry-run:
janos -d ./k8s --validate
```

*In interactive mode (`-i`), Janos prompts for each changed file (`[y]es, [n]o, [d]iff, [a]ll, [q]uit`). Resources requiring manual migration are reported and left unchanged; `--check` exits nonzero for them.*

### 4. Gate to Your Target Cluster Version (`--target-version`)
Upgrading from 1.22 to 1.25? Don't prematurely apply 1.26 or 1.29 changes. Gate migrations strictly to your cluster's target version:
```sh
janos -d ./k8s --target-version 1.25 --dry-run --diff
```

### 5. Convert Ingress to Gateway API (`--ingress-to-gateway`)
Modernize legacy Ingresses into Gateway API `HTTPRoute` resources (with path matching, rewrites, and SSL redirect filters):
```sh
# Generate HTTPRoute alongside your Ingress:
janos --ingress-to-gateway -f ingress.yaml

# Generate HTTPRoute AND companion Gateway resource:
janos --ingress-to-gateway --generate-gateway -f ingress.yaml --out gateway.yaml
```

The generated file is separate from the source Ingress. The default name is `ingress.gateway.yaml`. Multi-host Ingresses are split into isolated per-host `HTTPRoute` resources, multi-host `spec.tls` entries generate per-host HTTPS listeners, and `permanent-redirect` URLs are parsed into `RequestRedirect` fields. Janos warns on named service ports, regex capture groups in `rewrite-target`, and unsupported provider annotations. Review `parentRefs`, Gateway class, TLS, backend ports, and annotation translations before applying it. Use `--dry-run` or `--check` to avoid writing output.

For controller-specific annotations or CRDs, also run [ingress2gateway](https://github.com/kubernetes-sigs/ingress2gateway) with the provider that owns the Ingress. For example, with its `ingress-nginx` provider installed:

```sh
ingress2gateway print --providers=ingress-nginx --input-file=ingress.yaml > ingress-provider.gateway.yaml
```

Compare its output and untranslated-feature warnings with Janos's starter route before choosing what to apply. Check ingress2gateway's current [supported providers](https://github.com/kubernetes-sigs/ingress2gateway#supported-providers) for your controller.

### 6. Track Provenance & Keep Git Blame Clean (`--annotate`, `--git-blame-ignore`)
Keep track of what changed without polluting your git history:
```sh
# Stamp upgraded resources with metadata annotations:
janos -d ./k8s --annotate

# Append inline comments showing the replaced API version:
janos -d ./k8s --annotate-inline

# Create a blame-ignore file while migrating:
janos -d ./k8s --git-blame-ignore
# After committing, add that commit's SHA to .git-blame-ignore-revs.
```

With `--annotate` (or `--stamp`), Janos embeds provenance metadata:
```yaml
metadata:
  annotations:
    janos.io/migrated-from: "batch/v1beta1"
    janos.io/migrated-at: "2026-09-16"
    janos.io/upgraded-by: janos
```
And with `--annotate-inline`:
```yaml
apiVersion: batch/v1 # [janos]: migrated from batch/v1beta1
kind: CronJob
```

### 7. Custom Rules & Ecosystem CRDs (`.janos.yaml` & `--include-ecosystem`)
Place a `.janos.yaml` (or `.janos.yml`) in your repository root (or pass `--config <file>`) to configure defaults and add custom CRD migration rules:

```yaml
includeEcosystem: true
targetVersion: "1.34"
failOn: removed
rules:
  - kind: Widget
    legacy:
      - acme.io/v1alpha1
      - acme.io/v1beta1
    target: acme.io/v1
    removedIn: "1.34"
```

With `--include-ecosystem` (or `includeEcosystem: true`), Janos also detects and upgrades common ecosystem CRDs without colliding with core Kubernetes kinds:
- **cert-manager**: `Certificate`, `Issuer`, `ClusterIssuer`, `CertificateRequest`, `Order`, `Challenge` (`v1alpha2`/`v1alpha3`/`v1beta1` → `v1`)
- **External Secrets Operator**: `ExternalSecret`, `SecretStore`, `ClusterSecretStore` (`v1alpha1`/`v1beta1` → `v1`)
- **Traefik**: `IngressRoute`, `IngressRouteTCP`, `IngressRouteUDP`, `Middleware`, `TLSOption`, `ServersTransport` (`traefik.containo.us/v1alpha1` → `traefik.io/v1alpha1`)
- **Istio**: `VirtualService`, `DestinationRule`, `Gateway`, `ServiceEntry`, `Sidecar`, `AuthorizationPolicy`, `PeerAuthentication`, `RequestAuthentication` (`v1alpha3`/`v1beta1` → `v1`)
- **Kyverno**: `ClusterPolicy`, `Policy` (`kyverno.io/v1alpha2` → `kyverno.io/v1`)

---

## 🔧 Advanced Usage & Integrations

*(For GitOps pipelines, Helm charts, Unix streams, and automated CI/CD pull request checks)*

### 1. ⎈ Helm Chart, Template & Kustomize Support
Janos provides native support for Helm and Kustomize without breaking Go template syntax:
- **Render & Audit Helm Charts**:
  ```sh
  janos --chart ./charts/my-app --audit
  janos --chart ./charts/my-app --values ./prod-values.yaml --audit --format markdown
  ```
- **Render & Audit Kustomize Overlays (`-k` / `--kustomize`)**:
  Renders overlays via `kustomize build` or `kubectl kustomize` for audit, diff, check, or migration:
  ```sh
  janos --kustomize ./overlays/production --audit
  janos -k ./overlays/production --diff --target-version 1.32
  ```
- **Migrate Raw Helm Templates In-Place**:
  Updates literal `apiVersion` lines for simple rules inside `templates/*.yaml` while keeping `{{ ... }}` Go expressions untouched. Structural cases are reported for manual review. Render and validate the chart afterward:
  ```sh
  janos -d ./charts/my-app/templates
  ```

### 2. 🚰 Unix Piping & Stream Processing (`-`)
Pipe rendered output from `helm`, `kustomize`, or `cat` directly through Janos:
```sh
# Audit Helm template stream:
helm template my-release ./charts/my-app | janos - --audit --format markdown

# Diff Kustomize build stream:
kustomize build overlays/production | janos - --diff

# Stream and save upgraded manifests:
cat legacy-deploy.yaml | janos - > modern-deploy.yaml
```

### 3. 🤖 GitHub Actions CI
Automatically scan pull requests in CI and block deprecated APIs:
```yaml
name: Kubernetes Deprecation Gate

on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Audit Kubernetes Manifests
        uses: pgold30/janos@v3.0.0
        with:
          path: './k8s'
          args: '--audit --format markdown'
          check: 'true'
          target-version: '1.25'
```
*Janos emits GitHub Actions warning annotations with line numbers and writes markdown reports to the job summary. Pass `args: '--audit --format sarif --output-file janos.sarif'` to upload findings to GitHub Code Scanning. The action installs its Node dependency when it runs. `args` accepts whitespace-separated flags and values; paths with spaces belong in the dedicated `path`, `chart`, `kustomize`, or `values` inputs.*

### 4. 🪝 Pre-commit Hook Integration
Block deprecated manifests from ever being committed to git. Add to `.pre-commit-config.yaml`:
```yaml
repos:
  - repo: https://github.com/pgold30/janos
    rev: v3.0.0
    hooks:
      - id: janos-audit     # Read-only verification before commit
      # - id: janos-migrate # Or auto-migrate in-place before commit
```

The hooks process every filename passed by pre-commit, including filenames containing spaces. The migration hook checks each file again after writing and fails if manual work remains.

### 5. 🌐 Cluster Filters & Exporting
```sh
# Filter live cluster audit to a single namespace:
janos --cluster --namespace staging --audit

# Require stored original manifests for every collected resource in CI:
janos --cluster --audit --check --require-original

# Specify a custom kubeconfig file:
janos --cluster --kubeconfig ~/.kube/staging-config --audit

# Save audit report directly to a file:
janos --audit -d ./k8s --format markdown --output-file audit-report.md
```

### 6. 🐳 Docker (`ghcr.io`)
For CI runners without Node.js:
```sh
# Audit manifests from container (mount local directory):
docker run --rm -v $(pwd)/k8s:/var/janos ghcr.io/pgold30/janos:3.0.0 --audit -d /var/janos

# Audit running cluster from container (mount kubeconfig):
docker run --rm -v ~/.kube:/home/node/.kube:ro ghcr.io/pgold30/janos:3.0.0 --cluster --audit
```

---

## 🛠️ CLI Options Reference

```text
Usage:
  janos [options] [path]
  <stream> | janos - [options]

Core Options:
  -f, --file <file>             Target single manifest file to convert ('-' for stdin)
  -d, --dir <dir>               Target directory to recursively scan and convert
  -i, --interactive             Interactive mode: confirm each file modification (y/n/d/a/q)
      --stdin                   Read manifests from standard input (pipe)
  -n, --dry-run                 Preview changes without modifying files
      --diff                    Show unified color diff of changes
  -c, --check                   CI mode: exit 1 if any files need migration, 0 if clean

Audit & Filter Options:
      --audit, --scan           Pluto-style read-only audit: scan and print summary table
      --target-version <ver>    Gate migrations up to a specific Kubernetes version (e.g. 1.25)
      --only-removed            Audit: only list APIs that are completely removed in target version
      --fail-on <level>         With --audit --check: fail on "deprecated" (default) or "removed" only
      --include-ecosystem       Include built-in ecosystem CRD rules (cert-manager, Istio, Traefik, ESO, Kyverno)
      --config <file>           Path to .janos.yaml config/custom rules file (auto-detected if present)
      --validate                Validate migrated manifests via 'kubectl apply --dry-run=server'
      --format <format>         Output format: table (default), markdown, json, sarif, or annotations
      --output-file <file>      Write audit report directly to a file

Cluster, Helm & Kustomize Options:
      --cluster, --live         Audit running Kubernetes cluster directly via kubectl
      --cluster-scoped          With --cluster, also audit cluster-scoped kinds (CRDs, Webhooks, StorageClasses, etc.)
      --helm-releases           With --cluster, also decode Helm v3 release Secrets for original manifests
      --require-original        With --cluster --check, fail if any original manifest is unavailable
      --namespace <ns>          Namespace filter for live cluster audit (default: all namespaces)
      --kubeconfig <file>       Custom kubeconfig file path
      --chart, --helm <dir>     Scan or render Helm chart directory via 'helm template'
      --values <file>           Specify values YAML file for Helm chart rendering
  -k, --kustomize <dir>         Render and audit/migrate a Kustomize directory via kustomize/kubectl

Gateway API Options:
      --ingress-to-gateway      Translate Ingress manifests to Gateway API (HTTPRoute)
      --generate-gateway        Generate companion Gateway resource with --ingress-to-gateway
      --out <file>              Output file for generated Gateway resources (default: <source>.gateway.yaml)

Provenance & Git Options:
      --annotate, --stamp       Stamp upgraded manifests with janos.io/migrated-* metadata annotations
      --annotate-inline         Append inline comments to upgraded lines (e.g. # [janos]: migrated from ...)
      --git-blame-ignore        Create/update .git-blame-ignore-revs and configure git to preserve blame history

General & CI:
      --ignore <patterns>       Comma-separated glob ignore patterns (or use .janosignore)
      --annotations             Emit GitHub Actions workflow annotations (auto in CI)
  -q, --quiet                   Suppress non-essential output
  -v, --version                 Print version information
  -h, --help                    Print this help message
```

---

## 📋 Supported API Migrations (v1.16 – v1.35+)

| Resource Kind | Deprecated / Removed Versions | Target Version | Removed In | Transformation Details |
| :--- | :--- | :--- | :---: | :--- |
| **Deployment** | `extensions/v1beta1`, `apps/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates required `spec.selector` if missing |
| **DaemonSet** | `extensions/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates required `spec.selector` if missing |
| **StatefulSet** | `apps/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates required `spec.selector` if missing |
| **ReplicaSet** | `extensions/v1beta1`, `apps/v1beta1`, `apps/v1beta2` | `apps/v1` | 1.16 | Generates required `spec.selector` if missing |
| **NetworkPolicy** | `extensions/v1beta1` | `networking.k8s.io/v1` | 1.16 | API version update |
| **Role / ClusterRole** | `rbac.authorization.k8s.io/v1alpha1`, `v1beta1` | `rbac.authorization.k8s.io/v1` | 1.17 / 1.22 | Full RBAC v1 migration |
| **RoleBinding / ClusterRoleBinding** | `rbac.authorization.k8s.io/v1alpha1`, `v1beta1` | `rbac.authorization.k8s.io/v1` | 1.17 / 1.22 | Full RBAC v1 migration |
| **Ingress** | `extensions/v1beta1`, `networking.k8s.io/v1beta1` | `networking.k8s.io/v1` | 1.22 | Atomic backend validation (`serviceName`/`servicePort` → `service.name`/`port`), `spec.backend` → `defaultBackend`, smart `pathType` (`ImplementationSpecific` for regex/`use-regex`, else `Prefix`) |
| **IngressClass** | `networking.k8s.io/v1beta1` | `networking.k8s.io/v1` | 1.22 | API version update |
| **CustomResourceDefinition** | `apiextensions.k8s.io/v1beta1` | `apiextensions.k8s.io/v1` | 1.22 | Moves legacy fields into `spec.versions`; requires an existing structural schema |
| **ValidatingWebhookConfiguration** | `admissionregistration.k8s.io/v1beta1` | `admissionregistration.k8s.io/v1` | 1.22 | Preserves old defaults; requires explicit `sideEffects` and `admissionReviewVersions` |
| **MutatingWebhookConfiguration** | `admissionregistration.k8s.io/v1beta1` | `admissionregistration.k8s.io/v1` | 1.22 | Preserves old defaults; requires explicit `sideEffects` and `admissionReviewVersions` |
| **StorageClass / CSIDriver / CSINode** | `storage.k8s.io/v1beta1` | `storage.k8s.io/v1` | 1.22 | API version update |
| **VolumeAttachment** | `storage.k8s.io/v1beta1` | `storage.k8s.io/v1` | 1.22 | API version update |
| **APIService** | `apiregistration.k8s.io/v1beta1` | `apiregistration.k8s.io/v1` | 1.22 | API version update |
| **PriorityClass** | `scheduling.k8s.io/v1beta1` | `scheduling.k8s.io/v1` | 1.22 | API version update |
| **Lease** | `coordination.k8s.io/v1beta1` | `coordination.k8s.io/v1` | 1.22 | API version update |
| **CertificateSigningRequest** | `certificates.k8s.io/v1beta1` | `certificates.k8s.io/v1` | 1.22 | Requires an explicit signer, request, and valid usages |
| **TokenReview / SubjectAccessReview** | `authentication/authorization.k8s.io/v1beta1` | `authentication/authorization.k8s.io/v1` | 1.22 | Full v1 authorization review migration |
| **CronJob** | `batch/v1beta1` | `batch/v1` | 1.25 | Batch v1 migration |
| **PodDisruptionBudget** | `policy/v1beta1` | `policy/v1` | 1.25 | Blocks empty `spec.selector: {}` (semantic change from 0 pods to all pods) for manual review |
| **EndpointSlice** | `discovery.k8s.io/v1beta1` | `discovery.k8s.io/v1` | 1.25 | Migrates `endpoints[].topology` hostname/zone to `nodeName`/`zone`; flags unknown topology keys |
| **Event** | `events.k8s.io/v1beta1` | `events.k8s.io/v1` | 1.25 | Validates `type` (`Normal`/`Warning`) and required `v1` fields when legacy `deprecated*` fields exist |
| **RuntimeClass** | `node.k8s.io/v1beta1` | `node.k8s.io/v1` | 1.25 | Node v1 migration |
| **HorizontalPodAutoscaler** | `autoscaling/v2beta1`, `v2beta2` | `autoscaling/v2` | 1.25 / 1.26 | Converts supported metric sources (including `v2beta1` `Object` `averageValue`) and checks target values |
| **CSIStorageCapacity** | `storage.k8s.io/v1beta1` | `storage.k8s.io/v1` | 1.27 | Storage v1 migration |
| **FlowSchema / PriorityLevelConfig** | `flowcontrol.apiserver.k8s.io/v1beta1..3` | `flowcontrol.apiserver.k8s.io/v1` | 1.26–1.32 | Renames `spec.limited.assuredConcurrencyShares` → `nominalConcurrencyShares` |
| **SelfSubjectReview** | `authentication.k8s.io/v1alpha1`, `v1beta1` | `authentication.k8s.io/v1` | 1.28 / 1.32 | Authentication v1 migration |
| **ValidatingAdmissionPolicy / Binding** | `admissionregistration.k8s.io/v1alpha1`, `v1beta1` | `admissionregistration.k8s.io/v1` | 1.30 / 1.34 | Admission policy v1 migration |
| **VolumeAttributesClass** | `storage.k8s.io/v1alpha1`, `v1beta1` | `storage.k8s.io/v1` | 1.34 / 1.36 | Storage v1 migration |
| **Gateway / GatewayClass / HTTPRoute / GRPCRoute** | `gateway.networking.k8s.io/v1alpha2`, `v1beta1` | `gateway.networking.k8s.io/v1` | 1.31 / 1.34 | Gateway API v1 migration |
| **ResourceClaim / DeviceClass / ResourceSlice** | `resource.k8s.io/v1alpha3`, `v1beta1` | `resource.k8s.io/v1` | 1.34 / 1.36 | Dynamic Resource Allocation (DRA) v1 migration |
| **PodSecurityPolicy** | `extensions/v1beta1`, `policy/v1beta1` | Manual migration | 1.25 | Left unchanged; `--check` fails and points to Pod Security Admission |

The schema checks above cover known breaking migration requirements; they do not replace validation against the target Kubernetes API server (for example, `kubectl apply --dry-run=server`). See [ROADMAP.md](ROADMAP.md) for upcoming validation work.

---

## 🧪 Development & Testing

Janos uses Node's native test runner (`node:test`) and the declared `yaml` dependency. Install dependencies first:

```sh
# Install locked dependencies and run the full test suite:
npm ci
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
