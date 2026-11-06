//! The fixed, public agent manifest (bundle format v1, PLAN.md §12).
//!
//! The manifest is the *published configuration* of an agent, not an attestation
//! of what the runtime executes. `sha256_hex` commits to the canonical JSON bytes
//! defined here, so the frontend/backend packer and this contract agree on one
//! byte sequence.

use near_sdk::{env, near, require};

pub const MANIFEST_SCHEMA_VERSION: &str = "1";

pub const MAX_NAME_LEN: usize = 64;
pub const MAX_DESCRIPTION_LEN: usize = 256;
pub const MAX_RUNTIME_HINT_LEN: usize = 32;
pub const MAX_TASK_KIND_LEN: usize = 32;
pub const MAX_URI_LEN: usize = 256;
pub const BUNDLE_SHA256_HEX_LEN: usize = 64;

/// Fixed bundle reference for the MVP. The manifest is immutable once a token is
/// created; manifest editing and version history are out of scope.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Manifest {
    pub schema_version: String,
    pub name: String,
    pub description: String,
    pub runtime_hint: String,
    /// Lowercase hex SHA-256 of the published bundle archive bytes.
    pub bundle_sha256: String,
    pub task_kind: String,
    pub manifest_uri: String,
}

impl Manifest {
    /// Rejects anything outside the canonical charset or the documented maxima.
    ///
    /// The charset restriction is what makes [`Self::canonical_json`] exact: no
    /// field can contain a quote, backslash or control character, so no JSON
    /// escaping is ever required.
    pub fn validate(&self) {
        require!(
            self.schema_version == MANIFEST_SCHEMA_VERSION,
            "unsupported manifest schema_version"
        );
        require!(
            (1..=MAX_NAME_LEN).contains(&self.name.len()),
            "manifest name must be 1..=64 bytes"
        );
        require!(
            self.description.len() <= MAX_DESCRIPTION_LEN,
            "manifest description exceeds 256 bytes"
        );
        require!(
            (1..=MAX_RUNTIME_HINT_LEN).contains(&self.runtime_hint.len()),
            "manifest runtime_hint must be 1..=32 bytes"
        );
        require!(
            (1..=MAX_TASK_KIND_LEN).contains(&self.task_kind.len()),
            "manifest task_kind must be 1..=32 bytes"
        );
        require!(
            (1..=MAX_URI_LEN).contains(&self.manifest_uri.len()),
            "manifest manifest_uri must be 1..=256 bytes"
        );
        require!(
            self.manifest_uri.starts_with("https://") || self.manifest_uri.starts_with("ipfs://"),
            "manifest_uri must be an https:// or ipfs:// reference"
        );

        for (field, value) in [
            ("name", &self.name),
            ("description", &self.description),
            ("runtime_hint", &self.runtime_hint),
            ("task_kind", &self.task_kind),
            ("manifest_uri", &self.manifest_uri),
        ] {
            require!(
                is_canonical_text(value),
                format!("manifest {field} contains a disallowed character")
            );
        }

        require!(
            is_lowercase_hex(&self.bundle_sha256)
                && self.bundle_sha256.len() == BUNDLE_SHA256_HEX_LEN,
            "bundle_sha256 must be 64 lowercase hex characters"
        );
    }

    /// The exact byte sequence that `sha256_hex` commits to.
    ///
    /// Field order, separators and absence of whitespace are part of the
    /// cross-language contract. Changing this is a schema migration.
    pub fn canonical_json(&self) -> String {
        format!(
            "{{\"schema_version\":\"{}\",\"name\":\"{}\",\"description\":\"{}\",\"runtime_hint\":\"{}\",\"bundle_sha256\":\"{}\",\"task_kind\":\"{}\",\"manifest_uri\":\"{}\"}}",
            self.schema_version,
            self.name,
            self.description,
            self.runtime_hint,
            self.bundle_sha256,
            self.task_kind,
            self.manifest_uri,
        )
    }

    /// Lowercase hex SHA-256 of [`Self::canonical_json`].
    pub fn sha256_hex(&self) -> String {
        to_hex(&env::sha256(self.canonical_json().as_bytes()))
    }

    /// The 32 bundle bytes, for NEP-177 `reference_hash`.
    pub fn bundle_hash_bytes(&self) -> Vec<u8> {
        from_hex(&self.bundle_sha256).expect("bundle_sha256 was validated as hex")
    }
}

fn is_canonical_text(value: &str) -> bool {
    value
        .chars()
        .all(|c| c.is_ascii() && !c.is_ascii_control() && c != '"' && c != '\\')
}

fn is_lowercase_hex(value: &str) -> bool {
    !value.is_empty() && value.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f'))
}

pub fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

pub fn from_hex(value: &str) -> Option<Vec<u8>> {
    if !value.len().is_multiple_of(2) {
        return None;
    }
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() / 2);
    for pair in bytes.chunks(2) {
        let hi = (pair[0] as char).to_digit(16)?;
        let lo = (pair[1] as char).to_digit(16)?;
        out.push(((hi << 4) | lo) as u8);
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn example() -> Manifest {
        Manifest {
            schema_version: "1".to_owned(),
            name: "Docs Reporter".to_owned(),
            description: "Produces a repository documentation report.".to_owned(),
            runtime_hint: "hermes".to_owned(),
            bundle_sha256: "a".repeat(64),
            task_kind: "docs_report_v1".to_owned(),
            manifest_uri: "https://example.invalid/bundles/docs-reporter.tar.gz".to_owned(),
        }
    }

    fn setup() {
        testing_env!(VMContextBuilder::new().build());
    }

    #[test]
    fn canonical_json_is_stable_and_unspaced() {
        setup();
        assert_eq!(
            example().canonical_json(),
            concat!(
                "{\"schema_version\":\"1\",\"name\":\"Docs Reporter\",",
                "\"description\":\"Produces a repository documentation report.\",",
                "\"runtime_hint\":\"hermes\",\"bundle_sha256\":\"",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "\",\"task_kind\":\"docs_report_v1\",",
                "\"manifest_uri\":\"https://example.invalid/bundles/docs-reporter.tar.gz\"}"
            )
        );
    }

    #[test]
    fn hash_is_32_bytes_of_sha256() {
        setup();
        let manifest = example();
        let hex = manifest.sha256_hex();
        assert_eq!(hex.len(), 64);
        assert!(is_lowercase_hex(&hex));
        assert_eq!(manifest.bundle_hash_bytes().len(), 32);
        // Locks the cross-language contract: `fixtures/manifest.example.json`
        // documents this exact canonical form and hash.
        assert_eq!(
            hex,
            "047e40193f92744a8b439ce91b8fb58bbb4a0de8f76d6e33513b864430235763"
        );
    }

    #[test]
    fn valid_manifest_passes() {
        setup();
        example().validate();
    }

    #[test]
    #[should_panic(expected = "disallowed character")]
    fn rejects_quotes_in_canonical_fields() {
        setup();
        let mut manifest = example();
        manifest.name = "a\"b".to_owned();
        manifest.validate();
    }

    #[test]
    #[should_panic(expected = "unsupported manifest schema_version")]
    fn rejects_wrong_schema_version() {
        setup();
        let mut manifest = example();
        manifest.schema_version = "2".to_owned();
        manifest.validate();
    }

    #[test]
    #[should_panic(expected = "bundle_sha256 must be 64 lowercase hex characters")]
    fn rejects_uppercase_bundle_hash() {
        setup();
        let mut manifest = example();
        manifest.bundle_sha256 = "A".repeat(64);
        manifest.validate();
    }

    #[test]
    #[should_panic(expected = "manifest_uri must be an https:// or ipfs:// reference")]
    fn rejects_non_content_uri() {
        setup();
        let mut manifest = example();
        manifest.manifest_uri = "ftp://example.invalid/x".to_owned();
        manifest.validate();
    }

    #[test]
    fn hex_round_trips() {
        let bytes = vec![0x00, 0x0f, 0xa5, 0xff];
        assert_eq!(to_hex(&bytes), "000fa5ff");
        assert_eq!(from_hex("000fa5ff").unwrap(), bytes);
        assert!(from_hex("abc").is_none());
        assert!(from_hex("zz").is_none());
    }
}
