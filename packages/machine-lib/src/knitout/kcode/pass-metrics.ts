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
