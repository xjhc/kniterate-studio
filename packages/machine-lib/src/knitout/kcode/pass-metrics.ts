import type { MachineTracePassV1, MachineTraceV1 } from './machine-trace.js'

export interface MachineTracePassMetricsV1 {
  readonly schemaVersion: 1
  /** Every executable pass in the strict KCode trace. */
  readonly programmedPassCount: number
  /**
   * Passes containing at least one loop-forming action. This is deliberately
   * not called a row: foreign KCode does not retain authored row provenance.
   */
  readonly loopFormingPassCount: number
}

export function isLoopFormingMachineTracePassV1(
  pass: Pick<MachineTracePassV1, 'actions'>,
): boolean {
  return pass.actions.some((action) =>
    action.kind === 'knit'
    || action.kind === 'tuck'
    || action.kind === 'split')
}

export function summarizeMachineTracePassMetricsV1(
  trace: Pick<MachineTraceV1, 'passes'>,
): MachineTracePassMetricsV1 {
  let loopFormingPassCount = 0
  for (const pass of trace.passes) {
    if (isLoopFormingMachineTracePassV1(pass)) loopFormingPassCount += 1
  }
  return {
    schemaVersion: 1,
    programmedPassCount: trace.passes.length,
    loopFormingPassCount,
  }
}

/**
 * What one strict-trace pass does, derived only from its decoded actions.
 * Selection-free passes are split by footer carrier: a carrier-only pass
 * repositions yarn (a kickback in the official editor's vocabulary), while a
 * carrier-0 pass only moves the carriage. KCode itself does not record whether
 * a compiler inserted the pass or a source program requested it.
 */
export type MachineTracePassRoleV1 =
  | 'loop-forming'
  | 'transfer'
  | 'drop'
  | 'carrier-move'
  | 'carriage-move'
  | 'unclassified'

export const MACHINE_TRACE_PASS_ROLES_V1: readonly MachineTracePassRoleV1[] = [
  'loop-forming',
  'transfer',
  'drop',
  'carrier-move',
  'carriage-move',
  'unclassified',
]

export function classifyMachineTracePassRoleV1(
  pass: Pick<MachineTracePassV1, 'actions' | 'carrier'>,
): MachineTracePassRoleV1 {
  if (pass.actions.some((action) => action.kind === 'unknown')) return 'unclassified'
  if (isLoopFormingMachineTracePassV1(pass)) return 'loop-forming'
  if (pass.actions.some((action) => action.kind === 'xfer')) return 'transfer'
  if (pass.actions.some((action) => action.kind === 'drop')) return 'drop'
  if (pass.actions.some((action) => action.kind === 'move')) {
    return pass.carrier === '0' ? 'carriage-move' : 'carrier-move'
  }
  return 'unclassified'
}

export function summarizeMachineTracePassRolesV1(
  trace: Pick<MachineTraceV1, 'passes'>,
): Readonly<Record<MachineTracePassRoleV1, number>> {
  const counts: Record<MachineTracePassRoleV1, number> = {
    'loop-forming': 0,
    transfer: 0,
    drop: 0,
    'carrier-move': 0,
    'carriage-move': 0,
    unclassified: 0,
  }
  for (const pass of trace.passes) counts[classifyMachineTracePassRoleV1(pass)] += 1
  return counts
}
