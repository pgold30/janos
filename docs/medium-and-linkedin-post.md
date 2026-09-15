# 📝 Community Announcement Pack: Janos 2.2

This document contains ready-to-publish content for Medium and LinkedIn to announce the launch of **Janos 2.2**.

---

## Part 1: Medium Article

**Title:**
# Stop Letting Kubernetes Upgrades Break Your GitOps Repos: Introducing Janos 2.2

**Subtitle:**
*Why `kubectl-convert` ruins your YAML comments, how Pluto leaves all the editing to you, and how Janos 2.2 introduces live cluster auditing, interactive migrations, and AST-preserving upgrades up to Kubernetes 1.32.*

**Author:** Pablo Loschi  
**Tags:** Kubernetes, DevOps, GitOps, Platform Engineering, SRE, Cloud Native  
**Reading Time:** ~6 min  

---

If you manage Kubernetes clusters in production, you know the quiet dread that accompanies a major version upgrade notice.

It usually starts innocently in Slack:

> *"Hey team, EKS/GKE is dropping support for Kubernetes 1.25 next month. We need to upgrade all clusters to 1.28."*

Then reality sets in.

Over the past few releases, Kubernetes has systematically retired dozens of core APIs:
- `extensions/v1beta1` and `apps/v1beta1` were stripped in **v1.16**.
- Ingress `v1beta1` and RBAC `v1beta1` were removed in **v1.22**.
- `CronJob` (`batch/v1beta1`), `PodDisruptionBudget` (`policy/v1beta1`), and `PodSecurityPolicy` were purged in **v1.25**.
- `HorizontalPodAutoscaler` `v2beta2` disappeared in **v1.26**.
- `CSIStorageCapacity` beta API was removed in **v1.27**.
- `FlowControl` beta APIs were dropped in **v1.29 and v1.32**.

When an API version is removed from the Kubernetes API server, any manifest still using that `apiVersion` is rejected on `kubectl apply`. In a company managing dozens of GitOps repositories (ArgoCD, Flux, or plain YAMLs), upgrading them by hand is a massive, stressful chore.

---

### The Flawed Options We All Tried

| Core Capability | Pluto (Fairwinds) | `kubectl-convert` (Official) | **Janos 2.2** |
| :--- | :---: | :---: | :---: |
| **Fixes manifests in-place?** | ❌ No (Read-only auditor) | ❌ No (Single file to stdout) | ✅ **Yes, recursive directory updates** |
| **Preserves YAML comments?** | N/A (Doesn't modify files) | ❌ **Strips 100% of comments** | ✅ **100% Preserved (AST engine)** |
| **Live Cluster & Helm Audit?** | ✅ Yes (Helm & cluster read-only) | ❌ No | ✅ **Yes (`--cluster`, `--chart`, unrendered templates)** |
| **Target Version Gating?** | ⚠️ Filter only | ❌ No (Forces latest API, breaking staged upgrades) | ✅ **`--target-version <v>` safe incremental upgrades** |
| **Ingress ➔ Gateway API?** | ❌ No | ❌ No | ✅ **Built-in (`--ingress-to-gateway`)** |

---

### Enter Janos 2.2: The Complete Migration Toolkit

Today, I’m thrilled to release **Janos 2.2**: introducing live cluster auditing, interactive confirmation, and clear severity tagging.

---

### What’s New in Janos 2.2?

#### 1. 🌐 Live Cluster Auditing (`--cluster` / `--live`)
Audit your running Kubernetes clusters directly via `kubectl` without deploying any pods, CRDs, or agents:
```sh
# Audit all workloads across the current cluster context:
npx janos --cluster --audit

# Filter to a specific namespace or kubeconfig:
npx janos --cluster --namespace staging --audit

# Only show APIs that will break on Kubernetes 1.25:
npx janos --cluster --audit --target-version 1.25 --only-removed
```

#### 2. 💬 Interactive Confirmation Mode (`-i / --interactive`)
Just like `git add -p`, Janos lets you inspect and confirm every file modification individually with `[y/n/d/a/q]`:
```sh
npx janos -d ./k8s -i
```
Press `d` to preview the colored diff, `y` to accept, `n` to skip, `a` to apply all remaining files, or `q` to abort safely.

#### 3. 🚨 Status Severity Tagging (`REMOVED` vs `DEPRECATED`)
Audit reports now clearly differentiate between `🔴 REMOVED` (APIs already purged that will hard-crash deployments) and `🟡 DEPRECATED` (APIs that still work but have a newer replacement).

#### 4. 🛡️ 100% AST Comment & Formatting Preservation
Janos uses an AST (Concrete Syntax Tree) engine rather than converting YAML to plain dictionaries. It mutates only the targeted keys while keeping **every header comment, inline comment, anchor, and blank line exactly where you left it**.

#### 5. ⎈ First-Class Helm & Unix Pipeline Integration
- **Direct Chart Rendering (`--chart`)**: Point Janos at your chart directory (`janos --chart ./my-chart --values ./prod.yaml --audit`).
- **Template Migration Preserving Go Expressions**: Safely updates `apiVersion`s in unrendered template files while keeping `{{ ... }}` Go tags untouched.
- **STDIN Streaming (`helm | janos -`)**: Stream rendered templates from Helm or Kustomize directly via standard input (`helm template ... | janos - --diff`).

#### 6. 🌉 Ingress to Gateway API Migration (`--ingress-to-gateway`)
Automatically converts legacy Ingress manifests into modern Gateway API `HTTPRoute` (and companion `Gateway`) manifests with path matching, URL rewrites, and SSL redirect filters.

---

### Quick Start (Zero-Install)

Run with `npx` with zero setup:

```sh
# 1. Audit your live Kubernetes cluster:
npx janos --cluster --audit

# 2. Audit your repository manifests:
npx janos --audit -d ./k8s

# 3. Preview changes with a colorized unified diff:
npx janos -d ./k8s --dry-run --diff

# 4. Migrate with interactive confirmation:
npx janos -d ./k8s -i
```

---

### Open Source & Community

Janos is 100% free and open-source under the Apache 2.0 license:

👉 **GitHub Repository**: [https://github.com/pgold30/janos](https://github.com/pgold30/janos)

Give it a star on GitHub, test it on your manifests, and let me know your feedback!

---

## Part 2: LinkedIn Announcement Post

```text
🛑 Stop letting `kubectl-convert` delete all your YAML comments.
And stop using read-only auditors that leave the fixing to you.

If you’ve ever upgraded a Kubernetes cluster across versions (1.22, 1.25, 1.28+), you know the GitOps pain:
❌ Ingress extensions/v1beta1 removed
❌ CronJob batch/v1beta1 removed
❌ PodDisruptionBudget policy/v1beta1 removed
❌ HPA v2beta2 removed
❌ Ingress schema changes breaking your routing
❌ Go template expressions in Helm charts breaking standard YAML tools

Existing options have real drawbacks:
• Pluto tells you what’s broken, but won’t fix it.
• `kubectl-convert` updates files, but wipes out 100% of your comments and documentation.
• Regex find-and-replace produces broken schemas (like Ingress v1 pathType).

That’s why I built and just released **Janos 2.2** 🛡️🚀

Here is what makes it the ultimate migration toolkit:
✨ 100% Comment Preservation: AST-powered engine that keeps all your `# comments`, indentation, and blank lines intact.
✨ Live Cluster Auditing: `janos --cluster --audit` queries your cluster directly via kubectl without in-cluster agents.
✨ Interactive Confirmation Mode: `janos -d ./k8s -i` lets you review each change with [y/n/d/a/q] just like git add -p.
✨ Status Severity Tagging: Clearly distinguishes between 🔴 REMOVED (hard broken) and 🟡 DEPRECATED APIs.
✨ First-Class Helm Integration: Direct chart auditing (`--chart`), unrendered template migration preserving Go `{{ ... }}` tags, and STDIN pipe streaming (`helm template | janos -`).
✨ Target Version Gating: `--target-version 1.25` lets you migrate only up to your target cluster version without jumping ahead.
✨ Ingress to Gateway API: Built-in `--ingress-to-gateway` transforms legacy Ingress into modern Gateway API `HTTPRoute`s with zero downtime.
✨ CI/CD Automation: Official GitHub Action (`uses: pgold30/janos@master`), native PR line annotations, and pre-commit hooks.
✨ Zero-Install: Run immediately anywhere with `npx janos --cluster --audit` or `npx janos -d ./k8s --diff`.

Check out the project on GitHub:
👉 https://github.com/pgold30/janos

Platform Engineers & SREs: How many deprecated Ingress manifests or Helm templates are sitting in your GitOps repos right now? Let's discuss in the comments! 👇

#Kubernetes #DevOps #GitOps #PlatformEngineering #CloudNative #SRE #OpenSource #K8s #Helm #GatewayAPI
```
