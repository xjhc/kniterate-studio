import type { KCodeCarrierToken } from './machine-profile.js'
import type { MachineTraceBedV1, MachineTracePassV1, MachineTraceV1 } from './machine-trace.js'

/**
 * Per-bed stitch grids projected from an exact strict-KCode trace.
 *
 * Each column is one needle; its cells are the carriers of the `knit` actions
 * formed on that needle, bottom-up, inside the requested window. An explicit
 * window is preferred. Without one, projection starts at the first non-waste
 * knit after the last draw-thread knit; this does not distinguish cast-on from
 * design. Needle spacing alone is never evidence for skipping a pass.
 * Only explicitly named waste-carrier passes are excluded.
 *
 * This is a software projection of programmed loop formation under the
 * empty-bed trace, used to compare and recover colorwork. It ignores tucks,
 * splits, and transfers (so it does not follow loops that change needle or
 * bed), and it does not establish stitch geometry or fabric appearance.
 */
export interface KnittedFaceRolesV1 {
  readonly drawCarrier: Exclude<KCodeCarrierToken, '0'> | null
  /** Unknown/omitted means no carrier is excluded as waste. */
  readonly wasteCarrier?: Exclude<KCodeCarrierToken, '0'> | null
  /** Explicit inclusive pass boundary; must be justified by the caller. */
  readonly bodyStartPassIndex?: number
  /** Explicit exclusive pass boundary; defaults to the end of the program. */
  readonly bodyEndPassIndexExclusive?: number
}

export interface KnittedFaceV1 {
  readonly bed: MachineTraceBedV1
  /** Trace coordinate of the leftmost column, or null when the face is empty. */
  readonly firstCoordinate: number | null
  /**
   * Per-needle knit counts, bottom-up, not authored course numbers. Every
   * coordinate from first to last is retained; ' ' means no knit at that
   * count, including a needle never knitted inside the requested window.
   */
  readonly rows: readonly string[]
}

export interface KnittedFacesV1 {
  readonly schemaVersion: 1
  readonly wasteCarrier: KCodeCarrierToken | null
  readonly bodyStartPassIndex: number | null
  readonly bodyEndPassIndexExclusive: number
  readonly boundary: 'explicit' | 'after-last-draw' | 'first-knit' | 'empty'
  readonly limitations: readonly string[]
  readonly front: KnittedFaceV1
  readonly rear: KnittedFaceV1
}

function knitCoordinates(pass: MachineTracePassV1, bed: MachineTraceBedV1): number[] {
  const coordinates: number[] = []
  for (const action of pass.actions) {
    if (action.kind === 'knit' && action.at.bed === bed) coordinates.push(action.at.traceCoordinate)
  }
  return coordinates.sort((left, right) => left - right)
}

function projectFace(
  trace: Pick<MachineTraceV1, 'passes'>,
  bed: MachineTraceBedV1,
  bodyStart: number | null,
  bodyEnd: number,
  wasteCarrier: KCodeCarrierToken | null,
): KnittedFaceV1 {
  const columns = new Map<number, string[]>()
  if (bodyStart !== null) {
    for (let index = bodyStart; index < bodyEnd; index += 1) {
      const pass = trace.passes[index]!
      if (pass.carrier === wasteCarrier) continue
      for (const coordinate of knitCoordinates(pass, bed)) {
        const column = columns.get(coordinate)
        if (column) column.push(pass.carrier)
        else columns.set(coordinate, [pass.carrier])
      }
    }
  }
  const occupied = [...columns.keys()].sort((left, right) => left - right)
  const firstCoordinate = occupied[0] ?? null
  const width = firstCoordinate === null ? 0 : occupied[occupied.length - 1]! - firstCoordinate + 1
  const height = occupied.reduce((max, coordinate) => Math.max(max, columns.get(coordinate)!.length), 0)
  return {
    bed,
    firstCoordinate,
    rows: Array.from({ length: height }, (_, row) =>
      Array.from({ length: width }, (_, column) => columns.get(firstCoordinate! + column)?.[row] ?? ' ').join('')),
  }
}

export function projectKnittedFacesV1(
  trace: Pick<MachineTraceV1, 'passes'>,
  roles: KnittedFaceRolesV1,
): KnittedFacesV1 {
  const wasteCarrier = roles.wasteCarrier ?? null
  const bodyEnd = roles.bodyEndPassIndexExclusive ?? trace.passes.length
  for (const [name, value] of [
    ['bodyStartPassIndex', roles.bodyStartPassIndex],
    ['bodyEndPassIndexExclusive', bodyEnd],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > trace.passes.length)) {
      throw new RangeError(`${name} must be a pass boundary within the trace`)
    }
  }
  if (roles.bodyStartPassIndex !== undefined && roles.bodyStartPassIndex > bodyEnd) {
    throw new RangeError('bodyStartPassIndex must not exceed bodyEndPassIndexExclusive')
  }
  let lastDraw = -1
  if (roles.bodyStartPassIndex === undefined && roles.drawCarrier !== null) {
    trace.passes.forEach((pass, index) => {
      if (index < bodyEnd && pass.carrier === roles.drawCarrier && pass.actions.some((action) => action.kind === 'knit')) lastDraw = index
    })
  }
  const start = trace.passes.findIndex((pass, index) => {
    if (index <= lastDraw || index >= bodyEnd || pass.carrier === wasteCarrier) return false
    return pass.actions.some((action) => action.kind === 'knit')
  })
  const bodyStart = roles.bodyStartPassIndex ?? (start < 0 ? null : start)
  const boundary = roles.bodyStartPassIndex !== undefined ? 'explicit'
    : bodyStart === null ? 'empty' : lastDraw >= 0 ? 'after-last-draw' : 'first-knit'
  const limitations = [
    'Rows count knit actions separately on each needle; held stitches do not establish shared authored courses.',
    'Tucks, splits, transfers, and drops are not replayed; this is not loop topology or fabric appearance.',
  ]
  if (roles.bodyStartPassIndex === undefined) limitations.push('The inferred window can include cast-on and finish; an explicit body boundary is required to exclude them.')
  return {
    schemaVersion: 1,
    wasteCarrier,
    bodyStartPassIndex: bodyStart,
    bodyEndPassIndexExclusive: bodyEnd,
    boundary,
    limitations,
    front: projectFace(trace, 'front', bodyStart, bodyEnd, wasteCarrier),
    rear: projectFace(trace, 'rear', bodyStart, bodyEnd, wasteCarrier),
  }
}

export interface RecoveredColorworkV1 {
  readonly width: number
  readonly height: number
  /** Distinct carriers in ascending token order; cell values index this list. */
  readonly carriers: readonly string[]
  /** Top-down rows, matching ColorworkChartV1 cell order. */
  readonly cells: readonly (readonly number[])[]
  /** Leading/trailing partial rows (typically bind-off) that were dropped. */
  readonly droppedPartialRows: number
}

/**
 * Recover a rectangular carrier grid. Refuse partial rows by default; callers
 * can explicitly trim edge rows, but interior holes are never discarded.
 * Per-needle knit counts still do not prove original authored course order.
 */
export function recoverColorworkFromFrontFaceV1(
  face: KnittedFaceV1,
  options: { readonly trimEdgePartialRows?: boolean } = {},
): RecoveredColorworkV1 | null {
  let start = 0
  let end = face.rows.length
  if (options.trimEdgePartialRows) {
    while (start < end && face.rows[start]!.includes(' ')) start += 1
    while (end > start && face.rows[end - 1]!.includes(' ')) end -= 1
  }
  const complete = face.rows.slice(start, end)
  const width = complete[0]?.length ?? 0
  if (width === 0 || complete.some((row) => row.length !== width || !/^[1-6]+$/.test(row))) return null
  const carriers = [...new Set(complete.join(''))].sort()
  return {
    width: complete[0]!.length,
    height: complete.length,
    carriers,
    cells: [...complete].reverse().map((row) => [...row].map((carrier) => carriers.indexOf(carrier))),
    droppedPartialRows: face.rows.length - complete.length,
  }
}

export interface FaceRowComparisonV1 {
  /** Relative row equality under the carrier map; firstCoordinate is not compared. */
  readonly identical: boolean
  /** Rows of `expected` found equal at the best vertical offset, after carrier relabeling. */
  readonly matchingRows: number
  readonly expectedRows: number
  readonly actualRows: number
  readonly offset: number
}

/**
 * Compare two faces row by row under a carrier bijection fixed by `carrierMap`
 * (expected token → actual token), searching a small vertical offset window
 * for frame-length differences. `identical` requires equal row counts and
 * offset zero. This is relative face comparison, not a placement comparison.
 */
export function compareKnittedFaceRowsV1(
  expected: KnittedFaceV1,
  actual: KnittedFaceV1,
  carrierMap: ReadonlyMap<string, string>,
  maxOffset = 4,
): FaceRowComparisonV1 {
  if (!Number.isSafeInteger(maxOffset) || maxOffset < 0) throw new RangeError('maxOffset must be a nonnegative safe integer')
  const mapped = expected.rows.map((row) => [...row].map((carrier) => carrierMap.get(carrier) ?? carrier).join(''))
  let best = { matchingRows: 0, offset: 0 }
  for (let offset = -maxOffset; offset <= maxOffset; offset += 1) {
    let matchingRows = 0
    mapped.forEach((row, index) => { if (actual.rows[index + offset] === row) matchingRows += 1 })
    if (matchingRows > best.matchingRows
      || (matchingRows === best.matchingRows && Math.abs(offset) < Math.abs(best.offset))) best = { matchingRows, offset }
  }
  return {
    ...best,
    identical: best.offset === 0 && best.matchingRows === expected.rows.length && expected.rows.length === actual.rows.length,
    expectedRows: expected.rows.length,
    actualRows: actual.rows.length,
  }
}
