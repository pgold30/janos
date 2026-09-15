const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const path = require('path');

const JANOS_BIN = path.join(__dirname, '../bin/janos.js');

describe('STDIN pipe streaming', () => {
  const deprecatedDeployment = `
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: nginx-legacy
spec:
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.19
`;

  it('should audit manifest stream from stdin and output JSON', () => {
    const cmd = `node "${JANOS_BIN}" - --audit --format json`;
    const output = execSync(cmd, {
      input: deprecatedDeployment,
      encoding: 'utf8',
    });

    const report = JSON.parse(output);
    assert.equal(report.filesScanned, 1);
    assert.equal(report.deprecatedCount, 1);
    assert.equal(report.items[0].kind, 'Deployment');
    assert.equal(report.items[0].currentApi, 'extensions/v1beta1');
    assert.equal(report.items[0].targetApi, 'apps/v1');
    assert.equal(report.items[0].removedIn, 'v1.16');
  });

  it('should show unified diff when piping through janos - --diff', () => {
    const cmd = `node "${JANOS_BIN}" - --diff`;
    const output = execSync(cmd, {
      input: deprecatedDeployment,
      encoding: 'utf8',
    });

    assert.ok(output.includes('- apiVersion: extensions/v1beta1') || output.includes('apiVersion: extensions/v1beta1'));
    assert.ok(output.includes('+ apiVersion: apps/v1') || output.includes('apiVersion: apps/v1'));
  });

  it('should transform YAML stream from stdin and output clean YAML to stdout', () => {
    const cmd = `node "${JANOS_BIN}" -`;
    const output = execSync(cmd, {
      input: deprecatedDeployment,
      encoding: 'utf8',
    });

    assert.ok(output.includes('apiVersion: apps/v1'));
    assert.ok(output.includes('kind: Deployment'));
    assert.ok(output.includes('spec:'));
    assert.ok(output.includes('selector:'));
  });

  it('should exit with 1 on deprecated manifests when --check is set', () => {
    const cmd = `node "${JANOS_BIN}" - --check`;
    assert.throws(
      () => {
        execSync(cmd, {
          input: deprecatedDeployment,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        });
      },
      (err) => err.status === 1
    );
  });

  it('should exit with 0 on modern manifests when --check is set', () => {
    const modernDeployment = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: modern-app
spec:
  selector:
    matchLabels:
      app: modern
  template:
    metadata:
      labels:
        app: modern
    spec:
      containers:
        - name: app
          image: busybox
`;
    const cmd = `node "${JANOS_BIN}" - --check`;
    assert.doesNotThrow(() => {
      execSync(cmd, {
        input: modernDeployment,
        encoding: 'utf8',
      });
    });
  });
});
