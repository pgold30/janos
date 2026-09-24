# Janos roadmap

Reviewed 2026-09-24 against the [Kubernetes deprecated API guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/), [Pluto](https://pluto.docs.fairwinds.com/), [Kube No Trouble](https://github.com/doitintl/kube-no-trouble), and [ingress2gateway](https://github.com/kubernetes-sigs/ingress2gateway). Priorities below are proposals, not claims of current support.

## Position

Janos should be the tool for teams that own source manifests and want one reviewable workflow: audit the repository, preview a diff, apply supported changes, and enforce the result in CI. Its useful distinction is editing those manifests while keeping comments on unchanged YAML nodes and gating work to a target Kubernetes version. Trust depends on leaving ambiguous resources unchanged and explaining why.

Pluto and Kube No Trouble have stronger collectors for Helm release history. Janos can now read `kubectl apply`'s last-applied manifest for its fixed set of cluster kinds, with coverage counts, but does not collect Helm release history. The Gateway API project's ingress2gateway has provider and emitter support that Janos does not. Janos should integrate with or clearly hand off to these tools where they offer deeper coverage.

## Next priorities

1. **Versioned schema validation and safer rules.** Test every migration against representative manifests and Kubernetes schemas for supported target versions. Start with Event, EndpointSlice, PodDisruptionBudget selector semantics, Ingress path behavior, and CRD structural schemas. A rule should either produce a manifest validated for the selected target or return a manual diagnostic. Add an optional server dry-run workflow for users with a test cluster; never require a cluster for local migration.
2. **Broader cluster evidence.** Collect original manifests from Helm releases and expand beyond the fixed `kubectl get` kind list. Janos now uses matching `kubectl.kubernetes.io/last-applied-configuration` annotations where available and reports gaps; a served API alone still cannot establish which version was originally applied.
3. **GitOps inputs and Gateway handoff.** Support Kustomize and rendered Helm output as first-class audit inputs. For Ingress conversions, either add tested provider-specific adapters or provide a smooth handoff to ingress2gateway. Do not claim equivalence for annotations Janos cannot translate.
4. **Adoption proof.** [`@pgold30/janos@2.4.0`](https://www.npmjs.com/package/@pgold30/janos) is published; npm rejected the unscoped `janos` name as too similar to an existing package. A fresh `npm exec` installation, the tagged pre-commit hooks, GitHub CI, and the tagged container build passed. Extend the [fixture gallery](examples/README.md) with stable JSON report examples and comparisons of scan coverage and migration outcomes. Pin action dependencies and keep the [release process](RELEASING.md) current.

## What would persuade users

- A five-minute example with real legacy manifests: audit, dry-run diff, migration, and `--check` in CI.
- A published support matrix distinguishing automatic conversion, manual review, and audit-only detection for each API version and Kubernetes target.
- Tests showing that comments outside changed YAML nodes survive, unsupported fields are not silently discarded, and ambiguous security settings stop automatic conversion.
- Honest comparisons: Janos edits GitOps source files; specialist tools remain preferable for live Helm history and provider-specific Gateway behavior.
