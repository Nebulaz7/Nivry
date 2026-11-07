import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  canonicalJson,
  computeManifestHash,
  validateManifest,
  type Manifest,
} from '@nivry/shared';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, posix, resolve } from 'node:path';

export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_BUNDLE_FILES = 50;
export const SHA256_HEX_LENGTH = 64;

export type BundleManifestInput = Manifest;

export interface PackedBundleResult {
  bundle_sha256: string;
  byte_length: number;
  file_count: number;
  files: string[];
  bytes: Buffer;
}

/**
 * Patterns that must never appear in a public sanitized agent bundle (PLAN.md §12, §18).
 */
const FORBIDDEN_SECRET_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /ed25519:[1-9A-HJ-NP-Za-km-z]{32,}/,
    reason: 'NEAR ed25519 key material',
  },
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    reason: 'PEM private key header',
  },
  { pattern: /\bPRIVATE_KEY\s*=/, reason: 'PRIVATE_KEY assignment' },
  { pattern: /\bSECRET_KEY\s*=/, reason: 'SECRET_KEY assignment' },
  { pattern: /\bsk-[a-zA-Z0-9]{20,}/, reason: 'API secret key token (sk-...)' },
  {
    pattern: /\bwk_[a-zA-Z0-9]{16,}/,
    reason: 'OutLayer wallet credential (wk_...)',
  },
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

@Injectable()
export class BundleService {
  private readonly storageDir: string;

  constructor() {
    this.storageDir = resolve(
      process.env.BUNDLE_STORAGE_DIR || './data/bundles',
    );
    mkdirSync(this.storageDir, { recursive: true });
  }

  /**
   * Validates that a hash string is exactly 64 lowercase hexadecimal characters.
   */
  validateSha256Hex(hash: string): void {
    if (
      typeof hash !== 'string' ||
      hash.length !== SHA256_HEX_LENGTH ||
      !/^[0-9a-f]{64}$/.test(hash)
    ) {
      throw new BadRequestException(
        'bundle_sha256 must be 64 lowercase hex characters',
      );
    }
  }

  /**
   * Computes the lowercase hex SHA-256 digest of a Buffer.
   */
  computeSha256(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  /**
   * Scans raw bundle bytes for embedded private keys, credentials, path traversal, or forbidden files.
   */
  scanBundleForViolations(bytes: Buffer): void {
    if (bytes.length === 0) {
      throw new BadRequestException('Bundle bytes cannot be empty');
    }
    if (bytes.length > MAX_BUNDLE_BYTES) {
      throw new PayloadTooLargeException(
        `Bundle size (${bytes.length} bytes) exceeds maximum limit (${MAX_BUNDLE_BYTES} bytes)`,
      );
    }

    const textView = bytes.toString('utf8');

    if (textView.includes('../') || textView.includes('..\\')) {
      throw new BadRequestException(
        'Bundle contains disallowed path traversal sequence (..)',
      );
    }

    for (const { pattern, reason } of FORBIDDEN_SECRET_PATTERNS) {
      if (pattern.test(textView)) {
        throw new BadRequestException(
          `Bundle rejected by secret scanner: detected ${reason}`,
        );
      }
    }
  }

  /**
   * Validates and stores raw bundle bytes under their exact SHA-256 content hash.
   */
  storeBundle(
    expectedSha256: string,
    bytes: Buffer,
  ): { bundle_sha256: string; byte_length: number } {
    this.validateSha256Hex(expectedSha256);
    this.scanBundleForViolations(bytes);

    const actualSha256 = this.computeSha256(bytes);
    if (actualSha256 !== expectedSha256) {
      throw new BadRequestException(
        `Bundle SHA-256 mismatch: expected ${expectedSha256}, computed ${actualSha256}`,
      );
    }

    const targetPath = this.getBundleFilePath(actualSha256);
    const tempPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;

    writeFileSync(tempPath, bytes, { flag: 'wx' });
    renameSync(tempPath, targetPath);

    return {
      bundle_sha256: actualSha256,
      byte_length: bytes.length,
    };
  }

  /**
   * Retrieves stored bundle bytes by SHA-256 and re-verifies integrity before returning.
   */
  getBundle(sha256: string): Buffer {
    this.validateSha256Hex(sha256);
    const targetPath = this.getBundleFilePath(sha256);

    if (!existsSync(targetPath)) {
      throw new NotFoundException(`Bundle ${sha256} not found`);
    }

    const bytes = readFileSync(targetPath);
    const actualSha256 = this.computeSha256(bytes);

    if (actualSha256 !== sha256) {
      throw new InternalServerErrorException(
        `Stored bundle integrity check failed for ${sha256}: computed ${actualSha256}`,
      );
    }

    return bytes;
  }

  /**
   * Deterministically packs a sanitized directory into canonical JSON archive bytes,
   * rejecting symlinks, hidden files, path traversal, and secret patterns.
   */
  packSanitizedDirectory(sourceDir: string): PackedBundleResult {
    const absDir = resolve(sourceDir);
    if (!existsSync(absDir)) {
      throw new BadRequestException(
        `Source directory does not exist: ${sourceDir}`,
      );
    }

    const entries = readdirSync(absDir).sort();
    const packedEntries: { path: string; content: string }[] = [];

    for (const entryName of entries) {
      if (FORBIDDEN_FILENAMES.has(entryName) || entryName.startsWith('.env')) {
        throw new BadRequestException(
          `Forbidden file in bundle directory: ${entryName}`,
        );
      }
      if (entryName.startsWith('.')) {
        continue;
      }

      const fullPath = join(absDir, entryName);
      const stat = lstatSync(fullPath);

      if (stat.isSymbolicLink()) {
        throw new BadRequestException(
          `Symlinks are forbidden in agent bundles: ${entryName}`,
        );
      }
      if (!stat.isFile()) {
        continue;
      }

      const normalizedPath = posix.normalize(entryName);
      if (normalizedPath.startsWith('..') || normalizedPath.startsWith('/')) {
        throw new BadRequestException(
          `Invalid entry path in bundle: ${entryName}`,
        );
      }

      const contentBytes = readFileSync(fullPath);
      this.scanBundleForViolations(contentBytes);

      packedEntries.push({
        path: normalizedPath,
        content: contentBytes.toString('utf8'),
      });
    }

    if (packedEntries.length === 0) {
      throw new BadRequestException(
        'Bundle directory contains no packable files',
      );
    }
    if (packedEntries.length > MAX_BUNDLE_FILES) {
      throw new BadRequestException(
        `Bundle file count (${packedEntries.length}) exceeds limit (${MAX_BUNDLE_FILES})`,
      );
    }

    const canonicalPayload = JSON.stringify({
      format: 'nivry-bundle-v1',
      entries: packedEntries,
    });
    const bytes = Buffer.from(canonicalPayload, 'utf8');
    this.scanBundleForViolations(bytes);

    const bundleSha256 = this.computeSha256(bytes);
    return {
      bundle_sha256: bundleSha256,
      byte_length: bytes.length,
      file_count: packedEntries.length,
      files: packedEntries.map((e) => e.path),
      bytes,
    };
  }

  /**
   * Validates a Manifest object and returns its canonical JSON and SHA-256 hash
   * matching contracts/registry/src/manifest.rs.
   */
  validateAndHashManifest(manifest: BundleManifestInput): {
    canonical_json: string;
    manifest_hash: string;
  } {
    if (!manifest || typeof manifest !== 'object') {
      throw new BadRequestException('Manifest payload is required');
    }

    try {
      validateManifest(manifest);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }

    return {
      canonical_json: canonicalJson(manifest),
      manifest_hash: computeManifestHash(manifest),
    };
  }

  private getBundleFilePath(sha256: string): string {
    return join(this.storageDir, `${sha256}.bundle`);
  }
}
