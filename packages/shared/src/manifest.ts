import { createHash } from 'node:crypto';
import {
  BUNDLE_SHA256_HEX_LEN,
  MANIFEST_SCHEMA_VERSION,
  MAX_DESCRIPTION_LEN,
  MAX_NAME_LEN,
  MAX_RUNTIME_HINT_LEN,
  MAX_TASK_KIND_LEN,
  MAX_URI_LEN,
} from './constants.js';

export interface Manifest {
  schema_version: string;
  name: string;
  description: string;
  runtime_hint: string;
  bundle_sha256: string;
  task_kind: string;
  manifest_uri: string;
}

/**
 * Checks whether text contains only printable ASCII without quotes or backslashes.
 * Matches Rust `is_canonical_text` in contracts/registry/src/manifest.rs.
 */
export function isCanonicalText(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    // Printable ASCII: 32 (space) to 126 (~), excluding 34 (") and 92 (\)
    if (code < 32 || code > 126 || code === 34 || code === 92) {
      return false;
    }
  }
  return true;
}

/**
 * Validates a 64-character lowercase hexadecimal hash string.
 */
export function isLowercaseHex(value: string): boolean {
  if (value.length !== BUNDLE_SHA256_HEX_LEN) {
    return false;
  }
  return /^[0-9a-f]{64}$/.test(value);
}

/**
 * Validates the manifest against contract protocol bounds.
 * Throws an error if any field is invalid.
 */
export function validateManifest(manifest: Manifest): void {
  if (manifest.schema_version !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(`unsupported manifest schema_version: ${manifest.schema_version}`);
  }
  if (manifest.name.length < 1 || manifest.name.length > MAX_NAME_LEN) {
    throw new Error(`manifest name must be 1..=${MAX_NAME_LEN} bytes`);
  }
  if (manifest.description.length > MAX_DESCRIPTION_LEN) {
    throw new Error(`manifest description exceeds ${MAX_DESCRIPTION_LEN} bytes`);
  }
  if (manifest.runtime_hint.length < 1 || manifest.runtime_hint.length > MAX_RUNTIME_HINT_LEN) {
    throw new Error(`manifest runtime_hint must be 1..=${MAX_RUNTIME_HINT_LEN} bytes`);
  }
  if (manifest.task_kind.length < 1 || manifest.task_kind.length > MAX_TASK_KIND_LEN) {
    throw new Error(`manifest task_kind must be 1..=${MAX_TASK_KIND_LEN} bytes`);
  }
  if (manifest.manifest_uri.length < 1 || manifest.manifest_uri.length > MAX_URI_LEN) {
    throw new Error(`manifest manifest_uri must be 1..=${MAX_URI_LEN} bytes`);
  }
  if (!manifest.manifest_uri.startsWith('https://') && !manifest.manifest_uri.startsWith('ipfs://')) {
    throw new Error('manifest_uri must be an https:// or ipfs:// reference');
  }

  const fields: [string, string][] = [
    ['name', manifest.name],
    ['description', manifest.description],
    ['runtime_hint', manifest.runtime_hint],
    ['task_kind', manifest.task_kind],
    ['manifest_uri', manifest.manifest_uri],
  ];

  for (const [field, value] of fields) {
    if (!isCanonicalText(value)) {
      throw new Error(`manifest ${field} contains a disallowed character`);
    }
  }

  if (!isLowercaseHex(manifest.bundle_sha256)) {
    throw new Error('bundle_sha256 must be 64 lowercase hex characters');
  }
}

/**
 * Serializes the manifest to the exact canonical byte string expected by the contract.
 * Field order, separators, and absence of whitespace match Rust `canonical_json()`.
 */
export function canonicalJson(manifest: Manifest): string {
  return `{"schema_version":"${manifest.schema_version}","name":"${manifest.name}","description":"${manifest.description}","runtime_hint":"${manifest.runtime_hint}","bundle_sha256":"${manifest.bundle_sha256}","task_kind":"${manifest.task_kind}","manifest_uri":"${manifest.manifest_uri}"}`;
}

/**
 * Computes the lowercase hex SHA-256 hash of the canonical manifest JSON string.
 */
export function computeManifestHash(manifest: Manifest): string {
  const jsonStr = canonicalJson(manifest);
  return createHash('sha256').update(jsonStr, 'utf8').digest('hex');
}

