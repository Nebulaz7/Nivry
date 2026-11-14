/**
 * Client mirror of `contracts/registry/src/manifest.rs`.
 *
 * The manifest hash is a commitment to an exact byte sequence, so the field
 * order and the absence of whitespace here are part of the contract, not a
 * formatting preference. The contract rejects quotes, backslashes and control
 * characters, which is what keeps the canonical form unambiguous.
 */

import type { Manifest } from "./types";

export const MANIFEST_SCHEMA_VERSION = "1";

export const MANIFEST_LIMITS = {
  name: 64,
  description: 256,
  runtime_hint: 32,
  task_kind: 32,
  manifest_uri: 256,
  bundle_sha256: 64,
} as const;

export type ManifestField = keyof Omit<Manifest, "schema_version">;

export type ManifestDraft = Omit<Manifest, "schema_version">;

export type ManifestErrors = Partial<Record<ManifestField, string>>;

export function emptyDraft(): ManifestDraft {
  return {
    name: "",
    description: "",
    runtime_hint: "",
    bundle_sha256: "",
    task_kind: "",
    manifest_uri: "",
  };
}

export function toManifest(draft: ManifestDraft): Manifest {
  return { schema_version: MANIFEST_SCHEMA_VERSION, ...draft };
}

/** The exact bytes the contract hashes. Field order is fixed. */
export function canonicalJson(manifest: Manifest): string {
  return (
    `{"schema_version":"${manifest.schema_version}"` +
    `,"name":"${manifest.name}"` +
    `,"description":"${manifest.description}"` +
    `,"runtime_hint":"${manifest.runtime_hint}"` +
    `,"bundle_sha256":"${manifest.bundle_sha256}"` +
    `,"task_kind":"${manifest.task_kind}"` +
    `,"manifest_uri":"${manifest.manifest_uri}"}`
  );
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** Lowercase hex SHA-256. Requires a secure context (https or localhost). */
export async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

/** Lowercase hex SHA-256 of the canonical manifest JSON. */
export function manifestHash(manifest: Manifest): Promise<string> {
  return sha256Hex(canonicalJson(manifest));
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** The contract's charset rule: printable ASCII, no quote, no backslash. */
export function isCanonicalText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) return false;
    if (code === 0x22 || code === 0x5c) return false;
  }
  return true;
}

export function isLowercaseHex(value: string): boolean {
  return value.length > 0 && [...value].every((char) => "0123456789abcdef".includes(char));
}

/**
 * Mirrors `Manifest::validate`, field by field, so the form rejects a value the
 * contract would panic on instead of discovering it after a signature.
 */
export function validateDraft(draft: ManifestDraft): ManifestErrors {
  const errors: ManifestErrors = {};

  const checkText = (field: ManifestField, min: number, max: number, label: string) => {
    const value = draft[field];
    const length = byteLength(value);
    if (length < min) {
      errors[field] = `${label} is required.`;
      return;
    }
    if (length > max) {
      errors[field] = `${label} exceeds ${max} bytes.`;
      return;
    }
    if (!isCanonicalText(value)) {
      errors[field] = `${label} may not contain quotes, backslashes or non-ASCII characters.`;
    }
  };

  checkText("name", 1, MANIFEST_LIMITS.name, "Name");
  checkText("runtime_hint", 1, MANIFEST_LIMITS.runtime_hint, "Runtime");
  checkText("task_kind", 1, MANIFEST_LIMITS.task_kind, "Task kind");
  checkText("manifest_uri", 1, MANIFEST_LIMITS.manifest_uri, "Manifest URI");

  if (byteLength(draft.description) > MANIFEST_LIMITS.description) {
    errors.description = `Description exceeds ${MANIFEST_LIMITS.description} bytes.`;
  } else if (!isCanonicalText(draft.description)) {
    errors.description =
      "Description may not contain quotes, backslashes or non-ASCII characters.";
  }

  if (!draft.manifest_uri.startsWith("https://") && !draft.manifest_uri.startsWith("ipfs://")) {
    errors.manifest_uri = "Must start with https:// or ipfs://.";
  }

  if (draft.bundle_sha256.length !== MANIFEST_LIMITS.bundle_sha256) {
    errors.bundle_sha256 = "Must be 64 lowercase hex characters.";
  } else if (!isLowercaseHex(draft.bundle_sha256)) {
    errors.bundle_sha256 = "Must be lowercase hex only.";
  }

  return errors;
}

export function isDraftValid(draft: ManifestDraft): boolean {
  return Object.keys(validateDraft(draft)).length === 0;
}
