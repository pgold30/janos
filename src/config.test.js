/**
 * Copyright 2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const config = require('./config');
const migration = require('./migration');
const audit = require('./audit');
const cli = require('./cli');

describe('Config file (.janos.yaml), Ecosystem CRDs & Gateway API rules', () => {
  it('migrates Gateway API v1alpha2/v1beta1 resources to v1 out of the box', () => {
    const docs = [
      { apiVersion: 'gateway.networking.k8s.io/v1beta1', kind: 'Gateway', metadata: { name: 'gw' } },
      { apiVersion: 'gateway.networking.k8s.io/v1beta1', kind: 'GatewayClass', metadata: { name: 'gwc' } },
      { apiVersion: 'gateway.networking.k8s.io/v1beta1', kind: 'HTTPRoute', metadata: { name: 'hr' } },
      { apiVersion: 'gateway.networking.k8s.io/v1alpha2', kind: 'GRPCRoute', metadata: { name: 'gr' } },
    ];
    const out = migration.parseDocs(docs, { reporter: () => {} });
    for (const d of out) {
      assert.equal(d.apiVersion, 'gateway.networking.k8s.io/v1');
    }
  });

  it('migrates ecosystem CRDs when includeEcosystem is true without colliding Istio vs K8s Gateway', () => {
    const docs = [
      { apiVersion: 'cert-manager.io/v1alpha2', kind: 'Certificate', metadata: { name: 'tls' } },
      { apiVersion: 'external-secrets.io/v1beta1', kind: 'ExternalSecret', metadata: { name: 'db-creds' } },
      { apiVersion: 'traefik.containo.us/v1alpha1', kind: 'IngressRoute', metadata: { name: 'web' } },
      { apiVersion: 'networking.istio.io/v1beta1', kind: 'Gateway', metadata: { name: 'istio-gw' } },
      { apiVersion: 'gateway.networking.k8s.io/v1beta1', kind: 'Gateway', metadata: { name: 'k8s-gw' } },
      { apiVersion: 'kyverno.io/v1alpha2', kind: 'ClusterPolicy', metadata: { name: 'require-labels' } },
    ];

    // Without includeEcosystem, only Gateway API Gateway migrates
    const coreOnly = migration.parseDocs(
      docs.map((d) => ({ ...d })),
      { reporter: () => {} },
    );
    assert.equal(coreOnly[0].apiVersion, 'cert-manager.io/v1alpha2');
    assert.equal(coreOnly[3].apiVersion, 'networking.istio.io/v1beta1');
    assert.equal(coreOnly[4].apiVersion, 'gateway.networking.k8s.io/v1');

    // With includeEcosystem, all 6 migrate cleanly to their distinct targets
    const withEco = migration.parseDocs(
      docs.map((d) => ({ ...d })),
      { includeEcosystem: true, reporter: () => {} },
    );
    assert.equal(withEco[0].apiVersion, 'cert-manager.io/v1');
    assert.equal(withEco[1].apiVersion, 'external-secrets.io/v1');
    assert.equal(withEco[2].apiVersion, 'traefik.io/v1alpha1');
    assert.equal(withEco[3].apiVersion, 'networking.istio.io/v1');
    assert.equal(withEco[4].apiVersion, 'gateway.networking.k8s.io/v1');
    assert.equal(withEco[5].apiVersion, 'kyverno.io/v1');
  });

  it('loads .janos.yaml custom rules and applies them during CLI audit & migration', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-cfg-'));
    const cfgPath = path.join(dir, '.janos.yaml');
    const manifestPath = path.join(dir, 'widget.yaml');
    try {
      fs.writeFileSync(
        cfgPath,
        `includeEcosystem: true
failOn: removed
rules:
  - kind: Widget
    legacy:
      - acme.io/v1alpha1
    target: acme.io/v1
    removedIn: "1.30"
`,
      );
      fs.writeFileSync(
        manifestPath,
        `apiVersion: acme.io/v1alpha1
kind: Widget
metadata:
  name: demo-widget
`,
      );

      const loaded = config.loadConfig(dir);
      assert.equal(loaded.includeEcosystem, true);
      assert.equal(loaded.failOn, 'removed');
      assert.equal(loaded.rules.length, 1);
      assert.equal(loaded.rules[0].kind, 'Widget');

      const cliBin = path.join(__dirname, '..', 'bin', 'janos.js');
      const auditRun = spawnSync(
        process.execPath,
        [cliBin, '--audit', '-d', dir, '--format', 'json', '--check'],
        { encoding: 'utf8' },
      );
      assert.equal(auditRun.status, 1);
      const report = JSON.parse(auditRun.stdout);
      assert.equal(report.deprecatedCount, 1);
      assert.equal(report.items[0].kind, 'Widget');
      assert.equal(report.items[0].targetApi, 'acme.io/v1');

      const migrateRun = spawnSync(process.execPath, [cliBin, '-f', manifestPath], {
        encoding: 'utf8',
      });
      assert.equal(migrateRun.status, 0);
      assert.match(fs.readFileSync(manifestPath, 'utf8'), /apiVersion: acme\/v1|apiVersion: acme\.io\/v1/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('supports --fail-on removed vs deprecated in audit check mode', () => {
    const raw = 'apiVersion: batch/v1beta1\nkind: CronJob\nmetadata:\n  name: future-removal\n';
    // Removed in 1.25; against targetVersion 1.22 this is DEPRECATED, not REMOVED.
    const res = audit.auditContent(raw, 'cron.yaml', { targetVersion: '1.22' });
    const report = { items: res.items };

    assert.equal(res.items[0].status, 'DEPRECATED');
    assert.equal(audit.shouldFailAudit(report, { failOn: 'deprecated' }), true);
    assert.equal(audit.shouldFailAudit(report, { failOn: 'removed' }), false);

    // Against targetVersion 1.25 this is REMOVED.
    const res125 = audit.auditContent(raw, 'cron.yaml', { targetVersion: '1.25' });
    assert.equal(audit.shouldFailAudit({ items: res125.items }, { failOn: 'removed' }), true);
  });

  it('parses v3 CLI flags (--include-ecosystem, --config, --fail-on, --validate, --cluster-scoped)', () => {
    const parsed = cli.parseArgs([
      '--cluster',
      '--cluster-scoped',
      '--include-ecosystem',
      '--fail-on',
      'removed',
      '--validate',
      '--config',
      './.janos.yaml',
    ]);
    assert.equal(parsed.cluster, true);
    assert.equal(parsed.clusterScoped, true);
    assert.equal(parsed.includeEcosystem, true);
    assert.equal(parsed.failOn, 'removed');
    assert.equal(parsed.validate, true);
    assert.ok(parsed.config.endsWith('.janos.yaml'));

    assert.throws(() => cli.parseArgs(['--fail-on', 'invalid']), /--fail-on must be/);
  });
});
