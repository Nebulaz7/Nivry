#!/usr/bin/env bash
#
# Contract unit tests. These run on the host target, which needs a linker:
# on Windows use `bash scripts/with-rust-toolchain.sh bash scripts/test-contracts.sh`.
# On WSL/Linux the system toolchain works directly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT}/contracts"
echo "==> contract unit tests"
cargo test --workspace

echo
echo "Sandbox cross-contract tests are not wired up yet."
echo "They require a built artifact set plus a runnable NEAR sandbox, which is a"
echo "separate Day-1/2 gate. See docs/spikes.md (pending)."
