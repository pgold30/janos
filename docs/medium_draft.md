# Stop Letting Kubernetes Upgrades Break Your GitOps Repos: Introducing Janos 2.0

> **Subtitle:** *Why `kubectl-convert` ruins your YAML comments, how we automated deprecations up to Kubernetes 1.32, and an effortless bridge to the Gateway API.*
> **Author:** Pablo Loschi  
> **Tags:** Kubernetes, DevOps, GitOps, Platform Engineering, SRE, Cloud Native  
> **Reading Time:** ~6 min  

---

![Janos Logo](https://raw.githubusercontent.com/pgold30/janos/master/assets/logo.png)
*(Image suggestion: Place the official Janos logo or a screenshot of the colored diff terminal output here)*

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

When platform engineers first realize they need to upgrade hundreds of manifests across dozens of microservices, they usually try one of three things:

### 1. Regex Find-and-Replace (The Dangerous Shortcut)
This almost always backfires. Kubernetes upgrades aren't just string substitutions; they involve **structural schema changes**.

For instance, when Ingress moved to `networking.k8s.io/v1`:
- `serviceName` and `servicePort` became nested under `service: { name, port: { number } }`.
- `spec.backend` was renamed to `spec.defaultBackend`.
- `pathType` became mandatory (`Prefix` or `Exact`).

A regex find-and-replace silently produces invalid YAML manifests that pass syntax checks but crash your CI/CD pipelines during deployment.

### 2. The Official `kubectl-convert` Plugin (The Comment Destroyer)
Kubernetes has an official plugin called `kubectl-convert`. But if you've ever tried using it in production, you quickly encountered two major deal-breakers:
1. **It was removed from standard `kubectl` years ago**: You have to hunt down separate architecture-specific binaries from dl.k8s.io.
2. **It strips 100% of your YAML comments**: Because it parses manifests into Go internal structs and re-serializes them, every `# Managed by ArgoCD`, `# Scale threshold`, `# Review needed`, and custom indentation is wiped out. In a team codebase, losing documentation and comments is unacceptable.
3. **No recursive repo updates**: It only processes single files via stdout (`cat file | kubectl-convert -f -`).

### 3. Pluto & Kubent (Great at Pointing Fingers, Bad at Fixing)
Tools like Fairwinds' **Pluto** and **Kube No Trouble (kubent)** are fantastic for *detecting* deprecated APIs. But they are **strictly read-only**. They generate a scary list of everything that will break in your cluster, but leave the manual editing entirely to you.

---

## Enter Janos 2.0: The In-Place GitOps Upgrader

Two years ago, I built **Janos** — named after the Roman two-faced god of transitions, doors, and passages who looks simultaneously into the past and into the future.

Today, I’m excited to release **Janos 2.0**: a complete, zero-dependency modernization designed for modern Kubernetes environments (v1.16 through v1.32+).

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

### 2. 🎯 Target Version Gating (`--target-version 1.25`)

If your company is upgrading from Kubernetes 1.21 to 1.25, you do **not** want a tool that prematurely converts APIs that require 1.26 or 1.29 (such as HPA `v2` metrics or FlowControl `v1`).

With `--target-version`, Janos only applies migrations up to your chosen release:

```sh
npx janos -d ./k8s-manifests --target-version 1.25 --diff
```

Migrations for future versions are skipped, keeping your manifests compatible with your target cluster.

---

### 3. 🌉 Ingress to Gateway API Migration (`--ingress-to-gateway`)

With the retirement of `ingress-nginx` and the industry-wide shift toward the **Kubernetes Gateway API**, migrating from Ingress to `HTTPRoute` is the biggest networking transition happening today.

Inspired by the SIG-Network `ingress2gateway` initiative, Janos 2.0 includes a built-in migration engine to convert legacy Ingress manifests into modern Gateway API resources:

```sh
# Generate HTTPRoute alongside your Ingress:
npx janos --ingress-to-gateway -f ingress.yaml

# Generate HTTPRoute AND companion Gateway manifest:
npx janos --ingress-to-gateway --generate-gateway -f ingress.yaml --out gateway.yaml
```

Janos automatically:
- Maps `spec.rules[*].host` to `HTTPRoute.spec.hostnames`.
- Translates paths to `matches.path` (`PathPrefix` and `Exact`).
- Converts `serviceName`/`servicePort` to `backendRefs`.
- Maps Ingress classes to `parentRefs`.
- Converts NGINX rewrite annotations (`nginx.ingress.kubernetes.io/rewrite-target`) into standard `URLRewrite` filters.

---

### 4. 📊 Pluto-Style Read-Only Audit & PR Markdown Tables

Want to know what's deprecated before modifying anything?

```sh
npx janos --audit -d ./k8s
```

Janos prints an ASCII table summarizing every deprecated resource, its target version, and where it was removed:

```text
┌─────────────────────────┬────────────────────────┬────────────────────────────────────┬──────────────────────────────┬────────────┬─────────────────────┐
│ Kind                    │ Name                   │ Current API                        │ Target API                   │ Removed In │ File                │
├─────────────────────────┼────────────────────────┼────────────────────────────────────┼──────────────────────────────┼────────────┼─────────────────────┤
│ Ingress                 │ web-router             │ extensions/v1beta1                 │ networking.k8s.io/v1         │ v1.22      │ k8s/ingress.yaml    │
│ CronJob                 │ maintenance-task       │ batch/v1beta1                      │ batch/v1                     │ v1.25      │ k8s/cron.yaml       │
│ HorizontalPodAutoscaler │ autoscaler-hpa         │ autoscaling/v2beta1                │ autoscaling/v2               │ v1.25      │ k8s/hpa.yaml        │
└─────────────────────────┴────────────────────────┴────────────────────────────────────┴──────────────────────────────┴────────────┴─────────────────────┘

Summary: 3 deprecated resource(s) found across 3 file(s).
```

Need to automate this in CI? Pass `--format markdown`:

```sh
npx janos --audit -d ./k8s --format markdown > report.md
```

You can post this Markdown directly as a pull request comment in GitHub Actions to alert developers when they introduce deprecated APIs.

---

### 5. 🔎 Safe Preview with Colored Unified Diffs

Never let an automated tool blindly overwrite production code. Janos provides an ANSI color-coded unified diff preview:

```sh
npx janos -d ./k8s-manifests --dry-run --diff
```

You'll see green (`+`) and red (`-`) lines showing exactly what will change before a single file on disk is touched.

---

## Quick Start (Zero Installation Required)

You don’t need to clone the repository or configure any environment. As long as you have Node.js 18+ installed, run it directly via `npx`:

```sh
# 1. Audit your repo:
npx janos --audit -d ./k8s

# 2. Preview changes with color diffs:
npx janos -d ./k8s --dry-run --diff

# 3. Apply changes in-place:
npx janos -d ./k8s
```

Or run via Docker:

```sh
docker run --rm -v $(pwd):/var/janos pgold30/janos -d ./k8s --diff
```

---

## Get Involved & Star the Project

Janos is 100% free and open-source under the Apache 2.0 license:

👉 **GitHub Repository**: [https://github.com/pgold30/janos](https://github.com/pgold30/janos)

If Janos saves your team hours of migration work, please consider giving it a ⭐ on GitHub and sharing it with your platform engineering team!

---

*How is your team handling the transition away from deprecated Kubernetes APIs and Ingress-NGINX? Drop your thoughts in the comments below!*
