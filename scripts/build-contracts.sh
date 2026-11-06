#!/usr/bin/env bash
#
# Reproducible contract build. Order is load-bearing: the registry factory embeds
# the treasury WASM via `include_bytes!`, so the treasury must be built first and
# copied into place before the registry compiles.
#
# On Windows, run this through the toolchain wrapper:
#   bash scripts/with-rust-toolchain.sh bash scripts/build-contracts.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="${ROOT}/contracts"
TARGET="wasm32-unknown-unknown"
OUT="${CONTRACTS}/target/${TARGET}/release"

cd "${CONTRACTS}"

echo "==> treasury wasm"
cargo build --release --target "${TARGET}" --package nivry-agent-wallet

echo "==> pin treasury wasm into the registry factory"
mkdir -p registry/res
cp "${OUT}/nivry_agent_wallet.wasm" registry/res/agent_wallet.wasm

echo "==> registry wasm"
cargo build --release --target "${TARGET}" --package nivry-registry

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  else
    shasum -a 256 "$1"
  fi
}

echo
echo "==> artifacts (record these in docs/deployment.md before any immutability claim)"
ls -l "${OUT}/nivry_agent_wallet.wasm" "${OUT}/nivry_registry.wasm"
sha256_of "${OUT}/nivry_agent_wallet.wasm"
sha256_of "${OUT}/nivry_registry.wasm"
sha256_of "${CONTRACTS}/registry/res/agent_wallet.wasm"
