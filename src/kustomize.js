/**
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

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Checks if a directory contains a Kustomize configuration file.
 *
 * @param {string} dirPath
 * @returns {boolean}
 */
function isKustomizeDir(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') return false;
  try {
    return (
      fs.existsSync(path.join(dirPath, 'kustomization.yaml')) ||
      fs.existsSync(path.join(dirPath, 'kustomization.yml')) ||
      fs.existsSync(path.join(dirPath, 'Kustomization'))
    );
  } catch {
    return false;
  }
}

/**
 * Detects whether standalone `kustomize` or `kubectl kustomize` is available in PATH.
 *
 * @returns {'kustomize'|'kubectl'|null}
 */
function detectKustomizeBackend() {
  try {
    execFileSync('kustomize', ['version'], { stdio: 'ignore' });
    return 'kustomize';
  } catch {}
  try {
    execFileSync('kubectl', ['kustomize', '--help'], { stdio: 'ignore' });
    return 'kubectl';
  } catch {}
  return null;
}

/**
 * Checks whether Kustomize rendering is available via `kustomize` or `kubectl`.
 *
 * @returns {boolean}
 */
function isKustomizeAvailable() {
  return detectKustomizeBackend() !== null;
}

/**
 * Renders a Kustomize directory into a multi-document YAML stream.
 *
 * @param {string} dirPath
 * @returns {string} Rendered YAML stream
 */
function renderKustomize(dirPath) {
  const backend = detectKustomizeBackend();
  if (!backend) {
    throw new Error('Neither "kustomize" nor "kubectl" was found in PATH. Install Kustomize or kubectl to render Kustomize directories.');
  }

  const bin = backend === 'kustomize' ? 'kustomize' : 'kubectl';
  const args = backend === 'kustomize' ? ['build', dirPath] : ['kustomize', dirPath];

  try {
    return execFileSync(bin, args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const errorMsg = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Failed to render Kustomize directory at "${dirPath}": ${errorMsg}`);
  }
}

module.exports = {
  isKustomizeDir,
  detectKustomizeBackend,
  isKustomizeAvailable,
  renderKustomize,
};
