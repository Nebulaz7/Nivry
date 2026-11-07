import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BundleService, MAX_BUNDLE_BYTES } from './bundle.service';

describe('BundleService', () => {
  let service: BundleService;
  let tempStorageDir: string;

  beforeEach(() => {
    tempStorageDir = mkdtempSync(join(tmpdir(), 'nivry-bundles-test-'));
    process.env.BUNDLE_STORAGE_DIR = tempStorageDir;
    service = new BundleService();
  });

  afterEach(() => {
    rmSync(tempStorageDir, { recursive: true, force: true });
  });

  it('stores and retrieves a valid content-hashed bundle', () => {
    const payload = Buffer.from(
      '{"format":"nivry-bundle-v1","entries":[{"path":"README.md","content":"# Agent"}]}',
      'utf8',
    );
    const sha256 = service.computeSha256(payload);

    const stored = service.storeBundle(sha256, payload);
    expect(stored.bundle_sha256).toBe(sha256);
    expect(stored.byte_length).toBe(payload.length);

    const retrieved = service.getBundle(sha256);
    expect(retrieved.equals(payload)).toBe(true);
  });

  it('rejects upload when SHA-256 does not match content bytes', () => {
    const payload = Buffer.from('valid content', 'utf8');
    const wrongHash = 'a'.repeat(64);

    expect(() => service.storeBundle(wrongHash, payload)).toThrow(
      BadRequestException,
    );
  });

  it('rejects bundles containing embedded NEAR private keys or OutLayer credentials', () => {
    const nearKeyPayload = Buffer.from(
      'config: ed25519:3D4YudUahN1nawWogh8pAKSj92sUNMdbZGjn7kERKzYo',
      'utf8',
    );
    const nearKeyHash = service.computeSha256(nearKeyPayload);
    expect(() => service.storeBundle(nearKeyHash, nearKeyPayload)).toThrow(
      BadRequestException,
    );

    const outlayerPayload = Buffer.from(
      'api_key=wk_1234567890abcdef1234',
      'utf8',
    );
    const outlayerHash = service.computeSha256(outlayerPayload);
    expect(() => service.storeBundle(outlayerHash, outlayerPayload)).toThrow(
      BadRequestException,
    );
  });

  it('rejects bundles containing path traversal sequences', () => {
    const traversalPayload = Buffer.from('{"path":"../../etc/passwd"}', 'utf8');
    const hash = service.computeSha256(traversalPayload);
    expect(() => service.storeBundle(hash, traversalPayload)).toThrow(
      BadRequestException,
    );
  });

  it('rejects oversized bundles', () => {
    const oversized = Buffer.alloc(MAX_BUNDLE_BYTES + 1, 'a');
    const hash = service.computeSha256(oversized);
    expect(() => service.storeBundle(hash, oversized)).toThrow(
      PayloadTooLargeException,
    );
  });

  it('throws NotFoundException when bundle does not exist', () => {
    expect(() => service.getBundle('b'.repeat(64))).toThrow(NotFoundException);
  });

  it('matches the cross-language manifest canonical JSON and SHA-256 fixture vector', () => {
    const sample = {
      schema_version: '1',
      name: 'Docs Reporter',
      description: 'Produces a repository documentation report.',
      runtime_hint: 'hermes',
      bundle_sha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      task_kind: 'docs_report_v1',
      manifest_uri: 'https://example.invalid/bundles/docs-reporter.tar.gz',
    };

    const result = service.validateAndHashManifest(sample);
    expect(result.manifest_hash).toBe(
      '047e40193f92744a8b439ce91b8fb58bbb4a0de8f76d6e33513b864430235763',
    );
  });

  it('packs a sanitized directory deterministically and rejects .env files', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'nivry-pack-src-'));
    try {
      writeFileSync(join(fixtureDir, 'b.txt'), 'second file');
      writeFileSync(join(fixtureDir, 'a.txt'), 'first file');

      const packed1 = service.packSanitizedDirectory(fixtureDir);
      const packed2 = service.packSanitizedDirectory(fixtureDir);

      expect(packed1.bundle_sha256).toBe(packed2.bundle_sha256);
      expect(packed1.files).toEqual(['a.txt', 'b.txt']);

      writeFileSync(join(fixtureDir, '.env'), 'SECRET=123');
      expect(() => service.packSanitizedDirectory(fixtureDir)).toThrow(
        BadRequestException,
      );
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
