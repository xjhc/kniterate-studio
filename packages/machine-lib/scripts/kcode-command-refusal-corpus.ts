#!/usr/bin/env -S node --import tsx
/**
 * KCode-native refusal gate. Every case keeps one deliberate defect: command
 * cases break the command contract; machine-safety cases are otherwise clean
 * complete jobs that break the machine-safety envelope.
 */

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
import { validateKCodeMachineSafetyV1 } from '../src/knitout/kcode/machine-safety.js';
import { parseKCodeDocument } from '../src/knitout/kcode/parser.js';
import { isKCodeMachineExportEligible } from '../src/knitout/kcode/export-eligibility.js';

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
  speed?: number;
  roller?: number;
}

interface RefusalCase {
  id: string;
  expectedBlockingRules: readonly string[];
  source: string;
}

interface RefusalEvaluation {
  readonly blockingRules: readonly string[];
  readonly exportEligible: boolean;
  readonly rejectionStage: 'parser' | 'validator' | 'machine-safety' | 'none';
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
      `${pass.direction} ${pass.operation} ${pass.carrier} ${pass.speed ?? 300} ${pass.roller ?? 100}`,
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

// A clean complete job: carrier 3 leaves its home stop, knits front 100..103
// out and back, and returns home. Machine-safety cases each change one thing.
const knitOut: PassSpec = {
  rack: 0, direction: '>>', operation: 'Kn-Kn', carrier: '3', front: [100, 101, 102, 103], rear: [],
  carriageStops: { left: -9.5, right: 105.5 }, carrierStops: { left: -9.5, right: 105.5 },
};
const knitBack: PassSpec = {
  rack: 0, direction: '<<', operation: 'Kn-Kn', carrier: '3', front: [100, 101, 102, 103], rear: [],
  carriageStops: { left: 97.5, right: 105.5 }, carrierStops: { left: 97.5, right: 105.5 },
};
const goHome = (from: number, carriageRight = from): PassSpec => ({
  rack: 0, direction: '<<', operation: 'Tu-Tu', carrier: '3', front: [], rear: [],
  carriageStops: { left: -9.5, right: carriageRight }, carrierStops: { left: -9.5, right: from },
});
const carriageMove = (direction: KCodePassDirectionV1, left: number, right: number): PassSpec => ({
  rack: 0, direction, operation: 'Kn-Kn', carrier: '0', front: [], rear: [], carriageStops: { left, right },
});
const cleanJob = render([knitOut, knitBack, goHome(97.5)]);
const WIDE = Array.from({ length: 21 }, (_, index) => 90 + index);

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
  {
    id: 'facing-needles-at-rack-0',
    expectedBlockingRules: ['machine-safety.facing-needles'],
    source: render([{ ...knitOut, rear: [101] }, knitBack, goHome(97.5)]),
  },
  {
    id: 'needle-action-off-the-bed-at-rack-1',
    expectedBlockingRules: ['machine-safety.unsafe-bed-range'],
    source: render([
      { ...knitOut, rack: 1, front: [0, 1, 2, 3], carriageStops: { left: -9.5, right: 5.5 }, carrierStops: { left: -9.5, right: 5.5 } },
      { ...knitBack, rack: 1, front: [0, 1, 2, 3], carriageStops: { left: -2.5, right: 5.5 }, carrierStops: { left: -2.5, right: 5.5 } },
      { ...goHome(-2.5), rack: 1 },
    ]),
  },
  {
    id: 'idle-feeder-over-the-needles',
    expectedBlockingRules: ['machine-safety.feeder-clearance'],
    source: render([
      { ...knitOut, carrier: '4', front: [100], carriageStops: { left: -7.5, right: 102.5 }, carrierStops: { left: -7.5, right: 102.5 } },
      carriageMove('<<', -9.5, 102.5),
      knitOut,
      knitBack,
      goHome(97.5),
      carriageMove('>>', -9.5, 102.5),
      { ...goHome(102.5), carrier: '4', carrierStops: { left: -7.5, right: 102.5 } },
    ]),
  },
  {
    id: 'carriage-turns-inside-stopping-distance',
    expectedBlockingRules: ['machine-safety.stop-overrun'],
    source: render([
      { ...knitOut, carriageStops: { left: -9.5, right: 104.5 }, carrierStops: { left: -9.5, right: 104.5 } },
      { ...knitBack, carriageStops: { left: 97.5, right: 104.5 }, carrierStops: { left: 97.5, right: 104.5 } },
      goHome(97.5),
    ]),
  },
  {
    id: 'transfer-with-carrier',
    expectedBlockingRules: ['machine-safety.transfer-with-carrier'],
    source: render([knitOut, { ...knitBack, operation: 'Tr-Rl', front: [100], rear: [100] }, goHome(97.5)]),
  },
  {
    id: 'carrierless-tuck-pass',
    expectedBlockingRules: ['machine-safety.carrierless-tuck'],
    source: render([
      knitOut,
      knitBack,
      { ...carriageMove('>>', 97.5, 105.5), operation: 'Tu-Tu', front: [100] },
      goHome(97.5, 105.5),
    ]),
  },
  {
    id: 'carrier-starts-away-from-home',
    expectedBlockingRules: ['machine-safety.carrier-start'],
    source: render([
      { ...knitOut, carriageStops: { left: -5.5, right: 105.5 }, carrierStops: { left: -5.5, right: 105.5 } },
      knitBack,
      goHome(97.5),
    ]),
  },
  {
    id: 'carrier-driven-past-home',
    expectedBlockingRules: ['machine-safety.carrier-behind-home'],
    source: render([
      knitOut,
      knitBack,
      { ...goHome(97.5), carriageStops: { left: -11.5, right: 97.5 }, carrierStops: { left: -11.5, right: 97.5 } },
      { ...goHome(-9.5), direction: '>>', carriageStops: { left: -11.5, right: -9.5 }, carrierStops: { left: -11.5, right: -9.5 } },
    ]),
  },
  {
    id: 'carrier-left-on-the-bed',
    expectedBlockingRules: ['machine-safety.carrier-not-home'],
    source: render([knitOut, knitBack]),
  },
  {
    id: 'speed-below-machine-range',
    expectedBlockingRules: ['machine-safety.speed-range'],
    source: render([{ ...knitOut, speed: 5 }, knitBack, goHome(97.5)]),
  },
  {
    id: 'reversed-roller',
    expectedBlockingRules: ['machine-safety.roller-range'],
    source: render([{ ...knitOut, roller: -100 }, knitBack, goHome(97.5)]),
  },
  {
    id: 'knitting-without-takedown',
    expectedBlockingRules: ['machine-safety.takedown-gap'],
    source: render([
      { ...knitOut, roller: 0 },
      { ...knitBack, roller: 0 },
      { ...knitOut, roller: 0, carriageStops: { left: 97.5, right: 105.5 }, carrierStops: { left: 97.5, right: 105.5 } },
      { ...knitBack, roller: 0 },
      { ...knitOut, roller: 0, carriageStops: { left: 97.5, right: 105.5 }, carrierStops: { left: 97.5, right: 105.5 } },
      goHome(105.5),
    ]),
  },
  {
    id: 'stitch-size-too-small',
    expectedBlockingRules: ['machine-safety.stitch-too-small'],
    source: replaceLine(cleanJob, 'STIF:', (line) => `${line.slice(0, 5 + PADDING + 100)}1${line.slice(6 + PADDING + 100)}`),
  },
  {
    id: 'neighbouring-transfers-in-one-pass',
    expectedBlockingRules: ['machine-safety.adjacent-transfers'],
    source: render([
      knitOut,
      knitBack,
      { ...carriageMove('>>', 97.5, 105.5), operation: 'Tr-Rr', front: [100, 101], rear: [100, 101] },
      goHome(97.5, 105.5),
    ]),
  },
  {
    id: 'central-short-rows',
    expectedBlockingRules: ['machine-safety.central-short-rows'],
    source: render([
      { ...knitOut, front: WIDE, carriageStops: { left: -9.5, right: 112.5 }, carrierStops: { left: -9.5, right: 112.5 } },
      ...[0, 1, 2, 3, 4].map((row): PassSpec => ({
        ...knitBack,
        direction: row % 2 === 0 ? '<<' : '>>',
        front: [99, 100, 101],
        carriageStops: { left: 96.5, right: row === 0 ? 112.5 : 103.5 },
        carrierStops: { left: 96.5, right: row === 0 ? 112.5 : 103.5 },
      })),
      goHome(96.5),
    ]),
  },
  {
    id: 'three-tucks-on-a-needle',
    expectedBlockingRules: ['machine-safety.tuck-stack'],
    source: render([
      knitOut,
      { ...knitBack, operation: 'Tu-Tu' },
      { ...knitBack, operation: 'Tu-Tu', direction: '>>' },
      goHome(105.5),
    ]),
  },
  {
    id: 'knitting-under-a-yarn-taken-out-on-the-right',
    expectedBlockingRules: ['machine-safety.attached-yarn'],
    source: render([
      { ...knitOut, front: WIDE, carriageStops: { left: -9.5, right: 112.5 }, carrierStops: { left: -9.5, right: 112.5 } },
      goHome(112.5),
      { ...knitOut, carrier: '4', front: WIDE, carriageStops: { left: -9.5, right: 112.5 }, carrierStops: { left: -7.5, right: 112.5 } },
      { ...goHome(112.5), carrier: '4', carrierStops: { left: -7.5, right: 112.5 } },
    ]),
  },
  {
    id: 'fast-transfer',
    expectedBlockingRules: ['machine-safety.transfer-settings'],
    source: render([
      knitOut,
      knitBack,
      { ...carriageMove('>>', 97.5, 105.5), operation: 'Tr-Rr', front: [100], rear: [100], speed: 500 },
      goHome(97.5, 105.5),
    ]),
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
  const safety = validateKCodeMachineSafetyV1(trace, KNITERATE_7GG_KCODE_PROFILE_V2);
  const exportEligible = isKCodeMachineExportEligible({ parseOk: parsed.ok, validation, safety });
  if (!validation.ok) {
    return {
      blockingRules: validation.diagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .map((diagnostic) => diagnostic.rule),
      exportEligible,
      rejectionStage: 'validator',
    };
  }
  return {
    // One defect may repeat across passes; name each blocking rule once.
    blockingRules: [...new Set(safety.diagnostics.map((diagnostic) => diagnostic.rule))],
    exportEligible,
    rejectionStage: safety.ok ? 'none' : 'machine-safety',
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
  const cleanBaseline = evaluate(cleanJob);
  const cleanBaselineExportEligible = cleanBaseline.exportEligible && cleanBaseline.blockingRules.length === 0;
  const ok = noInvalidReachedExport && cleanBaselineExportEligible && results.every((result) => result.exactRules);
  return {
    kind: 'kniterate-kcode-command-refusal-report',
    schemaVersion: 3,
    ok,
    caseCount: results.length,
    noInvalidReachedExport,
    cleanBaselineExportEligible,
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
