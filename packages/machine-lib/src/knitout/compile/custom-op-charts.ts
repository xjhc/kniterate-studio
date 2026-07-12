/**
 * Custom-op symbol-key dispatch.
 *
 * The data-driven generalization of "map a symbol key to a custom
 * operation": a registry of entries, each binding a marker palette key
 * to a chart-compile function that emits its own machine choreography
 * instead of going through the stockinette walker. A chart painted with
 * one of these keys is the whole design (no background fabric).
 *
 * Today's entries are built-in (i-cord, shaped tube). The wizard's
 * "map symbol → custom op" surface adds/edits entries on top of these.
 *
 * `compileChartToKnitout` calls `dispatchCustomOpChart` first; if a
 * registered key is present, that route owns the compile.
 */

import {
  KEY_ID_ICORD,
  KEY_ID_TUBE_KNIT,
  KEY_ID_SOPHIE_LEAF,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../colorwork/knitlab1-contract.js';
import type { KniterateExtensionHeaders, KnitoutProgram, YarnBinding } from '../types.js';
import type { CarrierId } from '../types.js';
import type { ValidationMessage } from '../../validators/knitout-program.js';
import { chartIsICord, compileICordChartToKnitout } from './icord-chart.js';
import { chartIsTube, compileTubeChartToKnitout } from './tube-chart.js';
import { chartIsSophieLeaf, compileSophieLeafChart } from './sophie-leaf-chart.js';

export interface CustomOpChartInput {
  chart: KnitlabChartState;
  keyPalette: KnitlabKeyDefinition[];
  /** Per-key yarn bindings; the custom op knits on ITS key's carrier. */
  yarnBindings?: YarnBinding[];
  /** Machine settings (stitch number / speed / roller) from the wizard. */
  kniterate?: Partial<KniterateExtensionHeaders>;
  carrier?: CarrierId;
  knitSpeed?: number;
  knitRoller?: number;
  xferSpeed?: number;
  stitchNumber?: number;
  needleOffset?: number;
  gauge?: number;
}

export interface CustomOpChartResult {
  ok: boolean;
  program?: KnitoutProgram;
  /**
   * Direct Kniterate `.kc` text, for custom ops whose faithful technique the
   * knitout→vendor lowering can't preserve (the vendor re-schedules transfers,
   * which breaks sequential transport walks). When present, the export pipeline
   * packages this verbatim instead of running a program through
   * `knitout-to-kcode`. In practice mutually exclusive with `program` — an op
   * emits one or the other. See docs/sophie-leaf-fidelity.md.
   */
  kcText?: string;
  messages: ValidationMessage[];
}

export interface CustomOpChartEntry {
  /** Stable id of the custom operation. */
  id: string;
  /** Palette key this entry owns; its binding picks the knitting carrier. */
  keyId: string;
  /** True when this chart should be compiled by this entry. */
  detect: (chart: KnitlabChartState, keyPalette: readonly KnitlabKeyDefinition[]) => boolean;
  /** Emit the program for this chart. */
  compile: (input: CustomOpChartInput) => CustomOpChartResult;
}

const REGISTRY: CustomOpChartEntry[] = [
  {
    id: 'i-cord',
    keyId: KEY_ID_ICORD,
    detect: chartIsICord,
    compile: (input) => {
      const r = compileICordChartToKnitout(input);
      return { ok: r.ok, ...(r.program ? { program: r.program } : {}), messages: r.messages };
    },
  },
  {
    id: 'shaped-tube',
    keyId: KEY_ID_TUBE_KNIT,
    detect: chartIsTube,
    compile: (input) => {
      const r = compileTubeChartToKnitout(input);
      return { ok: r.ok, ...(r.program ? { program: r.program } : {}), messages: r.messages };
    },
  },
  {
    // Faithful Sophie leaf — emits direct `.kc` (no vendor lowering); see
    // sophie-leaf-chart.ts + docs/sophie-leaf-fidelity.md.
    id: 'sophie-leaf',
    keyId: KEY_ID_SOPHIE_LEAF,
    detect: chartIsSophieLeaf,
    compile: (input) => {
      const r = compileSophieLeafChart({
        chart: input.chart,
        keyPalette: input.keyPalette,
        ...(input.needleOffset !== undefined ? { needleOffset: input.needleOffset } : {}),
        ...(input.stitchNumber !== undefined ? { stitchNumber: input.stitchNumber } : {}),
      });
      return { ok: r.ok, ...(r.kcText !== undefined ? { kcText: r.kcText } : {}), messages: r.messages };
    },
  },
];

/** Registered custom-op kinds (for introspection / wizard listing). */
export function customOpChartKinds(): readonly string[] {
  return REGISTRY.map(e => e.id);
}

/** Dispatch a chart to its custom-op route, or null if none matches. */
export function dispatchCustomOpChart(input: CustomOpChartInput): CustomOpChartResult | null {
  // A custom-op chart IS one custom operation — the painted op owns the
  // whole chart (there is no background fabric to host a second one). Two
  // different custom-op symbols in one chart is ambiguous; reject it loudly
  // instead of silently compiling whichever the registry lists first.
  const matches = REGISTRY.filter(e => e.detect(input.chart, input.keyPalette));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    return {
      ok: false,
      messages: [{
        severity: 'error',
        rule: 'custom-op-ambiguous',
        message: `Chart mixes multiple custom-op symbols (${matches.map(m => m.id).join(', ')}); a custom-op chart must use exactly one.`,
      }],
    };
  }
  {
    const entry = matches[0]!;
    // Knit on the carrier bound to THIS op's key (not yarnBindings[0],
    // which for a generated chart is the background `key_knit_default`).
    // Fall back to the first binding for single-yarn callers.
    const carrier =
      input.carrier ??
      input.yarnBindings?.find(b => b.keyId === entry.keyId)?.carrier ??
      input.yarnBindings?.[0]?.carrier;
    // Honour the wizard's machine settings; explicit per-call values win.
    const k = input.kniterate;
    const knitSpeed = input.knitSpeed ?? k?.speedNumber;
    const knitRoller = input.knitRoller ?? k?.rollerAdvance;
    const stitchNumber = input.stitchNumber ?? k?.stitchNumber;
    const compileInput: CustomOpChartInput = {
      ...input,
      ...(carrier !== undefined ? { carrier } : {}),
      ...(knitSpeed !== undefined ? { knitSpeed } : {}),
      ...(knitRoller !== undefined ? { knitRoller } : {}),
      ...(stitchNumber !== undefined ? { stitchNumber } : {}),
    };
    return entry.compile(compileInput);
  }
}
