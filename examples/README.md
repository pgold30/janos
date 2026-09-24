# Before and after: Kubernetes API migrations

These fixtures are checked by the test suite. Run the commands from the repository root after `npm ci`; replace `node bin/janos.js` with `janos` if installed globally.

| Case | Before | Expected result |
| :--- | :--- | :--- |
| CronJob | [legacy.yaml](cronjob/legacy.yaml) | [migrated.yaml](cronjob/migrated.yaml): `batch/v1`, with the operational comment retained |
| HPA resource metric | [legacy.yaml](hpa/legacy.yaml) | [migrated.yaml](hpa/migrated.yaml): `autoscaling/v2` with an explicit metric target |
| PodSecurityPolicy | [psp.yaml](manual/psp.yaml) | Unchanged; no replacement API exists |
| CRD without schema | [crd-without-schema.yaml](manual/crd-without-schema.yaml) | Unchanged; a structural schema must be supplied |

Try the CronJob workflow without editing the fixture:

```sh
cp examples/cronjob/legacy.yaml /tmp/janos-cronjob.yaml
node bin/janos.js --audit -f /tmp/janos-cronjob.yaml
node bin/janos.js -f /tmp/janos-cronjob.yaml --dry-run --diff
node bin/janos.js -f /tmp/janos-cronjob.yaml
node bin/janos.js -f /tmp/janos-cronjob.yaml --check
```

For a representative manual case, `node bin/janos.js -f examples/manual/psp.yaml --check` exits 1 and explains the required work. The file is unchanged.

To check a migrated manifest against **your target cluster** without persisting it, use a context you control:

```sh
kubectl --context YOUR_CONTEXT apply --dry-run=server --validate=strict -f examples/cronjob/migrated.yaml
```

Server dry-run exercises the API server and admission chain; success depends on the cluster version, permissions, and admission configuration. It was not run as part of the repository tests. For complex resources such as CRDs and webhooks, validate in a disposable test cluster with their dependencies before applying them in production. See the [Kubernetes `kubectl apply` reference](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_apply/).
