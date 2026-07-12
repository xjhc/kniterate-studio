#!/usr/bin/env -S node --import tsx
/**
 * Layer 7 conformance helper: validate the physical swatch registry shape and
 * report whether any entries can support "knit-proven" claims.
 *
 * No physical entry is required for this command to pass. Absence of a matching
 * physical entry caps the conformance verdict at "Verified — swatch
 * recommended"; malformed entries fail because they would make the registry
 * misleading.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

interface SwatchEntryResult {
  id: string;
  ok: boolean;
  stale: boolean;
  knitProven: boolean;
  messages: string[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasTodo(value: unknown): boolean {
  if (typeof value === 'string') return /\bTODO\b|1970-01-01/.test(value);
  if (Array.isArray(value)) return value.some(hasTodo);
  const record = asRecord(value);
  return record !== null && Object.values(record).some(hasTodo);
}

function currentCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function validateTemplate(root: string): string[] {
  const messages: string[] = [];
  const schema = join(root, '_schema.json');
  if (!existsSync(schema)) messages.push('registry schema missing: registry/swatches/_schema.json');
  const template = join(root, '_template');
  for (const file of ['spec.json', 'request.json', 'machine.json', 'yarn.json', 'out.k', 'out.kc', 'outcome.md']) {
    if (!existsSync(join(template, file))) messages.push(`template missing ${file}`);
  }
  return messages;
}

function validateEntry(root: string, id: string, head: string | null): SwatchEntryResult {
  const dir = join(root, id);
  const messages: string[] = [];
  const required = ['spec.json', 'request.json', 'machine.json', 'yarn.json', 'out.k', 'out.kc', 'outcome.md'];
  for (const file of required) {
    if (!existsSync(join(dir, file))) messages.push(`missing ${file}`);
  }

  let spec: Record<string, unknown> = {};
  let machine: Record<string, unknown> = {};
  let yarn: Record<string, unknown> = {};
  let request: Record<string, unknown> = {};
  for (const [name, assign] of [
    ['spec.json', (v: Record<string, unknown>) => { spec = v; }],
    ['machine.json', (v: Record<string, unknown>) => { machine = v; }],
    ['yarn.json', (v: Record<string, unknown>) => { yarn = v; }],
    ['request.json', (v: Record<string, unknown>) => { request = v; }],
  ] as const) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    try {
      const parsed = asRecord(readJson(path));
      if (parsed === null) messages.push(`${name} must be a JSON object`);
      else assign(parsed);
    } catch (err) {
      messages.push(`${name} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (hasTodo(spec) || hasTodo(machine) || hasTodo(yarn) || hasTodo(request)) {
    messages.push('entry still contains TODO/placeholder values');
  }
  if (typeof spec.emitterCommit !== 'string' || spec.emitterCommit.length < 7) {
    messages.push('spec.emitterCommit is required');
  }
  if (typeof spec.sourceFingerprint !== 'string' || spec.sourceFingerprint.length === 0) {
    messages.push('spec.sourceFingerprint is required');
  }
  if (spec.compileResultOk !== true) {
    messages.push('spec.compileResultOk must be true for a completed swatch entry');
  }
  const specRequest = asRecord(spec.request);
  if (specRequest === null || specRequest.path !== 'request.json') {
    messages.push('spec.request.path must point at request.json');
  }
  if (typeof request.reemitCommand !== 'string' || request.reemitCommand.trim() === '') {
    messages.push('request.reemitCommand is required');
  }
  const reemit = asRecord(spec.reemitCheck);
  const reemitStatus = typeof reemit?.status === 'string' ? reemit.status : 'missing';
  if (!['matches', 'stale', 'not-run', 'not-applicable'].includes(reemitStatus)) {
    messages.push('spec.reemitCheck.status must be matches/stale/not-run/not-applicable');
  }
  const outcome = existsSync(join(dir, 'outcome.md')) ? readFileSync(join(dir, 'outcome.md'), 'utf8') : '';
  const cleanOutcome = /\*\*Result:\*\*\s*(clean|pass)/i.test(outcome) || /\bResult:\s*(clean|pass)\b/i.test(outcome);
  const emitterCommit = typeof spec.emitterCommit === 'string' ? spec.emitterCommit : '';
  const stale = reemitStatus !== 'matches' || (head !== null && emitterCommit !== head);
  const knitProven = messages.length === 0 && cleanOutcome && !stale;
  if (!cleanOutcome) messages.push('outcome.md does not record a clean/pass result');

  return {
    id,
    ok: messages.length === 0,
    stale,
    knitProven,
    messages,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  let root = 'registry/swatches';
  let json = false;
  let outPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') json = true;
    else if (arg === '-o' || arg === '--out') outPath = argv[++i];
    else if (arg === '-h' || arg === '--help') {
      process.stdout.write('usage: pnpm kniterate:swatches [registry/swatches] [--json] [-o report.json]\n');
      process.exit(0);
    } else root = arg;
  }

  const absRoot = resolve(root);
  const templateMessages = validateTemplate(absRoot);
  const head = currentCommit();
  const entries = existsSync(absRoot)
    ? readdirSync(absRoot)
      .filter(name => !name.startsWith('.') && name !== '_template' && name !== '_schema.json')
      .filter(name => statSync(join(absRoot, name)).isDirectory())
      .sort()
    : [];
  const results = entries.map(id => validateEntry(absRoot, id, head));
  const ok = templateMessages.length === 0 && results.every(r => r.ok);
  const report = {
    kind: 'kniterate-swatch-registry-report',
    schemaVersion: '1',
    ok,
    currentCommit: head,
    entryCount: results.length,
    knitProvenCount: results.filter(r => r.knitProven).length,
    staleCount: results.filter(r => r.stale).length,
    templateMessages,
    entries: results,
  };

  if (outPath !== undefined) {
    const dest = resolve(outPath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(report, null, 2) + '\n');
  }

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(`kniterate swatch registry: ${results.filter(r => r.ok).length}/${results.length} entries valid; ${report.knitProvenCount} knit-proven current match(es)${ok ? '' : ' · FAILED'}\n`);
    for (const message of templateMessages) process.stdout.write(`  ✗ template: ${message}\n`);
    if (results.length === 0) process.stdout.write('  note: no physical swatch entries yet; verdict remains swatch-recommended.\n');
    for (const r of results) {
      process.stdout.write(`  ${r.ok ? '✓' : '✗'} ${r.id}${r.stale ? ' · stale/not-current' : ''}${r.knitProven ? ' · knit-proven' : ''}\n`);
      for (const message of r.messages.slice(0, 5)) process.stdout.write(`      ${message}\n`);
    }
  }

  if (!ok) process.exit(2);
}

main();
