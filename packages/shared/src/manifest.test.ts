import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson,
  computeManifestHash,
  validateManifest,
  type Manifest,
} from './manifest.js';

test('validates sample manifest from fixtures', () => {
  const sample: Manifest = {
    schema_version: '1',
    name: 'Docs Reporter',
    description: 'Produces a repository documentation report.',
    runtime_hint: 'hermes',
    bundle_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    task_kind: 'docs_report_v1',
    manifest_uri: 'https://example.invalid/bundles/docs-reporter.tar.gz',
  };

  assert.doesNotThrow(() => validateManifest(sample));

  const json = canonicalJson(sample);
  assert.equal(
    json,
    '{"schema_version":"1","name":"Docs Reporter","description":"Produces a repository documentation report.","runtime_hint":"hermes","bundle_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","task_kind":"docs_report_v1","manifest_uri":"https://example.invalid/bundles/docs-reporter.tar.gz"}'
  );

  const hash = computeManifestHash(sample);
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 64);
  // Matches exact expected hash from fixtures/README.md and contracts/registry/src/manifest.rs
  assert.equal(hash, '047e40193f92744a8b439ce91b8fb58bbb4a0de8f76d6e33513b864430235763');
});

test('rejects disallowed characters in manifest fields', () => {
  const invalid: Manifest = {
    schema_version: '1',
    name: 'Invalid "Quote" Name',
    description: 'Valid description',
    runtime_hint: 'hermes',
    bundle_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    task_kind: 'docs_report_v1',
    manifest_uri: 'https://example.invalid/bundle.tar.gz',
  };

  assert.throws(() => validateManifest(invalid), /disallowed character/);
});

test('rejects non-hex bundle hash', () => {
  const invalid: Manifest = {
    schema_version: '1',
    name: 'Docs Reporter',
    description: 'Valid description',
    runtime_hint: 'hermes',
    bundle_sha256: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
    task_kind: 'docs_report_v1',
    manifest_uri: 'https://example.invalid/bundle.tar.gz',
  };

  assert.throws(() => validateManifest(invalid), /64 lowercase hex/);
});

