#!/bin/bash
set -euo pipefail

docker run --rm -v "$(pwd)":/var/janos janos "$@"
