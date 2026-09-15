# 📝 Community Announcement Pack: Janos 2.0

This document contains ready-to-publish content for Medium and LinkedIn to announce the launch of **Janos 2.0**.

---

## Part 1: Medium Article

**Title:**
# Migrating to Kubernetes 1.30+ Without Breaking Your GitOps: Introducing Janos 2.0

**Subtitle:**
*How we automated Kubernetes API deprecations across dozens of GitOps repositories without losing YAML comments, indentation, or sanity.*

---

If you manage Kubernetes clusters in production, you know the dread that accompanies a major version upgrade announcement.

Kubernetes evolves rapidly, and with that evolution comes the inevitable deprecation and removal of core APIs:
- `extensions/v1beta1` and `apps/v1beta1` were purged in **v1.16**.
- Ingress `extensions/v1beta1` and RBAC `v1beta1` were removed in **v1.22**.
- `CronJob` (`batch/v1beta1`), `PodDisruptionBudget` (`policy/v1beta1`), and `PodSecurityPolicy` disappeared in **v1.25**.
- `HorizontalPodAutoscaler` `v2beta2` was removed in **v1.26**.
- `FlowControl` beta APIs reached end-of-life in **v1.29 and v1.32**.

When an API is removed from Kubernetes, any manifest still using that `apiVersion` is rejected on apply. In an organization managing tens or hundreds of GitOps repositories (ArgoCD, Flux, or plain YAMLs), upgrading all of them by hand is a massive time sink.

### The Problem With Existing Solutions

When teams face this challenge, they usually look at:
1. **Manual find-and-replace**: Extremely error-prone. Kubernetes upgrades don't just change `apiVersion`; they change schemas. For instance, in Ingress `networking.k8s.io/v1`, `serviceName` and `servicePort` became nested under `service: { name, port: { number } }`, and `pathType` became mandatory. A regex find-and-replace will silently produce invalid manifests.
2. **`kubectl-convert`**: Strips every comment from your YAML files, reformats spacing, and cannot scan directories recursively.
3. **Pluto / Kubent**: Excellent tools for *detecting* deprecated APIs, but strictly read-only. They tell you where your cluster will break, but don't fix the files for you.

Two years ago, I built **Janos** — named after the Roman two-faced god of transitions and passages — to automate manifest migrations.

Today, I am excited to share **Janos 2.0**: a complete ground-up modernization designed for modern Kubernetes environments (from 1.16 all the way to 1.32+).

---

### What’s New in Janos 2.0?

#### 1. 100% Comment & Formatting Preservation
Previous YAML parsers treated YAML as plain data dictionaries, obliterating comments like `# Managed by ArgoCD` or `# Scale threshold`.

Janos 2.0 leverages an **AST-based manipulation engine**. It navigates the Concrete Syntax Tree of your YAML files, modifying only the targeted keys while preserving inline comments, headers, indentation, and anchors.

#### 2. Deep Schema Translations
Janos doesn't just change string headers:
- **Ingress (`networking.k8s.io/v1`)**: Translates `serviceName`/`servicePort` to `service.name`/`service.port`, migrates `spec.backend` to `spec.defaultBackend`, and injects required `pathType: Prefix`.
- **HorizontalPodAutoscaler (`autoscaling/v2`)**: Automatically translates legacy `targetAverageUtilization` into modern `target.type: Utilization` structures.
- **Workloads**: Injects required `spec.selector` into `Deployment`, `DaemonSet`, `StatefulSet`, and `ReplicaSet` if missing.

#### 3. Built-In Color Diff & Dry-Run
You should never let an automated tool blindly overwrite production code. Janos comes with a built-in unified diff generator:

```sh
npx janos -d ./k8s-manifests --dry-run --diff
```

You get an instant, color-coded terminal diff showing exactly what lines will be updated.

#### 4. Native CI / CD Pull Request Gating
Janos includes a `--check` mode:
```sh
npx janos --check ./k8s-manifests
```
It returns exit code `0` if all manifests are clean, and exit code `1` if any deprecated APIs are detected. You can add it to your GitHub Actions or GitLab CI pipeline in two minutes to prevent engineers from submitting deprecated manifests.

---

### How to Use Janos in 30 Seconds

You don’t even need to clone the repository or install a package. You can run it directly via `npx`:

```sh
# Preview changes across a directory:
npx janos -d ./manifests --dry-run --diff

# Apply changes in-place:
npx janos -d ./manifests
```

Or run via Docker:
```sh
docker run --rm -v $(pwd):/var/janos pgold30/janos -d ./manifests
```

---

### Comprehensive Migration Matrix

Janos 2.0 covers:
- **v1.16**: `Deployment`, `DaemonSet`, `StatefulSet`, `ReplicaSet`, `NetworkPolicy`
- **v1.17 / v1.22**: `Role`, `ClusterRole`, `RoleBinding`, `ClusterRoleBinding`
- **v1.22**: `Ingress`, `IngressClass`, `CustomResourceDefinition`, `ValidatingWebhookConfiguration`, `MutatingWebhookConfiguration`, `StorageClass`, `CSIDriver`, `CSINode`, `VolumeAttachment`, `APIService`, `PriorityClass`, `Lease`, `CertificateSigningRequest`, `TokenReview`, `SubjectAccessReview`
- **v1.25**: `CronJob`, `PodDisruptionBudget`, `EndpointSlice`, `Event`, `RuntimeClass`, and `PodSecurityPolicy` warnings
- **v1.26**: `HorizontalPodAutoscaler` to `autoscaling/v2`
- **v1.27**: `CSIStorageCapacity`
- **v1.26 – v1.32**: `FlowSchema`, `PriorityLevelConfiguration`

---

### Try It Out & Get Involved

Janos is 100% open-source under the Apache 2.0 license:

👉 **GitHub Repository**: [https://github.com/pgold30/janos](https://github.com/pgold30/janos)

Give it a star, test it on your Kubernetes manifests, and let me know your thoughts or suggestions for future releases!

---

## Part 2: LinkedIn Post

```text
🚀 Upgrading Kubernetes shouldn’t break your GitOps repositories.

If you’ve ever upgraded a cluster from 1.20 to 1.25+, you know the pain:
❌ Ingress extensions/v1beta1 removed
❌ CronJob batch/v1beta1 removed
❌ PodDisruptionBudget policy/v1beta1 removed
❌ HPA v2beta2 removed
❌ Ingress schema changes breaking your routing

Existing tools like Pluto and Kubent are great for telling you *what* is broken, but they won’t fix it for you. And tools like `kubectl-convert` strip away all your comments and formatting.

That’s why I built and just released **Janos 2.0**  Janus 🛡️

What’s new in Janos 2.0:
✨ Full AST-based parsing: Preserves 100% of your YAML comments, whitespace, and formatting.
✨ Comprehensive support: Migrates deprecated APIs from Kubernetes v1.16 all the way to v1.32+.
✨ Deep schema transformations: Converts Ingress v1 backends, adds pathType, and updates HPA metric targets.
✨ Safe execution: Built-in `--dry-run` and terminal colorized `--diff`.
✨ CI/CD ready: `--check` flag to gate pull requests in GitHub Actions or GitLab CI.
✨ Zero-install: Run immediately with `npx janos -d ./k8s --dry-run --diff`.

Check out the project on GitHub:
👉 https://github.com/pgold30/janos

How do you handle Kubernetes API deprecations in your organization? Let me know in the comments! 👇

#Kubernetes #DevOps #GitOps #CloudNative #SRE #OpenSource #K8s #PlatformEngineering
```
