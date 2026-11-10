#!/usr/bin/env bash
#
# Contract unit tests, then the sandbox cross-contract test.
#
# The sandbox test reads the built WASM artifacts, so run
# `scripts/build-contracts.sh` first (it is the source of those bytes).
#
# On Windows use the toolchain wrapper:
#   bash scripts/with-rust-toolchain.sh bash scripts/test-contracts.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT}/contracts"
echo "==> contract unit tests"
cargo test --workspace

echo
echo "==> sandbox cross-contract tests"
cd integration-tests
# Keep the sandbox log inside the (gitignored) target dir so it survives a VM
# restart on Windows hosts.
cargo test --test sandbox -- --nocapture
