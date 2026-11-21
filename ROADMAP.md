# Janos roadmap

Reviewed 2026-09-24 against the [Kubernetes deprecated API guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/), [Pluto](https://pluto.docs.fairwinds.com/), [Kube No Trouble](https://github.com/doitintl/kube-no-trouble), and [ingress2gateway](https://github.com/kubernetes-sigs/ingress2gateway). Priorities below are proposals, not claims of current support.

## Position

Janos should be the tool for teams that own source manifests and want one reviewable workflow: audit the repository, preview a diff, apply supported changes, and enforce the result in CI. Its useful distinction is editing those manifests while keeping comments on unchanged YAML nodes and gating work to a target Kubernetes version. Trust depends on leaving ambiguous resources unchanged and explaining why.

Pluto and Kube No Trouble have specialized collectors for Helm release history and server-side storage. Janos reads `kubectl apply`'s last-applied manifest across its cluster resource set, can decode deployed Helm v3 release Secrets via `--cluster --helm-releases`, and reports source coverage counts. The Gateway API project's ingress2gateway has provider and emitter support that Janos does not. Janos should integrate with or clearly hand off to these tools where they offer deeper coverage.

## Next priorities

1. **Versioned schema validation and safer rules.** Schema-aware rules now cover CRD structural schemas, Webhooks, CSR, HPA, Ingress regex paths and atomic backend validation, PodDisruptionBudget empty `{}` selector safety, EndpointSlice topology migration, Event `v1` field checks, and PriorityLevelConfiguration `assuredConcurrencyShares` renaming. Next: validate generated manifests against official versioned Kubernetes JSON schemas for supported targets and add an optional server dry-run workflow for users with a test cluster (never requiring a cluster for local migration).
2. **Broader cluster evidence.** Janos now decodes deployed Helm v3 release Secrets (`--cluster --helm-releases`) and queries expanded resource kinds in addition to `kubectl.kubernetes.io/last-applied-configuration` annotations. Next: support dynamic API discovery (`kubectl api-resources`) and Helm v2/ConfigMap storage backends where needed.
3. **GitOps inputs and Gateway depth.** First-class Kustomize (`--kustomize` / `-k`), rendered Helm (`--chart`), and SARIF 2.1.0 (`--format sarif`) reporting are now supported. Gateway conversion isolates multi-host `HTTPRoute`s, generates per-host TLS listeners, parses `permanent-redirect` URLs, and warns on untranslatable annotations. Continue keeping a clear handoff to ingress2gateway for provider-specific behavior.
4. **Adoption proof.** [`@pgold30/janos@2.4.0`](https://www.npmjs.com/package/@pgold30/janos) is published; npm rejected the unscoped `janos` name as too similar to an existing package. A fresh `npm exec` installation, the tagged pre-commit hooks, GitHub CI, and the tagged container build passed. Extend the [fixture gallery](examples/README.md) with stable JSON report examples and comparisons of scan coverage and migration outcomes. Pin action dependencies and keep the [release process](RELEASING.md) current.

## What would persuade users

- A five-minute example with real legacy manifests: audit, dry-run diff, migration, and `--check` in CI.
- A published support matrix distinguishing automatic conversion, manual review, and audit-only detection for each API version and Kubernetes target.
- Tests showing that comments outside changed YAML nodes survive, unsupported fields are not silently discarded, and ambiguous security settings stop automatic conversion.
- Honest comparisons: Janos edits GitOps source files; specialist tools remain preferable for live Helm history and provider-specific Gateway behavior.
