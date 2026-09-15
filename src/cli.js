/**
 * Copyright 2021-2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const path = require('path');
const { parseArgs: utilParseArgs } = require('node:util');

const BASE_DIR = process.env.BASE_DIR || '.';

function getVersion() {
  try {
    const pkgPath = path.join(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '2.0.0';
  } catch {
    return '2.0.0';
  }
}

function getHelpText() {
  return `
Janos v${getVersion()} - Automated Kubernetes manifest migration tool

Usage:
  janos [options] [path]
  <stream> | janos - [options]

Core Options:
  -f, --file <file>             Target single manifest file to convert ('-' for stdin)
  -d, --dir <dir>               Target directory to recursively scan and convert
  -i, --interactive             Interactive mode: confirm each file modification (y/n/d/a/q)
      --stdin                   Read manifests from standard input (pipe)
  -n, --dry-run                 Preview changes without modifying files
      --diff                    Show unified color diff of changes
  -c, --check                   CI mode: exit 1 if any files need migration, 0 if clean

Advanced Options:
      --target-version <ver>    Gate migrations up to a specific Kubernetes version (e.g. 1.25)
      --audit, --scan           Pluto-style read-only audit: scan and print summary table
      --only-removed            Audit: only list APIs that are completely removed in target version
      --format <format>         Output format: table (default), markdown, json, or annotations
      --output-file <file>      Write audit report directly to a file
      --ingress-to-gateway      Translate Ingress manifests to Gateway API (HTTPRoute)
      --generate-gateway        Generate companion Gateway resource with --ingress-to-gateway
      --out <file>              Output file path for generated resources (default: in-place or stdout)
      --ignore <patterns>       Comma-separated glob ignore patterns (or use .janosignore)
      --annotations             Emit GitHub Actions workflow annotations (auto in CI)

Cluster & Helm Options:
      --cluster, --live         Audit running Kubernetes cluster directly via kubectl
      --namespace <ns>          Namespace filter for live cluster audit (default: all namespaces)
      --kubeconfig <file>       Custom kubeconfig file path
      --chart, --helm <dir>     Scan or render Helm chart directory via 'helm template'
      --values <file>           Specify values YAML file for Helm chart rendering

General:
  -q, --quiet                   Suppress non-essential output
  -v, --version                 Print version information
  -h, --help                    Print this help message

Examples:
  # In-place migration with interactive confirmation
  janos -d ./k8s -i

  # Audit running Kubernetes cluster
  janos --cluster --audit

  # Audit running cluster for APIs removed in 1.25
  janos --cluster --audit --target-version 1.25 --only-removed

  # Gate migrations up to Kubernetes 1.25 only
  janos -d ./k8s --target-version 1.25 --diff

  # Read-only Pluto-style audit table
  janos --audit -d ./k8s

  # Helm pipeline integration (via STDIN)
  helm template my-chart | janos - --audit --format markdown

  # Convert Ingress to Gateway API HTTPRoute
  janos --ingress-to-gateway -f ingress.yaml
`;
}

function parseArgs(inputArgv) {
  // Support legacy object passed from minimist or tests
  if (inputArgv && !Array.isArray(inputArgv) && typeof inputArgv === 'object') {
    const res = { ...inputArgv };
    if (res.f) res.file = res.f === '-' ? '-' : path.resolve(BASE_DIR, res.f);
    if (res.d) res.dir = path.resolve(BASE_DIR, res.d);
    if (res.chart || res.helm) res.chart = path.resolve(BASE_DIR, res.chart || res.helm);
    if (res.file === '-') {
      res.stdin = true;
      res.file = undefined;
    }
    if (!res.file && !res.dir && !res.stdin && !res.chart && !res.cluster && !res.live) {
      throw new Error('argument -d or -f must be provided');
    }
    return res;
  }

  const rawArgs = Array.isArray(inputArgv) ? inputArgv : process.argv.slice(2);

  const optionsConfig = {
    file: { type: 'string', short: 'f' },
    dir: { type: 'string', short: 'd' },
    interactive: { type: 'boolean', short: 'i', default: false },
    stdin: { type: 'boolean', default: false },
    cluster: { type: 'boolean', default: false },
    live: { type: 'boolean', default: false },
    namespace: { type: 'string' },
    kubeconfig: { type: 'string' },
    chart: { type: 'string' },
    helm: { type: 'string' },
    values: { type: 'string' },
    'dry-run': { type: 'boolean', short: 'n', default: false },
    diff: { type: 'boolean', default: false },
    check: { type: 'boolean', short: 'c', default: false },
    audit: { type: 'boolean', default: false },
    scan: { type: 'boolean', default: false },
    format: { type: 'string', default: 'table' },
    'only-removed': { type: 'boolean', default: false },
    'output-file': { type: 'string' },
    'target-version': { type: 'string' },
    'ingress-to-gateway': { type: 'boolean', default: false },
    'generate-gateway': { type: 'boolean', default: false },
    out: { type: 'string' },
    ignore: { type: 'string' },
    annotations: { type: 'boolean', default: false },
    quiet: { type: 'boolean', short: 'q', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
  };

  const { values, positionals } = utilParseArgs({
    args: rawArgs,
    options: optionsConfig,
    allowPositionals: true,
  });

  const isAudit = Boolean(values.audit || values.scan);
  const isStdin = Boolean(
    values.stdin ||
    values.file === '-' ||
    (positionals && positionals[0] === '-')
  );

  const chartTarget = values.chart || values.helm;
  const isCluster = Boolean(values.cluster || values.live);

  const result = {
    file: (values.file && values.file !== '-') ? path.resolve(BASE_DIR, values.file) : undefined,
    dir: values.dir ? path.resolve(BASE_DIR, values.dir) : undefined,
    interactive: Boolean(values.interactive),
    stdin: isStdin,
    cluster: isCluster,
    namespace: values.namespace,
    kubeconfig: values.kubeconfig ? path.resolve(BASE_DIR, values.kubeconfig) : undefined,
    chart: chartTarget ? path.resolve(BASE_DIR, chartTarget) : undefined,
    values: values.values ? path.resolve(BASE_DIR, values.values) : undefined,
    dryRun: Boolean(values['dry-run']),
    diff: Boolean(values.diff),
    check: Boolean(values.check),
    audit: isAudit,
    format: values.format || 'table',
    onlyRemoved: Boolean(values['only-removed']),
    outputFile: values['output-file'] ? path.resolve(BASE_DIR, values['output-file']) : undefined,
    targetVersion: values['target-version'],
    ingressToGateway: Boolean(values['ingress-to-gateway']),
    generateGateway: Boolean(values['generate-gateway']),
    out: values.out ? path.resolve(BASE_DIR, values.out) : undefined,
    ignore: values.ignore,
    annotations: Boolean(values.annotations || (process.env.GITHUB_ACTIONS === 'true' && values.format !== 'json')),
    quiet: Boolean(values.quiet),
    help: Boolean(values.help),
    version: Boolean(values.version),
    positionals: positionals || [],
  };

  // If positional argument provided and neither -f nor -d nor stdin was set
  if (!result.file && !result.dir && !result.stdin && result.positionals.length > 0) {
    const rawPos = result.positionals[0];
    if (rawPos === '-') {
      result.stdin = true;
    } else {
      const target = path.resolve(BASE_DIR, rawPos);
      if (fs.existsSync(target)) {
        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
          result.dir = target;
        } else {
          result.file = target;
        }
      } else {
        result.file = target;
      }
    }
  }

  return result;
}

module.exports = {
  parseArgs,
  getHelpText,
  getVersion,
};
