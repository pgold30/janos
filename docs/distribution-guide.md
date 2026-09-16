# 🚀 Janos 2.2 — Complete Launch & Multi-Channel Distribution Guide

**Launch Date:** Wednesday, September 16, 2026  
**Goal:** Maximize open-source adoption, GitHub stars, practitioner feedback, and viral distribution across the global Kubernetes, DevOps, and Platform Engineering ecosystem.

---

## 📅 Chronological Launch Schedule (Berlin / CEST Timezone)

| Platform | Channel / Community | Best Posting Time (CEST) | Focus / Objective |
| :--- | :--- | :---: | :--- |
| 📰 **Medium** | Personal Profile / Publications | **14:00 – 14:30** | Canonical deep-dive article & technical authority |
| 💼 **LinkedIn** | Personal Profile | **15:30 – 16:30** | Professional network reach (EU afternoon + US East 9:30 AM) |
| 💬 **Kubernetes Slack** | `#gitops`, `#sig-network`, `#kubernetes-users` | **16:00 – 17:00** | Core Kubernetes practitioner feedback |
| 💬 **CNCF Slack** | `#gitops`, `#tools`, `#show-and-tell` | **16:00 – 17:00** | Cloud-native platform engineers |
| 💬 **Platform Eng Slack** | `#tools`, `#general` | **16:00 – 17:00** | Internal Developer Platform builders |
| 🤖 **Reddit** | `r/kubernetes` & `r/devops` | **16:30 – 17:30** | High-velocity organic technical discussion |
| 🟧 **Hacker News** | `Show HN` | **17:00 – 18:00** | Global developer discovery & front-page potential |
| 📬 **Newsletters** | KubeWeekly, DevOps Weekly | **Anytime Today** | Long-tail weekly organic discovery |

---

## Step 1 (14:00 – 14:30 CEST): 📰 Medium Article

### Publishing Checklist
- **Canonical Article Draft**: Available in [`docs/medium_draft.md`](./medium_draft.md).
- **Suggested Tags**: `Kubernetes`, `DevOps`, `GitOps`, `Platform Engineering`, `Cloud Native`.
- **Target Publications to submit to**: *Towards AWS / Towards Dev*, *DevOps.dev*, or *ITNEXT*.
- **Cover Image**: Use the official logo (`assets/logo.png`) or a terminal screenshot of the colored diff.
- **Story URL / Slug**: `stop-letting-kubernetes-upgrades-break-your-gitops-repos-introducing-janos`

---

## Step 2 (15:30 – 16:30 CEST): 💼 LinkedIn Announcement

*Why this timing?* At 15:30 CEST, Europe is actively online wrapping up the afternoon, and the US East Coast is starting their workday (9:30 AM EST).

### 📋 Copy-Paste LinkedIn Post

```text
🛑 Stop letting `kubectl-convert` delete all your YAML comments.
And stop relying on read-only auditors that leave the manual fixing to you.

If you’ve ever upgraded a Kubernetes cluster across versions (1.22, 1.25, 1.28, or 1.32), you know the GitOps headache:
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

Here is what makes it different:
✨ 100% Comment Preservation: AST-powered engine that keeps all your # comments, indentation, and blank lines intact.
✨ Live Cluster Auditing: `janos --cluster --audit` queries your running cluster directly via kubectl without deploying in-cluster agents.
✨ Interactive Confirmation Mode: `janos -d ./k8s -i` lets you review each change with [y/n/d/a/q] just like `git add -p`.
✨ Status Severity Tagging: Clearly distinguishes between 🔴 REMOVED (hard broken) and 🟡 DEPRECATED APIs.
✨ First-Class Helm Support: Direct chart auditing (`--chart`), unrendered template migration preserving Go {{ ... }} tags, and STDIN pipe streaming (`helm template | janos -`).
✨ Target Version Gating: `--target-version 1.25` lets you migrate only up to your target cluster version without jumping ahead.
✨ Ingress to Gateway API: Built-in `--ingress-to-gateway` transforms legacy Ingress into modern Gateway API HTTPRoutes with zero downtime.
✨ CI/CD Automation: Official GitHub Action (`uses: pgold30/janos@master`), native PR line annotations, and pre-commit hooks.
✨ Zero-Install: Run immediately anywhere with `npx janos --cluster --audit` or `npx janos -d ./k8s --diff`.

Check out the project on GitHub:
👉 https://github.com/pgold30/janos

Medium deep dive:
👉 [Link to your published Medium article]

Platform Engineers & SREs: How many deprecated Ingress manifests or batch/v1beta1 CronJobs are sitting in your GitOps repos right now? Let's discuss in the comments! 👇

#Kubernetes #DevOps #GitOps #PlatformEngineering #CloudNative #SRE #OpenSource #K8s #Helm #GatewayAPI
```

> **Pro Tip for LinkedIn:**
> Post the text with the logo image attached directly to the post, then paste the GitHub & Medium links in the post or as the very first comment to maximize algorithm reach.

---

## Step 3 (16:00 – 17:00 CEST): 💬 Kubernetes Community Slacks

Slack communities value genuine utility and hate corporate self-promotion. Each message below is written to respect community etiquette.

### A. Kubernetes Slack (`slack.k8s.io`)

#### Channel 1: `#gitops`
```text
Hey everyone! 👋 Wanted to share a free open-source tool I built called *Janos* (Apache 2.0) to solve a painful GitOps problem.

When upgrading clusters across versions (e.g. 1.22, 1.25, 1.28), updating deprecated APIs across dozens of GitOps repos usually meant either:
1. `kubectl-convert` — which parses into Go structs and completely deletes every single YAML `# comment` and custom spacing in your repo.
2. Read-only tools like Pluto — which identify deprecations but leave all the manual editing to you.

Janos is an AST-aware migrator that:
• Audits deprecated/removed APIs and updates files in-place while keeping 100% of comments and indentation intact.
• Supports interactive mode (`janos -d ./k8s -i`) with `[y/n/d/a/q]` confirmation prompts just like `git add -p`.
• Supports `--target-version` gating so you don't prematurely apply future changes.
• Works directly on unrendered Helm templates preserving `{{ ... }}` Go tags, or via Unix piping (`helm template | janos - --diff`).
• Includes a built-in Ingress -> Gateway API HTTPRoute translator.

Zero install required: `npx janos --audit -d ./k8s`

GitHub repo: https://github.com/pgold30/janos
Would love feedback on how it performs against your GitOps repos!
```

#### Channel 2: `#sig-network`
```text
Hi everyone! 👋 With Ingress-NGINX retiring and the community moving to the Gateway API, migrating large repositories from Ingress to HTTPRoute can be tedious.

As part of *Janos 2.2* (an open-source AST migration tool), we added an automated `--ingress-to-gateway` converter:
• Translates rules and paths into `HTTPRoute.spec.rules[*].matches.path` (`PathPrefix` and `Exact`).
• Converts `serviceName`/`servicePort` to `backendRefs`.
• Translates NGINX rewrite annotations into standard `URLRewrite` filters.
• Translates SSL redirect annotations into `RequestRedirect` filters (port 443, 301).
• Optionally generates companion Gateway resources with HTTP/HTTPS listeners (`--generate-gateway`).

You can test it on any ingress file with zero install:
`npx janos --ingress-to-gateway -f ingress.yaml`

Repo: https://github.com/pgold30/janos
Feedback from network folks is very welcome!
```

#### Channel 3: `#kubernetes-users`
```text
Hey folks! If anyone is preparing for a cluster upgrade (1.22 -> 1.25 or 1.28+), I built an open-source CLI called *Janos* that might save you hours of work.

It lets you:
1. Audit your live running cluster for deprecated APIs without installing any agent:
`npx janos --cluster --audit`
2. Preview unified color diffs of manifest changes:
`npx janos -d ./k8s --dry-run --diff`
3. Upgrade manifests in-place while preserving 100% of your YAML comments:
`npx janos -d ./k8s -i`

Apache 2.0 open-source: https://github.com/pgold30/janos
Hope it helps make cluster upgrades a little less stressful!
```

---

### B. CNCF Slack (`cloud-native.slack.com`)

#### Channel: `#tools` & `#gitops`
```text
Hello cloud-native community! 👋 

Sharing a lightweight tool we built to solve Kubernetes API deprecation upgrades across GitOps repositories without stripping YAML comments: *Janos 2.2*.

Unlike `kubectl-convert` (which strips comments) and Pluto (which is read-only), Janos:
- Uses a Concrete Syntax Tree (AST) engine to preserve header/inline comments, formatting, and anchors.
- Can audit live clusters directly via `kubectl get` without deploying in-cluster pods or CRDs (`janos --cluster --audit`).
- Safely handles unrendered Helm templates containing `{{ .Values... }}` interpolations.
- Has interactive confirmation mode (`-i`) and target version gating (`--target-version 1.25`).
- Has built-in Ingress to Gateway API migration (`--ingress-to-gateway`).

GitHub: https://github.com/pgold30/janos
Zero install: `npx janos -d ./k8s --diff`

Feedback, issues, and PRs are warmly welcome!
```

---

### C. Platform Engineering Slack (`platformengineering.org/slack`)

#### Channel: `#tools` & `#general`
```text
Hey platform engineers! 🛠️

One common headache we all face when maintaining Internal Developer Platforms is managing Kubernetes API deprecation upgrades across hundreds of developer microservice repositories.

Manual find-and-replace breaks schemas (especially Ingress v1 and HPA v2), while `kubectl-convert` wipes out all the comments developers and platform teams left in the YAMLs.

We built *Janos* to automate this safely:
- Updates files in-place or runs as an automated CI PR check (`--check --format markdown`).
- Preserves 100% of comments and formatting.
- Features interactive review mode (`janos -d ./k8s -i`) and live cluster auditing (`janos --cluster --audit`).
- Translates Ingresses to modern Gateway API HTTPRoutes.

Check it out: https://github.com/pgold30/janos
Feedback from IDP teams would be amazing!
```

---

## Step 4 (16:30 – 17:30 CEST): 🤖 Reddit (`r/kubernetes` & `r/devops`)

*Why this timing?* US East Coast is at lunch (11:00 AM), US West Coast is waking up (8:00 AM), and Europe is active in the evening.

### Subreddit: `r/kubernetes`

**Title:**
`[Tool] Janos 2.2 — An open-source Kubernetes deprecation upgrader that preserves 100% of YAML comments, audits live clusters, and migrates Ingress to Gateway API`

**Post Content:**
```markdown
Hey r/kubernetes!

If you manage Kubernetes clusters in production, you know the dread of major version upgrades (v1.16 workloads, v1.22 Ingress & RBAC, v1.25 CronJob & PDB, v1.26 HPA, and v1.29+ FlowControl).

When preparing manifests across dozens of GitOps repositories, the existing tool options have always felt incomplete:

1. **`kubectl-convert` (Official plugin)**: It was removed from standard `kubectl` years ago, but the real deal-breaker is that it deserializes into Go internal structs and re-encodes. In doing so, it **completely wipes out 100% of comments** (`# Managed by ArgoCD`, `# Critical threshold`, etc.) and ruins custom indentation.
2. **Pluto / Kubent**: Fantastic tools for identifying deprecated APIs, but they are strictly **read-only**. They tell you where your cluster will break, but leave all the manual editing and schema restructuring to you.

I created **Janos** (Apache 2.0) to bridge this gap, and today we just released **v2.2**:

### What makes it different:

- **🛡️ 100% AST Comment Preservation**: Rather than converting YAML to plain dictionaries, Janos parses manifests into a Concrete Syntax Tree (AST). It mutates only the deprecated `apiVersion` and schema fields while keeping every header comment, inline comment, anchor, and blank line exactly where you left it.
- **🌐 Live Cluster Auditing (`--cluster` / `--live`)**: Connects directly via your existing `kubectl` context to audit running workloads across all namespaces without installing any in-cluster agents or CRDs.
- **💬 Interactive Confirmation Mode (`-i`)**: Just like `git add -p`, review each modified file with `[y/n/d/a/q]` prompts and ANSI color unified diff previews before touching disk.
- **🎯 Target Version Gating (`--target-version 1.25`)**: Migrating from 1.22 to 1.25? It only applies deprecations up to 1.25, leaving future removals (1.26, 1.29) untouched.
- **🌉 Ingress to Gateway API (`--ingress-to-gateway`)**: Translates legacy Ingress manifests into modern Gateway API `HTTPRoute` resources (mapping paths, backends, URL rewrites, and SSL redirect filters).
- **⎈ First-Class Helm & Unix Stream Support**: Audits charts via `helm template` under the hood, safely updates raw `templates/*.yaml` files while keeping all `{{ ... }}` Go template expressions byte-for-byte intact, and accepts streamed inputs (`helm template ... | janos - --diff`).
- **🚨 Severity Tagging**: Explicitly flags `🔴 REMOVED` vs `🟡 DEPRECATED` APIs in terminal tables, Markdown PR reports, and JSON.

### Quick Start (Zero Install):

```sh
# 1. Audit a live cluster:
npx janos --cluster --audit

# 2. Audit repo manifests:
npx janos --audit -d ./k8s

# 3. Preview changes with colored diffs:
npx janos -d ./k8s --dry-run --diff

# 4. Migrate with interactive confirmation:
npx janos -d ./k8s -i
```

GitHub Repository: https://github.com/pgold30/janos

Zero runtime dependencies beyond Node's native test runner and the `yaml` AST library.

Would love to hear your thoughts, feedback, or edge-case manifests!
```

---

### Subreddit: `r/devops`

**Title:**
`Stop letting kubectl-convert wipe your YAML comments: We built Janos 2.2 to automate Kubernetes deprecation upgrades in-place`

**Post Content:**
*(Use the same post content as above, keeping the technical focus).*

---

## Step 5 (17:00 – 18:00 CEST): 🟧 Hacker News (`Show HN`)

*Why this timing?* 17:00 CEST is 11:00 AM EST and 8:00 AM PST — the golden window for Hacker News front-page submissions.

### Submission Details

- **URL**: `https://github.com/pgold30/janos`
- **Title**: `Show HN: Janos – In-place Kubernetes manifest upgrades without deleting comments`

### First Comment (Post immediately after submitting):

```text
Hi HN! Creator of Janos here.

Whenever a major Kubernetes version upgrade happens (1.22, 1.25, 1.28, etc.), platform teams have to update dozens or hundreds of manifests across GitOps repositories because removed APIs are rejected by the API server.

Most teams either try:
1. Regex find-and-replace: This fails because schemas structurally change (e.g. Ingress v1 requiring nested service/port objects and mandatory pathTypes).
2. The official `kubectl-convert` plugin: Because it parses into Go structs and re-encodes, it completely deletes every single YAML comment (# Managed by ArgoCD, inline docs, spacing) and only operates on single files to stdout.
3. Fairwinds' Pluto: A great tool, but strictly read-only.

I built Janos to do in-place migrations while preserving 100% of comments, formatting, and anchors by mutating the YAML Abstract Syntax Tree (AST) directly.

In version 2.2 released today, we added:
- Live cluster auditing via kubectl (`janos --cluster --audit`)
- Interactive confirmation mode (`janos -d ./k8s -i`, like `git add -p`)
- Target version gating (`--target-version 1.25`) so you don't prematurely apply future breaking changes
- Ingress to Gateway API (`HTTPRoute`) conversion
- Helm support (rendering charts, piping streams, or safely migrating raw templates with `{{ ... }}` Go expressions preserved)

It runs with zero installation via `npx janos -d ./k8s --diff`.

Code is Apache 2.0: https://github.com/pgold30/janos

I’d love to hear your feedback on the AST approach and how you currently handle Kubernetes deprecation cycles!
```

---

## Step 6 (Anytime Today): 📬 Newsletter Submissions

Submit Janos to the top cloud-native and DevOps weekly digests:

### 1. KubeWeekly (Official CNCF Newsletter)
- **Submission Link**: https://github.com/cncf/kubeweekly/issues/new/choose
- **Blurb**:
  > **Janos 2.2**: An open-source CLI to audit deprecated Kubernetes APIs in live clusters or GitOps repositories, migrate manifests in-place while keeping 100% of YAML comments intact, and convert legacy Ingresses to the modern Gateway API. https://github.com/pgold30/janos

### 2. DevOps Weekly
- **Submission Email**: `news@devopsweekly.com`
- **Subject**: Submission: Janos - In-place Kubernetes manifest migrations preserving YAML comments
- **Body**:
  > Hi Gareth,  
  > Janos 2.2 is an open-source tool designed to automate Kubernetes manifest upgrades (1.16 through 1.32+) across GitOps repositories. Unlike kubectl-convert (which deletes all comments) or Pluto (which is read-only), Janos updates manifests in-place while preserving 100% of comments and formatting via an AST engine. It also includes live cluster auditing via kubectl and Ingress-to-Gateway API conversion.  
  > Repo: https://github.com/pgold30/janos

### 3. Pointer & Console.dev
- **Console.dev Submit**: https://console.dev/submit/
- **Description**: Open source CLI for automated Kubernetes manifest migration and Gateway API transition with AST comment preservation.

---

## 💡 Quick Tips for Today
1. **Engage with Every Comment**: On Reddit, Hacker News, and LinkedIn, replying to the first 5-10 comments within 15 minutes dramatically boosts algorithmic reach.
2. **Be Humble & Helpful**: When users mention other tools (Pluto, kubent, kubectl-convert), praise those tools for what they do well while clearly illustrating the specific AST/comment preservation niche Janos fills.
3. **Star Milestone Updates**: If the repo crosses 100, 250, or 500 stars today, share a quick celebratory screenshot in the comments on LinkedIn and Twitter/X!
