# Stop Letting Kubernetes Upgrades Break Your GitOps Repos: Introducing Janos 2.2

> **Subtitle:** *Why `kubectl-convert` ruins your YAML comments, how Pluto leaves all the editing to you, and how Janos 2.2 introduces live cluster auditing, interactive migrations, and AST-preserving upgrades up to Kubernetes 1.32.*
> **Author:** Pablo Loschi  
> **Tags:** Kubernetes, DevOps, GitOps, Platform Engineering, SRE, Cloud Native  
> **Reading Time:** ~6 min  

---

![Janos Logo](https://raw.githubusercontent.com/pgold30/janos/master/assets/logo.png)

---

If you manage Kubernetes clusters in production, you know the quiet dread that accompanies a major version upgrade notice.

It usually starts innocently in Slack:

> *"Hey team, EKS/GKE is dropping support for Kubernetes 1.25 next month. We need to upgrade all clusters to 1.28."*

Then reality sets in. 

Over the past few releases, Kubernetes has systematically retired dozens of core APIs:
- `extensions/v1beta1` and `apps/v1beta1` were stripped in **v1.16**.
- Ingress `v1beta1` and RBAC `v1beta1` were removed in **v1.22**.
- `CronJob` (`batch/v1beta1`), `PodDisruptionBudget` (`policy/v1beta1`), and `PodSecurityPolicy` were purged in **v1.25**.
- `HorizontalPodAutoscaler` `v2beta2` was removed in **v1.26**.
- `CSIStorageCapacity` beta API was removed in **v1.27**.
- `FlowControl` beta APIs reached end-of-life in **v1.29 and v1.32**.

When an API version is removed from the Kubernetes API server, any manifest still using that `apiVersion` is rejected immediately on `kubectl apply`. 

In an organization managing 50, 100, or 500 GitOps repositories across ArgoCD, Flux, or plain YAML manifests, upgrading them by hand is a massive, stressful chore.

---

## The Flawed Options We All Tried

| Core Capability | Pluto (Fairwinds) | `kubectl-convert` (Official) | **Janos 2.2** |
| :--- | :---: | :---: | :---: |
| **Fixes manifests in-place?** | ❌ No (Read-only auditor) | ❌ No (Single file to stdout) | ✅ **Yes, recursive directory updates** |
| **Preserves YAML comments?** | N/A (Doesn't modify files) | ❌ **Strips 100% of comments** | ✅ **100% Preserved (AST engine)** |
| **Live Cluster & Helm Audit?** | ✅ Yes (Helm & cluster read-only) | ❌ No | ✅ **Yes (`--cluster`, `--chart`, unrendered templates)** |
| **Target Version Gating?** | ⚠️ Filter only | ❌ No (Forces latest API, breaking staged upgrades) | ✅ **`--target-version <v>` safe incremental upgrades** |
| **Ingress ➔ Gateway API?** | ❌ No | ❌ No | ✅ **Built-in (`--ingress-to-gateway`)** |

---

## Enter Janos 2.2: The In-Place GitOps Upgrader

Two years ago, I built **Janos** — named after the Roman two-faced god of transitions, doors, and passages who looks simultaneously into the past and into the future.

Today, I’m excited to release **Janos 2.2**: a complete, zero-dependency modernization designed for modern Kubernetes environments (v1.16 through v1.32+).

Here is how Janos approaches the problem differently:

---

### 1. 🛡️ 100% AST Comment & Whitespace Preservation

Rather than loading YAML as a plain JavaScript dictionary or Go struct, Janos parses your files into a **Concrete Syntax Tree (AST)**. 

When Janos updates an API version or restructures an Ingress backend, it mutates only the targeted AST nodes:

```yaml
# Before Janos
# Managed by platform team - do not edit without review!
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: nightly-cleanup # runs at 00:00 UTC
spec:
  schedule: "0 0 * * *"
```

```yaml
# After Janos
# Managed by platform team - do not edit without review!
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-cleanup # runs at 00:00 UTC
spec:
  schedule: "0 0 * * *"
```

Every comment, inline annotation, anchor, and blank line remains exactly where you left it.

---

### 2. 🌐 Live Cluster Auditing (`--cluster` / `--live`)

Ever wondered what deprecated APIs are currently running in your active Kubernetes cluster before you initiate a control-plane upgrade?

With Janos 2.2, you can query your active cluster directly via your local `kubectl`:

```sh
# Audit all workloads across the current cluster:
npx janos --cluster --audit

# Filter to a specific namespace:
npx janos --cluster --namespace staging --audit

# Only show APIs completely removed in your target version:
npx janos --cluster --audit --target-version 1.25 --only-removed
```

No in-cluster agent, no helm chart install, and no privileged daemon required.

---

### 3. 💬 Interactive Confirmation Mode (`-i / --interactive`)

Inspired by `git add -p`, Janos 2.2 gives you total control when upgrading a repository:

```sh
npx janos -d ./k8s-manifests -i
```

For each file that needs upgrading, Janos prompts:
`Apply changes to k8s/cronjob.yaml? [y/n/d/a/q]`

- `y`: accept and write the migration
- `n`: skip this file
- `d`: display the ANSI color unified diff before deciding
- `a`: accept all remaining files without prompting
- `q`: quit immediately, safely leaving remaining files untouched

---

### 4. 🚨 Status Severity Tagging (`REMOVED` vs `DEPRECATED`)

Audit reports now clearly separate `🔴 REMOVED` APIs (which will cause immediate deployment failures on `kubectl apply`) from `🟡 DEPRECATED` APIs (which still work but should be modernized):

```text
┌─────────┬──────────────┬────────────────────┬──────────────────────┬────────────┬────────────┬───────────────────┐
│ Kind    │ Name         │ Current API        │ Target API           │ Removed In │ Status     │ File              │
├─────────┼──────────────┼────────────────────┼──────────────────────┼────────────┼────────────┼───────────────────┤
│ Ingress │ web-ingress  │ extensions/v1beta1 │ networking.k8s.io/v1 │ v1.22      │ REMOVED    │ k8s/ingress.yaml  │
│ CronJob │ nightly-task │ batch/v1beta1      │ batch/v1             │ v1.25      │ DEPRECATED │ k8s/cron.yaml     │
└─────────┴──────────────┴────────────────────┴──────────────────────┴────────────┴────────────┴───────────────────┘
```

---

### 5. 🎯 Target Version Gating (`--target-version 1.25`)

If your company is upgrading from Kubernetes 1.21 to 1.25, you do **not** want a tool that prematurely converts APIs that require 1.26 or 1.29 (such as HPA `v2` metrics or FlowControl `v1`).

With `--target-version`, Janos only applies migrations up to your chosen release:

```sh
npx janos -d ./k8s-manifests --target-version 1.25 --diff
```

Migrations for future versions are skipped, keeping your manifests compatible with your target cluster.

---

### 6. 🌉 Ingress to Gateway API Migration (`--ingress-to-gateway`)

With the retirement of `ingress-nginx` and the industry-wide shift toward the **Kubernetes Gateway API**, migrating from Ingress to `HTTPRoute` is the biggest networking transition happening today.

Janos automatically:
- Maps `spec.rules[*].host` to `HTTPRoute.spec.hostnames`.
- Translates paths to `matches.path` (`PathPrefix` and `Exact`).
- Converts `serviceName`/`servicePort` to `backendRefs`.
- Maps Ingress classes to `parentRefs`.
- Converts NGINX rewrite annotations into standard `URLRewrite` filters.
- Translates SSL redirect annotations into `RequestRedirect` filters.

```sh
# Generate HTTPRoute alongside your Ingress:
npx janos --ingress-to-gateway -f ingress.yaml

# Generate HTTPRoute AND companion Gateway manifest:
npx janos --ingress-to-gateway --generate-gateway -f ingress.yaml --out gateway.yaml
```

---

### 7. ⎈ First-Class Helm & Unix Pipeline Integration

1. **Direct Chart Rendering (`--chart`)**:
   ```sh
   npx janos --chart ./charts/my-app --audit
   npx janos --chart ./charts/my-app --values ./values-prod.yaml --audit --format markdown
   ```

2. **Template Migration Preserving Go Expressions**:
   Safely detects and updates deprecated `apiVersion:` lines in `templates/*.yaml` while preserving every Go template tag (`{{ ... }}`) byte-for-byte.

3. **STDIN Streaming (`helm | janos -`)**:
   ```sh
   helm template my-release ./charts/my-app | npx janos - --audit --format markdown
   kustomize build overlays/production | npx janos - --diff
   ```

---

### 8. 🤖 Official GitHub Action & Pre-commit Hooks

Ensure deprecated APIs never get committed in the first place:

```yaml
- name: Audit Kubernetes Manifests
  uses: pgold30/janos@master
  with:
    path: './k8s'
    args: '--audit --format markdown'
    check: 'true'
```

It automatically adds PR line annotations in GitHub and posts the markdown summary to the Actions Job Summary!

---

## Quick Start (Zero Installation Required)

You don’t need to clone the repository or configure any environment. Run directly via `npx`:

```sh
# 1. Audit your live cluster:
npx janos --cluster --audit

# 2. Audit your repository manifests:
npx janos --audit -d ./k8s

# 3. Preview changes with color diffs:
npx janos -d ./k8s --dry-run --diff

# 4. Migrate with interactive confirmation:
npx janos -d ./k8s -i
```

---

## Get Involved & Star the Project

Janos is 100% free and open-source under the Apache 2.0 license:

👉 **GitHub Repository**: [https://github.com/pgold30/janos](https://github.com/pgold30/janos)

If Janos saves your team hours of migration work, please consider giving it a ⭐ on GitHub and sharing it with your platform engineering team!
