#!/usr/bin/env node
/**
 * Nivry CLI entry point (PLAN.md §15).
 * Local bundle packing, read-only agent status, and a guided demo verification.
 */

import { loadConfig } from './chain.js';
import { runDemo } from './demo.js';
import { runPack } from './pack.js';
import { runStatus } from './status.js';

function printUsage(): void {
  console.log('Usage: nivry <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  pack <dir> [--manifest <file>] [--out <file>]');
  console.log('                       Validate and pack a sanitized public agent bundle');
  console.log('  status <token-id> [--json]');
  console.log('                       Inspect on-chain agent and treasury state');
  console.log('  demo [token-id]      Verify the deployed demo end to end (default token 1)');
  console.log('');
  console.log('Environment:');
  console.log('  NEAR_RPC_URL         NEAR RPC endpoint (default https://rpc.testnet.near.org)');
  console.log('  REGISTRY_CONTRACT_ID Registry account (default nivry.testnet)');
  console.log('  NIVRY_ROOT           Repo root, if running outside the checkout');
}

/** Returns the value following `flag`, or undefined; removes both from `args`. */
function takeOption(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  args.splice(index, 2);
  return value;
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return 0;
  }

  const args = [...rest];
  switch (command) {
    case 'pack': {
      const manifestPath = takeOption(args, '--manifest');
      const outPath = takeOption(args, '--out');
      const dir = args[0];
      if (!dir) {
        console.error('✗ pack requires a directory: nivry pack <dir>');
        return 2;
      }
      return runPack({ dir, manifestPath, outPath });
    }
    case 'status': {
      const asJson = takeFlag(args, '--json');
      const tokenId = args[0];
      if (!tokenId) {
        console.error('✗ status requires a token id: nivry status <token-id>');
        return 2;
      }
      return runStatus(loadConfig(), tokenId, asJson);
    }
    case 'demo':
      return runDemo(loadConfig(), args[0] ?? '1');
    default:
      console.error(`✗ unknown command "${command}"`);
      printUsage();
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  },
);
