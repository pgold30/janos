const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('node:child_process');

const helm = require('./helm');
const app = require('./app');

describe('Helm integration module', () => {
  it('should pass chart paths to helm without shell interpretation', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-helm-argv-'));
    const marker = path.join(dir, 'executed');
    const chartPath = `chart$(touch ${marker})`;
    const binary = path.join(dir, 'helm');
    try {
      fs.writeFileSync(binary, '#!/bin/sh\nprintf "%s\\n" "$@"\n');
      fs.chmodSync(binary, 0o755);
      const result = spawnSync(process.execPath, ['-e', 'process.stdout.write(require("./helm").renderChart(process.argv[1]))', chartPath], {
        cwd: __dirname,
        env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes(chartPath));
      assert.equal(fs.existsSync(marker), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('should detect Helm charts via isHelmChart', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-test-'));
    try {
      assert.equal(helm.isHelmChart(tmpDir), false);

      fs.writeFileSync(path.join(tmpDir, 'Chart.yaml'), 'name: my-chart\nversion: 0.1.0\n');
      assert.equal(helm.isHelmChart(tmpDir), true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should detect Helm Go template syntax in file content', () => {
    assert.equal(helm.isHelmTemplate('apiVersion: apps/v1\nkind: Deployment\n'), false);
    assert.equal(
      helm.isHelmTemplate('apiVersion: apps/v1\nkind: Deployment\nname: {{ .Values.name }}\n'),
      true
    );
    assert.equal(
      helm.isHelmTemplate('{{- if .Values.enabled }}\nkind: Service\n{{- end }}'),
      true
    );
  });

  it('should audit unrendered Helm templates containing Go interpolations', () => {
    const templateContent = `
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: {{ include "mychart.fullname" . }}-ingress
spec:
  rules:
    - host: {{ .Values.host }}
{{- end }}
---
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: {{ include "mychart.fullname" . }}
`;

    const items = helm.auditHelmTemplate(templateContent, 'templates/deployment.yaml');
    assert.equal(items.length, 2);

    const ingress = items.find((i) => i.kind === 'Ingress');
    assert.ok(ingress);
    assert.equal(ingress.currentApi, 'networking.k8s.io/v1beta1');
    assert.equal(ingress.targetApi, 'networking.k8s.io/v1');
    assert.equal(ingress.removedIn, 'v1.22');

    const deployment = items.find((i) => i.kind === 'Deployment');
    assert.ok(deployment);
    assert.equal(deployment.currentApi, 'extensions/v1beta1');
    assert.equal(deployment.targetApi, 'apps/v1');
    assert.equal(deployment.removedIn, 'v1.16');
  });

  it('should migrate a simple Helm template apiVersion while preserving Go template tags', () => {
    const templateContent = `{{- if .Values.job.enabled }}
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: {{ include "mychart.fullname" . }}
  annotations:
    helm.sh/hook: {{ .Values.hook }}
{{- end }}
`;

    const res = helm.migrateHelmTemplate(templateContent);
    assert.equal(res.changed, true);
    assert.ok(res.content.includes('apiVersion: batch/v1'));
    assert.ok(res.content.includes('{{- if .Values.job.enabled }}'));
    assert.ok(res.content.includes('{{ include "mychart.fullname" . }}'));
    assert.ok(res.content.includes('helm.sh/hook: {{ .Values.hook }}'));
  });

  it('should respect target version when migrating an unrendered template', () => {
    const template = 'apiVersion: batch/v1beta1\nkind: CronJob\n';
    assert.equal(helm.migrateHelmTemplate(template, { targetVersion: '1.22' }).changed, false);
    assert.equal(helm.migrateHelmTemplate(template, { targetVersion: '1.25' }).changed, true);
  });

  it('leaves structural Helm migrations unchanged for manual review', () => {
    const source = 'apiVersion: apiextensions.k8s.io/v1beta1\nkind: CustomResourceDefinition\n';
    const result = helm.migrateHelmTemplate(source);
    assert.equal(result.changed, false);
    assert.equal(result.content, source);
    assert.equal(result.events[0].type, 'manual');
  });

  it('should fail chart check mode without writing rendered output', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janos-helm-check-'));
    const output = path.join(dir, 'rendered.yaml');
    const originalInstalled = helm.isHelmInstalled;
    const originalRender = helm.renderChart;
    const previousExitCode = process.exitCode;
    helm.isHelmInstalled = () => true;
    helm.renderChart = () => 'apiVersion: batch/v1beta1\nkind: CronJob\nmetadata:\n  name: nightly\n';
    try {
      app.handleHelmChart({ chart: dir, out: output, check: true, quiet: true });
      assert.equal(process.exitCode, 1);
      assert.equal(fs.existsSync(output), false);
    } finally {
      process.exitCode = previousExitCode;
      helm.isHelmInstalled = originalInstalled;
      helm.renderChart = originalRender;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should render chart with helm CLI if installed', () => {
    if (!helm.isHelmInstalled()) {
      return; // Skip if helm binary is not installed in runner
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-chart-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'Chart.yaml'),
        'apiVersion: v2\nname: test-chart\nversion: 1.0.0\n'
      );
      fs.mkdirSync(path.join(tmpDir, 'templates'));
      fs.writeFileSync(
        path.join(tmpDir, 'templates', 'service.yaml'),
        `apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}-svc
spec:
  ports:
    - port: 80
`
      );

      const rendered = helm.renderChart(tmpDir, { releaseName: 'prod' });
      assert.ok(rendered.includes('kind: Service'));
      assert.ok(rendered.includes('name: prod-svc'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
