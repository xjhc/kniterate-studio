#!/usr/bin/env -S node --import tsx
/** KCode-native refusal gate. Every case keeps one deliberate command defect. */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  KNITERATE_7GG_KCODE_PROFILE_V2,
  type KCodeCarrierToken,
  type KCodeOperationV1,
  type KCodePassDirectionV1,
} from '../src/knitout/kcode/machine-profile.js';
import { projectKCodeMachineTrace } from '../src/knitout/kcode/machine-trace.js';
import { validateKCodeMachineTrace } from '../src/knitout/kcode/machine-validator.js';
import { parseKCodeDocument } from '../src/knitout/kcode/parser.js';
import { isKCodeCommandLegalityExportEligible } from '../src/knitout/kcode/export-eligibility.js';

const PADDING = 15;
const NEEDLE_COLUMNS = 253;
const BASE_WIDTH = 283;

interface PassSpec {
  rack: number;
  direction: KCodePassDirectionV1;
  operation: KCodeOperationV1;
  carrier: KCodeCarrierToken;
  front: number[];
  rear: number[];
  carriageStops?: { left: number; right: number };
  carrierStops?: { left: number; right: number };
}

interface RefusalCase {
  id: string;
  expectedBlockingRules: readonly string[];
  source: string;
}

interface RefusalEvaluation {
  readonly blockingRules: readonly string[];
  readonly exportEligible: boolean;
  readonly rejectionStage: 'parser' | 'validator' | 'none';
}

function baseBed(selected: readonly number[]): string {
  const needles = Array.from({ length: NEEDLE_COLUMNS }, () => '_');
  for (const coordinate of selected) needles[coordinate] = '-';
  return '.'.repeat(PADDING) + needles.join('') + '.'.repeat(PADDING);
}

function decorate(base: string, pass: PassSpec): string {
  const carriage = pass.carriageStops ?? { left: -5.5, right: 257.5 };
  const carrierStops = pass.carrierStops ?? { left: 29.5, right: 219.5 };
  const at = (stop: number): number => stop + PADDING + 0.5;
  const markers: Array<[number, string]> = pass.carrier === '0'
    ? [[at(carriage.left), '/'], [at(carriage.right), '\\']]
    : [
        [at(carriage.left), '/'],
        [at(carrierStops.left), pass.carrier],
        [at(carrierStops.right), pass.carrier],
        [at(carriage.right), '\\'],
      ];
  let result = '';
  let marker = 0;
  for (let index = 0; index <= base.length; index++) {
    while (markers[marker]?.[0] === index) result += markers[marker++]![1];
    if (index < base.length) result += base[index];
  }
  return result;
}

function render(passes: readonly PassSpec[]): string {
  const lines = ['HOME', 'RACK:0', '// KCode-native refusal fixture'];
  let rack = 0;
  for (const pass of passes) {
    if (!Object.is(pass.rack, rack)) {
      lines.push(`RACK:${pass.rack}`);
      rack = pass.rack;
    }
    lines.push(
      `FRNT:${decorate(baseBed(pass.front), pass)}`,
      `STIF:${'6'.repeat(BASE_WIDTH)}`,
      `REAR:${decorate(baseBed(pass.rear), pass)}`,
      `STIR:${'6'.repeat(BASE_WIDTH)}`,
      `${pass.direction} ${pass.operation} ${pass.carrier} 300 100`,
    );
  }
  return `${lines.join('\n')}\n`;
}

const regular = render([{
  rack: 0,
  direction: '>>',
  operation: 'Kn-Kn',
  carrier: '2',
  front: [100],
  rear: [],
}]);
const validTransfer = render([
  { rack: 0, direction: '<<', operation: 'Kn-Kn', carrier: '2', front: [100], rear: [] },
  { rack: 0, direction: '>>', operation: 'Tr-Rr', carrier: '0', front: [100], rear: [100] },
]);

function replaceFooter(source: string, mutate: (line: string) => string): string {
  const lines = source.split('\n');
  const index = lines.findIndex((line) => line.startsWith('>>') || line.startsWith('<<'));
  lines[index] = mutate(lines[index]!);
  return lines.join('\n');
}

function replaceLine(
  source: string,
  prefix: string,
  mutate: (line: string) => string,
): string {
  const lines = source.split('\n');
  const index = lines.findIndex((line) => line.startsWith(prefix));
  lines[index] = mutate(lines[index]!);
  return lines.join('\n');
}

const CASES: readonly RefusalCase[] = [
  {
    id: 'unsupported-operation',
    expectedBlockingRules: ['kcode.footer-operation'],
    source: replaceFooter(regular, (line) => line.replace('Kn-Kn', 'No-No')),
  },
  {
    id: 'carrier-seven',
    expectedBlockingRules: ['kcode.footer-carrier'],
    source: replaceFooter(regular, (line) => line.replace(' 2 300 ', ' 7 300 ')),
  },
  {
    id: 'quarter-pitch-rack',
    expectedBlockingRules: ['kcode.invalid-rack'],
    source: regular.replace(
      '// KCode-native refusal fixture',
      '// KCode-native refusal fixture\nRACK:0.25',
    ),
  },
  {
    id: 'missing-carriage-marker',
    expectedBlockingRules: ['kcode.bed-markers'],
    source: replaceLine(regular, 'FRNT:', (line) => line.replace('/', '_')),
  },
  {
    id: 'padding-selection',
    expectedBlockingRules: ['kcode.bed-padding'],
    source: regular.replace('FRNT:.....', 'FRNT:...._'),
  },
  {
    id: 'stitch-selector-G',
    expectedBlockingRules: ['kcode.field-charset'],
    source: replaceLine(regular, 'STIF:', (line) => line.replace('6', 'G')),
  },
  {
    id: 'wrong-transfer-direction',
    expectedBlockingRules: ['machine-trace.transfer-operation-direction'],
    source: render([
      { rack: 0, direction: '>>', operation: 'Kn-Kn', carrier: '2', front: [100], rear: [] },
      { rack: 0, direction: '<<', operation: 'Tr-Rr', carrier: '0', front: [100], rear: [100] },
    ]),
  },
  {
    id: 'unpaired-transfer',
    expectedBlockingRules: ['machine-trace.unknown-action'],
    source: validTransfer.replace(/(REAR:[^\n]*?)-/, '$1_'),
  },
  {
    id: 'empty-transfer',
    expectedBlockingRules: ['machine-trace.unknown-action'],
    source: render([{
      rack: 0,
      direction: '>>',
      operation: 'Tr-Rr',
      carrier: '0',
      front: [],
      rear: [],
    }]),
  },
  {
    id: 'selection-outside-carrier',
    expectedBlockingRules: ['machine-trace.selection-outside-carrier'],
    source: render([{
      rack: 0,
      direction: '>>',
      operation: 'Kn-Kn',
      carrier: '2',
      front: [100],
      rear: [],
      carrierStops: { left: 110.5, right: 120.5 },
    }]),
  },
];

function evaluate(source: string): RefusalEvaluation {
  const parsed = parseKCodeDocument(source, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    dialect: 'knitout-vendor',
    strict: true,
  });
  if (!parsed.ok) {
    return {
      blockingRules: parsed.diagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .map((diagnostic) => diagnostic.rule),
      exportEligible: false,
      rejectionStage: 'parser',
    };
  }
  const trace = projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2);
  const validation = validateKCodeMachineTrace(trace, KNITERATE_7GG_KCODE_PROFILE_V2);
  return {
    blockingRules: validation.diagnostics
      .filter((diagnostic) => diagnostic.severity === 'error')
      .map((diagnostic) => diagnostic.rule),
    exportEligible: isKCodeCommandLegalityExportEligible({ parseOk: parsed.ok, validation }),
    rejectionStage: validation.ok ? 'none' : 'validator',
  };
}

export function collectKCodeCommandRefusalReport() {
  const results = CASES.map((testCase) => {
    const evaluation = evaluate(testCase.source);
    return {
      id: testCase.id,
      expectedBlockingRules: testCase.expectedBlockingRules,
      ...evaluation,
      exactRules: JSON.stringify(evaluation.blockingRules)
        === JSON.stringify(testCase.expectedBlockingRules),
      refusedExport: !evaluation.exportEligible,
    };
  });
  const noInvalidReachedExport = results.every((result) => result.refusedExport);
  const ok = noInvalidReachedExport && results.every((result) => result.exactRules);
  return {
    kind: 'kniterate-kcode-command-refusal-report',
    schemaVersion: 2,
    ok,
    caseCount: results.length,
    noInvalidReachedExport,
    results,
  } as const;
}

function main(): void {
  const report = collectKCodeCommandRefusalReport();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`KCode command refusals: ${report.results.filter((result) => result.exactRules && result.refusedExport).length}/${report.results.length} pinned${report.ok ? '' : ' - FAILED'}\n`);
    for (const result of report.results) {
      process.stdout.write(`  ${result.exactRules && result.refusedExport ? '✓' : '✗'} ${result.id} -> ${result.expectedBlockingRules.join(', ')} (${result.rejectionStage})\n`);
    }
  }
  if (!report.ok) process.exit(2);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) main();
