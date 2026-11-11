import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BundleError,
  canonicalJson,
  computeManifestHash,
  packSanitizedDirectory,
  validateManifest,
  type Manifest,
} from '@nivry/shared';

export interface PackOptions {
  dir: string;
  manifestPath?: string;
  outPath?: string;
}

/**
 * `nivry pack <dir> [--manifest <file>] [--out <file>]`
 *
 * Packs a sanitized bundle directory deterministically and prints the SHA-256 that the
 * manifest must commit to. With `--manifest`, also validates the manifest against the
 * contract's protocol bounds and prints its canonical JSON and hash.
 */
export function runPack(options: PackOptions): number {
  let packed;
  try {
    packed = packSanitizedDirectory(options.dir);
  } catch (err) {
    if (err instanceof BundleError) {
      console.error(`✗ pack failed: ${err.message}`);
      return 1;
    }
    throw err;
  }

  console.log(`✓ Packed ${packed.file_count} file(s), ${packed.byte_length} bytes`);
  for (const file of packed.files) console.log(`    ${file}`);
  console.log(`  bundle_sha256: ${packed.bundle_sha256}`);

  if (options.outPath) {
    const out = resolve(options.outPath);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, packed.bytes);
    console.log(`  bundle written to ${out}`);
  }

  if (!options.manifestPath) {
    console.log('');
    console.log('Tip: pass --manifest <file> to bind this hash into a validated manifest.');
    return 0;
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(options.manifestPath), 'utf8')) as Manifest;
  } catch (err) {
    console.error(
      `✗ cannot read manifest ${options.manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  const bound: Manifest = { ...manifest, bundle_sha256: packed.bundle_sha256 };
  try {
    validateManifest(bound);
  } catch (err) {
    console.error(`✗ manifest invalid: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  console.log('');
  console.log('✓ Manifest valid (bundle_sha256 bound to the packed bundle)');
  console.log(`  manifest_hash: ${computeManifestHash(bound)}`);
  console.log(`  canonical_json: ${canonicalJson(bound)}`);
  return 0;
}

