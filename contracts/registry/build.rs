//! Pins the treasury code hash at build time.
//!
//! Hashing the embedded ~274 KB WASM inside `new()` cost more gas than a default
//! function call is given, so initialization failed on a real node. The bytes are
//! fixed at compile time, so the hash is too — compute it once here and embed it.
//!
//! `scripts/build-contracts.sh` copies the treasury artifact into `res/` before
//! this crate builds, so the hash always describes the bytes that get deployed.

use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

fn main() {
    let wasm_path = Path::new("res/agent_wallet.wasm");
    println!("cargo:rerun-if-changed=res/agent_wallet.wasm");

    let bytes = fs::read(wasm_path).unwrap_or_else(|error| {
        panic!(
            "cannot read {}: {error}\n\
             Run `scripts/build-contracts.sh`: the treasury WASM must exist before \
             the registry builds, because the factory embeds it.",
            wasm_path.display()
        )
    });

    let digest = Sha256::digest(&bytes);
    let hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();

    println!("cargo:rustc-env=NIVRY_WALLET_CODE_HASH={hex}");
    println!("cargo:rustc-env=NIVRY_WALLET_WASM_LEN={}", bytes.len());
}
