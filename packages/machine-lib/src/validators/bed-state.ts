/**
 * B1.0 bed-state validator — wraps the simulator's invariant violations
 * as ValidationMessages so they sit alongside the chart-level and
 * op-level validation surfaces (see chart-track-a.ts and
 * knitout-program.ts respectively).
 *
 * Severity is 'error' — these are physical-machine invariants. If a
 * plan fails any of them, the .k will jam or knock loops on the real
 * machine. No way to handle this with a warning.
 */

import {
  simulateBedStates,
  type BedStateError,
  type BedStateRule,
  type FloatPolicy,
} from '../knitout/plan/bed-state.js';
import type { KniteratePlan } from '../knitout/plan/types.js';
import type { ValidationMessage } from './knitout-program.js';

export interface BedStateValidationReport {
  ok: boolean;
  errorCount: number;
  messages: ValidationMessage[];
}

export interface ValidateBedStateOptions {
  /** Per-recipe float ceiling policy. Forwarded to `simulateBedStates`.
   *  When undefined the simulator's default (warn-above-5) applies. */
  floatPolicy?: FloatPolicy;
}

export function validateBedState(
  plan: KniteratePlan,
  options: ValidateBedStateOptions = {},
): BedStateValidationReport {
  const trace = simulateBedStates(plan, { floatPolicy: options.floatPolicy });
  const messages: ValidationMessage[] = trace.errors.map(toMessage);
  const errorCount = messages.filter(m => m.severity === 'error').length;
  return {
    ok: errorCount === 0,
    errorCount,
    messages,
  };
}

function toMessage(err: BedStateError): ValidationMessage {
  return {
    severity: err.severity ?? 'error',
    rule: ruleId(err.rule),
    message: `[pass ${err.passIndex}, op ${err.opIndex}] ${err.message}`,
  };
}

function ruleId(r: BedStateRule): string {
  switch (r) {
    case 'xfer-from-empty':
      return 'bed-state-xfer-from-empty';
    case 'too-many-loops':
      return 'bed-state-too-many-loops';
    case 'invalid-rack':
      return 'bed-state-invalid-rack';
    case 'xfer-rack-misalignment':
      return 'bed-state-xfer-rack-misalignment';
    case 'xfer-same-bed':
      return 'bed-state-xfer-same-bed';
    case 'carrier-not-active':
      return 'bed-state-carrier-not-active';
    case 'knit-without-carrier':
      return 'bed-state-knit-without-carrier';
    case 'in-carrier-already-active':
      return 'bed-state-in-carrier-already-active';
    case 'out-carrier-not-active':
      return 'bed-state-out-carrier-not-active';
    case 'adjacent-xfer-same-pass':
      return 'bed-state-adjacent-xfer-same-pass';
    case 'long-float':
      return 'bed-state-long-float';
  }
}
