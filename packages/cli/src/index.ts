#!/usr/bin/env node
/**
 * Nivry CLI entry point (PLAN.md §15).
 * Supports local bundle packing, agent status checks, and guided demo flows.
 */

const [, , command] = process.argv;

function printUsage(): void {
  console.log('Usage: nivry <command>');
  console.log('');
  console.log('Commands:');
  console.log('  pack <dir>          Validate and pack a sanitized public agent bundle');
  console.log('  status <token-id>   Inspect on-chain agent and treasury state');
  console.log('  demo                Run guided end-to-end demonstration check');
}

if (!command || command === '--help' || command === '-h') {
  printUsage();
  process.exit(0);
}

console.log(`Nivry CLI scaffold: command "${command}" will be wired in Phase 2.`);

