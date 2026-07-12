/**
 * Reference-.kc parity harness. Drives the cases declared in
 * `manifest.ts`:
 *
 *   - engine-compare: build knitout via the engine entry point,
 *     run it through the vendor (`knitoutToKCode`), then gate each
 *     declared section against the captured reference fixture.
 *   - parse-only: load the reference and confirm `parseKcPasses`
 *     yields at least the expected minimum count.
 *
 * Phase 0 exit criterion: a `pnpm test:reference-kc` invocation runs
 * this file and passes.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { parseKcPasses } from '../../../src/knitout/sim/kc-parse.js';
import {
  extractKcSection,
  type KcSection,
} from '../../../src/knitout/sim/kc-section.js';
import { knitoutToKCode } from '../../../src/knitout/kniterate/to-kcode.js';

import {
  firstLineDelta,
  firstStructuralPassDelta,
  passStructureFingerprint,
  renderByteDiff,
  renderPassStructureDiff,
} from './diagnostics.js';
import { REFERENCE_KC_CASES } from './manifest.js';
import type {
  EngineCompareCase,
  ReferenceKcCase,
  ReferenceKcGate,
} from './manifest-types.js';

function loadReference(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf-8');
}

function findSection(
  kcCase: EngineCompareCase,
  sectionId: string,
): EngineCompareCase['sections'][number] {
  const section = kcCase.sections.find(s => s.id === sectionId);
  if (!section) {
    throw new Error(
      `Manifest error: case "${kcCase.id}" gate references unknown section "${sectionId}"`,
    );
  }
  return section;
}

function gateLabel(gate: ReferenceKcGate): string {
  switch (gate.kind) {
    case 'section-byte-identical':
      return `byte-identical [${gate.section}]`;
    case 'pass-structure':
      return `pass-structure [${gate.section}]`;
    case 'section-fingerprint':
      return `fingerprint [${gate.section}]`;
    case 'max-pass-delta':
      return `max-pass-delta(${gate.max}) [${gate.section}]`;
  }
}

describe.each(REFERENCE_KC_CASES as readonly ReferenceKcCase[])(
  'reference-kc parity: $id',
  (kcCase: ReferenceKcCase) => {
    if (kcCase.kind === 'parse-only') {
      it('parses the reference file without error', () => {
        const text = loadReference(kcCase.referencePath);
        const passes = parseKcPasses(text);
        expect(passes.length).toBeGreaterThanOrEqual(kcCase.minPasses);
      });
      return;
    }

    // engine-compare: produce kc once per case, then run each gate.
    let referenceText = '';
    let generatedText = '';

    beforeAll(() => {
      referenceText = loadReference(kcCase.referencePath);
      const knitout = kcCase.buildKnitout();
      const result = knitoutToKCode(knitout);
      if (!result.ok) {
        throw new Error(
          `vendor knitoutToKCode failed for case "${kcCase.id}":\n${result.stderr}`,
        );
      }
      generatedText = result.kcode ?? '';
      if (!generatedText) {
        throw new Error(`vendor produced empty kc for case "${kcCase.id}"`);
      }
    });

    for (const gate of kcCase.gates) {
      it(gateLabel(gate), () => {
        const section = findSection(kcCase, gate.section);
        const refSection = extractKcSection(referenceText, section.anchor);
        const genSection = extractKcSection(generatedText, section.anchor);
        runGate(gate, genSection, refSection);
      });
    }
  },
);

function runGate(
  gate: ReferenceKcGate,
  generated: KcSection,
  reference: KcSection,
): void {
  switch (gate.kind) {
    case 'section-byte-identical': {
      if (generated.text === reference.text) return;
      const delta = firstLineDelta(generated.text, reference.text);
      if (!delta) {
        throw new Error(
          'byte-identical gate failed but firstLineDelta returned null (text mismatch with no detectable line delta — likely line-ending differences)',
        );
      }
      throw new Error(
        `byte-identical mismatch in section "${gate.section}"\n` +
          renderByteDiff(generated.text, reference.text, delta, reference.lineStart),
      );
    }
    case 'pass-structure': {
      const firstDelta = firstStructuralPassDelta(
        generated.passes,
        reference.passes,
      );
      if (firstDelta === null) return;
      throw new Error(
        `pass-structure mismatch in section "${gate.section}"\n` +
          renderPassStructureDiff(generated.passes, reference.passes, firstDelta),
      );
    }
    case 'section-fingerprint': {
      const g = passStructureFingerprint(generated.passes);
      const r = passStructureFingerprint(reference.passes);
      if (g === r) return;
      const firstDelta = firstStructuralPassDelta(
        generated.passes,
        reference.passes,
      );
      throw new Error(
        `fingerprint mismatch in section "${gate.section}"\n` +
          (firstDelta !== null
            ? renderPassStructureDiff(generated.passes, reference.passes, firstDelta)
            : `(passes equal-length but tuple-different — should not happen)`),
      );
    }
    case 'max-pass-delta': {
      const delta = Math.abs(generated.passes.length - reference.passes.length);
      if (delta <= gate.max) return;
      throw new Error(
        `pass-count delta ${delta} exceeds max ${gate.max} in section "${gate.section}"\n` +
          `  generated: ${generated.passes.length} passes\n` +
          `  reference: ${reference.passes.length} passes\n` +
          `  waiver: ${gate.waiver.id} — ${gate.waiver.reason}\n` +
          `  expires when: ${gate.waiver.expiresWhen}`,
      );
    }
  }
}
