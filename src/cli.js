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

Core Options:
  -f, --file <file>             Target single manifest file to convert
  -d, --dir <dir>               Target directory to recursively scan and convert
  -n, --dry-run                 Preview changes without modifying files
      --diff                    Show unified color diff of changes
  -c, --check                   CI mode: exit 1 if any files need migration, 0 if clean

Advanced Options:
      --target-version <ver>    Gate migrations up to a specific Kubernetes version (e.g. 1.25)
      --audit, --scan           Pluto-style read-only audit: scan and print summary table
      --format <format>         Output format: table (default), markdown, or json
      --ingress-to-gateway      Translate Ingress manifests to Gateway API (HTTPRoute)
      --generate-gateway        Generate companion Gateway resource with --ingress-to-gateway
      --out <file>              Output file path for generated resources (default: in-place or stdout)

General:
  -q, --quiet                   Suppress non-essential output
  -v, --version                 Print version information
  -h, --help                    Print this help message

Examples:
  # In-place migration
  janos -d ./k8s-manifests

  # Gate migrations up to Kubernetes 1.25 only
  janos -d ./k8s --target-version 1.25 --diff

  # Read-only Pluto-style audit table
  janos --audit -d ./k8s

  # GitHub Actions PR comment Markdown report
  janos --audit -d ./k8s --format markdown

  # Convert Ingress to Gateway API HTTPRoute
  janos --ingress-to-gateway -f ingress.yaml
`;
}

function parseArgs(inputArgv) {
  // Support legacy object passed from minimist or tests
  if (inputArgv && !Array.isArray(inputArgv) && typeof inputArgv === 'object') {
    const res = { ...inputArgv };
    if (res.f) res.file = path.resolve(BASE_DIR, res.f);
    if (res.d) res.dir = path.resolve(BASE_DIR, res.d);
    if (!res.file && !res.dir) {
      throw new Error('argument -d or -f must be provided');
    }
    return res;
  }

  const rawArgs = Array.isArray(inputArgv) ? inputArgv : process.argv.slice(2);

  const optionsConfig = {
    file: { type: 'string', short: 'f' },
    dir: { type: 'string', short: 'd' },
    'dry-run': { type: 'boolean', short: 'n', default: false },
    diff: { type: 'boolean', default: false },
    check: { type: 'boolean', short: 'c', default: false },
    audit: { type: 'boolean', default: false },
    scan: { type: 'boolean', default: false },
    format: { type: 'string', default: 'table' },
    'target-version': { type: 'string' },
    'ingress-to-gateway': { type: 'boolean', default: false },
    'generate-gateway': { type: 'boolean', default: false },
    out: { type: 'string' },
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

  const result = {
    file: values.file ? path.resolve(BASE_DIR, values.file) : undefined,
    dir: values.dir ? path.resolve(BASE_DIR, values.dir) : undefined,
    dryRun: Boolean(values['dry-run']),
    diff: Boolean(values.diff),
    check: Boolean(values.check),
    audit: isAudit,
    format: values.format || 'table',
    targetVersion: values['target-version'],
    ingressToGateway: Boolean(values['ingress-to-gateway']),
    generateGateway: Boolean(values['generate-gateway']),
    out: values.out ? path.resolve(BASE_DIR, values.out) : undefined,
    quiet: Boolean(values.quiet),
    help: Boolean(values.help),
    version: Boolean(values.version),
    positionals: positionals || [],
  };

  // If positional argument provided and neither -f nor -d was set
  if (!result.file && !result.dir && result.positionals.length > 0) {
    const target = path.resolve(BASE_DIR, result.positionals[0]);
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

  return result;
}

module.exports = {
  parseArgs,
  getHelpText,
  getVersion,
};
