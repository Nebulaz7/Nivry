#!/usr/bin/env node
/**
 * Headless Hermes Task Adapter for `docs_report_v1` (PLAN.md §12).
 * Reads a bounded local fixture directory, generates a deterministic markdown
 * documentation report, and computes its lowercase hex SHA-256 hash.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MAX_FILES = 50;
const MAX_FILE_BYTES = 256 * 1024;

export function runDocsReport(targetDir) {
  const rootDir = resolve(targetDir);
  const entries = readdirSync(rootDir).sort();

  if (entries.length > MAX_FILES) {
    throw new Error(`Directory exceeds max file limit (${MAX_FILES})`);
  }

  const filesAnalyzed = [];
  const sections = [];

  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const fullPath = join(rootDir, name);
    const stat = statSync(fullPath);
    if (!stat.isFile()) continue;
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`File ${name} exceeds size limit`);
    }

    const relPath = relative(rootDir, fullPath);
    filesAnalyzed.push(relPath);

    const content = readFileSync(fullPath, 'utf8');
    const exportedFns = [...content.matchAll(/export\s+function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g)]
      .map((m) => `${m[1]}(${m[2].trim()})`);

    sections.push({
      file: relPath,
      bytes: stat.size,
      lines: content.split(/\r?\n/).length,
      exports: exportedFns,
    });
  }

  const reportLines = [
    '# Repository Documentation Report (`docs_report_v1`)',
    '',
    `Files Analyzed: ${filesAnalyzed.length}`,
    '',
    '## File Breakdown',
  ];

  for (const s of sections) {
    reportLines.push(`### \`${s.file}\` (${s.lines} lines, ${s.bytes} bytes)`);
    if (s.exports.length > 0) {
      reportLines.push('- Exported functions:');
      for (const fn of s.exports) {
        reportLines.push(`  - \`${fn}\``);
      }
    } else {
      reportLines.push('- Documentation / static file');
    }
    reportLines.push('');
  }

  const reportMarkdown = reportLines.join('\n');
  const outputSha256 = createHash('sha256').update(reportMarkdown, 'utf8').digest('hex');

  return {
    task_kind: 'docs_report_v1',
    files_analyzed: filesAnalyzed,
    summary: `Analyzed ${filesAnalyzed.length} files and generated documentation report.`,
    report_markdown: reportMarkdown,
    output_sha256: outputSha256,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputDir = process.argv[2] || 'fixtures/sample-repo';
  const result = runDocsReport(inputDir);
  console.log(JSON.stringify(result, null, 2));
}

