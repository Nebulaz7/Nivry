import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';

/**
 * Deterministic public-bundle packing (PLAN.md §12).
 *
 * The output bytes must stay identical to `BundleService.packSanitizedDirectory` in the
 * backend: the backend rejects an upload whose SHA-256 differs from the one the contract
 * stores, so any drift in format here would make packed bundles unusable.
 */

export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;
export const MAX_BUNDLE_FILES = 50;
export const BUNDLE_FORMAT = 'nivry-bundle-v1';

/** Thrown for any input that must never become a public bundle. */
export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleError';
  }
}

const FORBIDDEN_SECRET_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /ed25519:[1-9A-HJ-NP-Za-km-z]{32,}/, reason: 'NEAR ed25519 key material' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, reason: 'PEM private key header' },
  { pattern: /\bPRIVATE_KEY\s*=/, reason: 'PRIVATE_KEY assignment' },
  { pattern: /\bSECRET_KEY\s*=/, reason: 'SECRET_KEY assignment' },
  { pattern: /\bsk-[a-zA-Z0-9]{20,}/, reason: 'API secret key token (sk-...)' },
  { pattern: /\bwk_[a-zA-Z0-9]{16,}/, reason: 'wallet credential (wk_...)' },
];

const FORBIDDEN_FILENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
]);

export interface PackedBundle {
  bundle_sha256: string;
  byte_length: number;
  file_count: number;
  files: string[];
  bytes: Buffer;
}

/** Rejects empty/oversized content, path traversal sequences and embedded secrets. */
export function scanForViolations(bytes: Buffer): void {
  if (bytes.length === 0) {
    throw new BundleError('Bundle bytes cannot be empty');
  }
  if (bytes.length > MAX_BUNDLE_BYTES) {
    throw new BundleError(
      `Bundle size (${bytes.length} bytes) exceeds maximum limit (${MAX_BUNDLE_BYTES} bytes)`,
    );
  }

  const text = bytes.toString('utf8');
  if (text.includes('../') || text.includes('..\\')) {
    throw new BundleError('Bundle contains disallowed path traversal sequence (..)');
  }
  for (const { pattern, reason } of FORBIDDEN_SECRET_PATTERNS) {
    if (pattern.test(text)) {
      throw new BundleError(`Bundle rejected by secret scanner: detected ${reason}`);
    }
  }
}

/**
 * Packs the top-level files of a directory into canonical JSON archive bytes.
 * Rejects symlinks, forbidden credential files and secret patterns; skips dotfiles
 * and subdirectories.
 */
export function packSanitizedDirectory(sourceDir: string): PackedBundle {
  const absDir = resolve(sourceDir);
  if (!existsSync(absDir)) {
    throw new BundleError(`Source directory does not exist: ${sourceDir}`);
  }

  const entries = readdirSync(absDir).sort();
  const packed: { path: string; content: string }[] = [];

  for (const name of entries) {
    if (FORBIDDEN_FILENAMES.has(name) || name.startsWith('.env')) {
      throw new BundleError(`Forbidden file in bundle directory: ${name}`);
    }
    if (name.startsWith('.')) continue;

    const fullPath = join(absDir, name);
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      throw new BundleError(`Symlinks are forbidden in agent bundles: ${name}`);
    }
    if (!stat.isFile()) continue;

    const normalized = posix.normalize(name);
    if (normalized.startsWith('..') || normalized.startsWith('/')) {
      throw new BundleError(`Invalid entry path in bundle: ${name}`);
    }

    const contentBytes = readFileSync(fullPath);
    scanForViolations(contentBytes);
    packed.push({ path: normalized, content: contentBytes.toString('utf8') });
  }

  if (packed.length === 0) {
    throw new BundleError('Bundle directory contains no packable files');
  }
  if (packed.length > MAX_BUNDLE_FILES) {
    throw new BundleError(
      `Bundle file count (${packed.length}) exceeds limit (${MAX_BUNDLE_FILES})`,
    );
  }

  const bytes = Buffer.from(
    JSON.stringify({ format: BUNDLE_FORMAT, entries: packed }),
    'utf8',
  );
  scanForViolations(bytes);

  return {
    bundle_sha256: createHash('sha256').update(bytes).digest('hex'),
    byte_length: bytes.length,
    file_count: packed.length,
    files: packed.map((e) => e.path),
    bytes,
  };
}

