#!/usr/bin/env -S node --import tsx
/**
 * Layer 6 conformance gate: known-bad Kniterate programs stay blocked.
 *
 * This is deliberately small and explicit. The surface corpus already pins
 * product-level refusals; this file pins raw machine-safety refusals so a
 * future validator relaxation fails loudly instead of quietly widening what
 * we claim as "verified".
 */

import {
  b,
  carrierIn,
  carrierOut,
  f,
  knit,
  rack,
  xStitchNumber,
  xfer,
  type CarrierId,
  type KnitoutOp,
  type KnitoutProgram,
} from '../src/knitout/types.js';
import { validateKnitoutProgram } from '../src/validators/knitout-program.js';

interface RefusalCase {
  id: string;
  reason: string;
  program: KnitoutProgram;
  expectedRule: string;
  severity?: 'error' | 'warning';
}

interface RefusalResult {
  id: string;
  ok: boolean;
  expectedRule: string;
  matchedSeverity: string | null;
  reason: string;
  matchedMessages: string[];
}

function program(ops: KnitoutOp[], carriers: CarrierId[] = ['1']): KnitoutProgram {
  return {
    version: 2,
    carriers,
    machine: 'kniterate',
    yarns: Object.fromEntries(carriers.map(c => [c, `carrier-${c}`])) as Partial<Record<CarrierId, string>>,
    kniterate: {},
    ops,
  };
}

function illegalCarrierProgram(): KnitoutProgram {
  return {
    version: 2,
    carriers: ['7'] as unknown as CarrierId[],
    machine: 'kniterate',
    yarns: {},
    kniterate: {},
    ops: [
      { kind: 'in', carriers: ['7'] as unknown as CarrierId[] },
      { kind: 'knit', direction: '+', needle: f(50), carriers: ['7'] as unknown as CarrierId[] },
    ],
  };
}

const CASES: readonly RefusalCase[] = [
  {
    id: 'illegal-carrier-7',
    reason: 'Kniterate carriers are 1-6 only.',
    program: illegalCarrierProgram(),
    expectedRule: 'carrier-id-legal',
    severity: 'error',
  },
  {
    id: 'quarter-pitch-rack',
    reason: 'Kniterate accepts integer or half-pitch rack values, not Shima quarter-pitch.',
    program: program([rack(0.25)]),
    expectedRule: 'rack-legal-increment',
    severity: 'error',
  },
  {
    id: 'needle-zero',
    reason: 'Needle 0 is not addressable on Kniterate.',
    program: program([carrierIn('1'), knit('+', f(0), '1'), carrierOut('1')]),
    expectedRule: 'no-needle-zero',
    severity: 'error',
  },
  {
    id: 'same-bed-transfer',
    reason: 'Transfers must cross beds.',
    program: program([xfer(f(50), f(51))]),
    expectedRule: 'xfer-cross-beds',
    severity: 'error',
  },
  {
    id: 'stitch-number-overflow',
    reason: 'Kniterate serializes stitch numbers as one 0-9/A-Z token.',
    program: program([xStitchNumber(36)]),
    expectedRule: 'stitch-number-range',
    severity: 'error',
  },
  {
    id: 'rack-magnitude-warning',
    reason: 'Huge rack values convert but exceed the known safe bed-travel envelope.',
    program: program([rack(22), xfer(f(50), b(50))]),
    expectedRule: 'rack-magnitude',
    severity: 'warning',
  },
];

function runCase(c: RefusalCase): RefusalResult {
  const report = validateKnitoutProgram(c.program);
  const matches = report.messages.filter(m =>
    m.rule === c.expectedRule && (c.severity === undefined || m.severity === c.severity),
  );
  return {
    id: c.id,
    ok: matches.length > 0,
    expectedRule: c.expectedRule,
    matchedSeverity: matches[0]?.severity ?? null,
    reason: c.reason,
    matchedMessages: matches.map(m => m.message),
  };
}

function main(): void {
  const json = process.argv.includes('--json');
  const results = CASES.map(runCase);
  const ok = results.every(r => r.ok);
  const report = {
    kind: 'kniterate-refusal-corpus-report',
    schemaVersion: '1',
    ok,
    cases: results,
  };

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(`kniterate refusal corpus: ${results.filter(r => r.ok).length}/${results.length} cases pinned${ok ? '' : ' · FAILED'}\n`);
    for (const r of results) {
      process.stdout.write(`  ${r.ok ? '✓' : '✗'} ${r.id.padEnd(24)} ${r.expectedRule}${r.matchedSeverity ? ` (${r.matchedSeverity})` : ''}\n`);
      if (!r.ok) process.stdout.write(`      expected validator rule did not fire: ${r.reason}\n`);
    }
  }

  if (!ok) process.exit(2);
}

main();
