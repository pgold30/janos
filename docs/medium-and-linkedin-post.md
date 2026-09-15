# 📝 Community Announcement Pack: Janos 2.1

This document contains ready-to-publish content for Medium and LinkedIn to announce the launch of **Janos 2.1**.

---

## Part 1: Medium Article

**Title:**
# Stop Letting Kubernetes Upgrades Break Your GitOps Repos: Introducing Janos 2.1

**Subtitle:**
*Why `kubectl-convert` ruins your YAML comments, how we automated deprecations up to Kubernetes 1.32, seamless Helm & Kustomize integration, and an effortless bridge to the Gateway API.*

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

### The Problem with `kubectl-convert` (and regex find-and-replace)

When engineers first realize they need to upgrade manifests across 50 microservices, they usually try one of three things:

1. **Regex Find-and-Replace**:  
   This inevitably backfires. Kubernetes migrations aren't just string substitutions; they involve **structural schema changes**.  
   For example, in Ingress `networking.k8s.io/v1`, `serviceName` and `servicePort` became nested under `service: { name, port: { number } }`, and `pathType` became mandatory. A regex find-and-replace silently generates invalid manifests that crash during deployment.

2. **The Official `kubectl-convert` Plugin**:  
   `kubectl-convert` was removed from the default `kubectl` binary years ago, requiring architecture-specific manual installs. But the real deal-breaker?  
   **It deletes every single comment in your YAML files.**  
   Because it parses into Go structs and re-encodes, it wipes `# Managed by ArgoCD`, `# Helm values`, `# On-call review required`, and custom spacing. No platform team wants an automated tool erasing team documentation.

3. **Pluto & Kubent**:  
   Awesome tools for *detecting* deprecations, but they are **strictly read-only**. They tell you where your cluster is going to break, but leave the manual editing to you.

---

### Enter Janos 2.1: The In-Place GitOps Upgrader

Two years ago, I created **Janos** (named after the Roman two-faced god of transitions and gateways) to solve this exact headache.

Today, I’m thrilled to release **Janos 2.1**: a complete, zero-dependency modernization designed for modern Kubernetes environments.

---

### What’s New in Janos 2.1?

#### 1. 🛡️ 100% AST Comment & Formatting Preservation
Janos uses an AST (Concrete Syntax Tree) engine rather than converting YAML to plain dictionaries. It mutates only the targeted keys while keeping **every header comment, inline comment, anchor, and blank line exactly where you left it**.

#### 2. ⎈ First-Class Helm & Unix Pipeline Integration
Real-world Kubernetes codebases don't just store static YAML; they use Helm charts and Kustomize overlays. Janos 2.1 provides complete Helm integration:
- **Direct Chart Rendering (`--chart`)**: Point Janos at your chart directory (`janos --chart ./my-chart --values ./prod.yaml --audit`). It renders via `helm template` under the hood and audits cluster manifests against your target version.
- **Template Migration Preserving Go Expressions**: If you have raw template files with `{{ include ... }}` or `{{- if ... }}`, Janos safely detects and updates deprecated `apiVersion:` lines while preserving every single Go template tag byte-for-byte.
- **STDIN Streaming (`helm | janos -`)**: Stream rendered templates from Helm or Kustomize directly via standard input (`helm template ... | janos - --diff`).

#### 3. 🎯 Target Version Gating (`--target-version 1.25`)
If your organization is upgrading from 1.21 to 1.25, you don’t want a tool that prematurely applies 1.26 or 1.29 deprecations before your clusters are ready. With `--target-version`, Janos only applies migrations up to your chosen Kubernetes version.

#### 4. 🌉 Ingress to Gateway API Migration (`--ingress-to-gateway`)
With the retirement of `ingress-nginx` and the rise of the **Kubernetes Gateway API**, migrating from Ingress to `HTTPRoute` is the biggest architectural shift in Kubernetes networking today.

Janos automatically converts Ingress manifests into modern Gateway API `HTTPRoute` (and companion `Gateway`) manifests:
- Translates `rules` and `paths` to `matches.path` (`PathPrefix` and `Exact`).
- Maps `serviceName`/`servicePort` to `backendRefs`.
- Converts Ingress classes to `parentRefs`.
- Translates rewrite annotations (`nginx.ingress.kubernetes.io/rewrite-target`) into standard `URLRewrite` filters.
- Translates SSL redirects (`nginx.ingress.kubernetes.io/ssl-redirect`) into Gateway API `RequestRedirect` filters.

#### 5. 📊 Pluto-Style Read-Only Audit & PR Markdown Reports
Want to know what's deprecated before touching anything?
```sh
# Terminal ASCII summary table:
npx janos --audit -d ./k8s

# Check only APIs completely removed in your target version:
npx janos --audit -d ./k8s --target-version 1.25 --only-removed

# GitHub Actions PR comment Markdown report:
npx janos --audit -d ./k8s --format markdown --output-file report.md
```

#### 6. 🤖 Official GitHub Action & Pre-commit Hooks
Drop Janos directly into your workflows with zero setup:
- GitHub Action: `uses: pgold30/janos@master` with native PR line annotations (`::warning`) and job summary publishing.
- Pre-commit Hook: `.pre-commit-hooks.yaml` for pre-commit verification.

---

### Quick Start (Zero-Install)

No need to install anything or configure environments. Just run with `npx`:

```sh
# 1. Audit your repository:
npx janos --audit -d ./k8s

# 2. Preview changes with a colorized unified diff:
npx janos -d ./k8s --dry-run --diff

# 3. Apply changes in-place:
npx janos -d ./k8s
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

That’s why I built and just released **Janos 2.1** 🛡️🚀

Here is what makes it the ultimate migration toolkit:
✨ 100% Comment Preservation: AST-powered engine that keeps all your `# comments`, indentation, and blank lines intact.
✨ First-Class Helm Integration: Direct chart auditing (`--chart`), unrendered template migration preserving Go `{{ ... }}` tags, and STDIN pipe streaming (`helm template | janos -`).
✨ Target Version Gating: `--target-version 1.25` lets you migrate only up to your target cluster version without jumping ahead.
✨ Ingress to Gateway API: Built-in `--ingress-to-gateway` transforms legacy Ingress into modern Gateway API `HTTPRoute`s with zero downtime.
✨ Pluto-Style Audit & Filtering: Run `--audit` or `--only-removed` to get an instant overview table of deprecated APIs across your repo.
✨ CI/CD Automation: Official GitHub Action (`uses: pgold30/janos@master`), native PR line annotations, and pre-commit hooks.
✨ Zero-Install: Run immediately anywhere with `npx janos -d ./k8s --diff`.

Check out the project on GitHub:
👉 https://github.com/pgold30/janos

Platform Engineers & SREs: How many deprecated Ingress manifests or Helm templates are sitting in your GitOps repos right now? Let's discuss in the comments! 👇

#Kubernetes #DevOps #GitOps #PlatformEngineering #CloudNative #SRE #OpenSource #K8s #Helm #GatewayAPI
```
