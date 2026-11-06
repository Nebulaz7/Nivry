#!/usr/bin/env bash
#
# Run any command with a linkable Rust host toolchain on Windows.
#
# Why this exists: the pinned host toolchain is `x86_64-pc-windows-gnu`, but its
# MinGW binutils (`dlltool.exe`, `ld.exe`) are not on PATH. They ship inside the
# installed `rust-mingw` component, so we add that directory instead of requiring
# a system MinGW install. Without it, every build that needs to link a host
# artifact (all proc-macros, all tests) fails with:
#
#   error calling dlltool 'dlltool.exe': program not found
#
# An MSVC toolchain is not a workaround here: the MSVC C++ build tools are not
# installed, and `link` resolves to git-bash's coreutils binary.
#
# Usage (from the repository root):
#   bash scripts/with-rust-toolchain.sh cargo test --manifest-path contracts/Cargo.toml
#   bash scripts/with-rust-toolchain.sh cargo build --release \
#       --target wasm32-unknown-unknown --manifest-path contracts/Cargo.toml
set -euo pipefail

TOOLCHAIN="${RUSTUP_TOOLCHAIN:-1.99.0-x86_64-pc-windows-gnu}"
SYSROOT="$(rustc "+${TOOLCHAIN}" --print sysroot)"
HOST_BINUTILS="${SYSROOT}/lib/rustlib/x86_64-pc-windows-gnu/bin/self-contained"

if [[ ! -x "${HOST_BINUTILS}/dlltool.exe" ]]; then
  echo "error: dlltool.exe not found in ${HOST_BINUTILS}" >&2
  echo "hint: rustup component add rust-mingw --toolchain ${TOOLCHAIN}" >&2
  exit 1
fi

export PATH="${HOST_BINUTILS}:${PATH}"
export RUSTUP_TOOLCHAIN="${TOOLCHAIN}"
exec "$@"
