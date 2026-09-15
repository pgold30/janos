/**
 * Copyright 2021, SumUp Ltd.
 * Copyright 2026, Pablo Loschi
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

Options:
  -f, --file <file>     Target single manifest file to convert
  -d, --dir <dir>       Target directory to recursively scan and convert
  -n, --dry-run         Preview changes without modifying files
      --diff            Show unified diff of changes
  -c, --check           CI mode: exit 1 if any files need migration, 0 if clean
  -q, --quiet           Suppress non-essential output
  -v, --version         Print version information
  -h, --help            Print this help message

Examples:
  janos -f deployment.yaml
  janos -d ./k8s-manifests
  janos -d ./k8s --dry-run --diff
  janos --check ./k8s
  janos ./manifests
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
    quiet: { type: 'boolean', short: 'q', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
  };

  const { values, positionals } = utilParseArgs({
    args: rawArgs,
    options: optionsConfig,
    allowPositionals: true,
  });

  const result = {
    file: values.file ? path.resolve(BASE_DIR, values.file) : undefined,
    dir: values.dir ? path.resolve(BASE_DIR, values.dir) : undefined,
    dryRun: Boolean(values['dry-run']),
    diff: Boolean(values.diff),
    check: Boolean(values.check),
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
      // Default to file if nonexistent or extension matches
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
