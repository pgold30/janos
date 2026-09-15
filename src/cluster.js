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

const { execSync } = require('child_process');

/**
 * Checks whether the kubectl binary is available in PATH.
 *
 * @returns {boolean}
 */
function isKubectlInstalled() {
  try {
    execSync('kubectl version --client', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches resources from an active Kubernetes cluster via kubectl.
 *
 * @param {Object} [options]
 * @param {string} [options.namespace] Optional namespace filter
 * @param {string} [options.kubeconfig] Optional kubeconfig path
 * @returns {string} Multi-document YAML string
 */
function fetchClusterManifests(options = {}) {
  if (!isKubectlInstalled()) {
    throw new Error('"kubectl" CLI not found in PATH. Install kubectl to audit running clusters.');
  }

  const resources = [
    'deployments',
    'daemonsets',
    'statefulsets',
    'replicasets',
    'cronjobs',
    'ingresses',
    'horizontalpodautoscalers',
    'poddisruptionbudgets',
    'networkpolicies',
  ].join(',');

  let cmd = `kubectl get ${resources} -o yaml`;
  if (options.namespace) {
    cmd += ` -n "${options.namespace}"`;
  } else {
    cmd += ' -A';
  }

  if (options.kubeconfig) {
    cmd += ` --kubeconfig "${options.kubeconfig}"`;
  }

  try {
    return execSync(cmd, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const errorMsg = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Failed to query cluster via kubectl: ${errorMsg}`);
  }
}

module.exports = {
  isKubectlInstalled,
  fetchClusterManifests,
};
