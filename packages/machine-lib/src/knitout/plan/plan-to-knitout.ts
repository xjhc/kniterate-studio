/**
 * KniteratePlan → KnitoutProgram. Pure flattening: take per-pass op
 * groupings off the plan and stitch them into a single op stream, plus
 * derive the program-level header bag from the plan's carrier
 * assignments.
 *
 * Byte-identical to Track A's pre-refactor compileChartToKnitout output;
 * gated by plan-roundtrip.test.ts.
 */

import {
  type CarrierId,
  type KnitoutOp,
  type KnitoutProgram,
  type KniterateExtensionHeaders,
  type YarnBinding,
} from '../types.js';
import type { KniteratePlan } from './types.js';

export function compilePlanToKnitout(plan: KniteratePlan): KnitoutProgram {
  const ops: KnitoutOp[] = [];
  for (const pass of plan.passes) {
    for (const op of pass.ops) ops.push(op);
  }

  // Build the yarn header bag: keyId → carrier → name. Only pattern
  // carriers get ;;Yarn-N: headers; waste/draw are positional.
  const yarns: Partial<Record<CarrierId, string>> = {};
  for (const c of plan.carriers) {
    if (c.role === 'pattern' && c.yarnName !== undefined) {
      yarns[c.carrier] = c.yarnName;
    }
  }

  const kniterate: KniterateExtensionHeaders = {
    rollerAdvance: plan.settings.rollerAdvance,
    stitchNumber: plan.settings.stitchNumber,
    xferStitchNumber: plan.settings.xferStitchNumber,
    speedNumber: plan.settings.speedNumber,
    carrierSpacing: plan.settings.carrierSpacing,
    carrierStoppingDistance: plan.settings.carrierStoppingDistance,
    xferStyle: plan.settings.xferStyle,
  };

  return {
    version: 2,
    carriers: ['1', '2', '3', '4', '5', '6'],
    machine: 'kniterate',
    gauge: plan.settings.gauge,
    position: plan.settings.position,
    yarns,
    kniterate,
    ops,
  };
}

/** Re-export Plan-shaped binding view as a Map (for legacy consumers that
 *  expect Maps). New consumers should read plan.yarnBindings directly. */
export function planYarnBindingsAsList(plan: KniteratePlan): YarnBinding[] {
  return Object.values(plan.yarnBindings);
}
