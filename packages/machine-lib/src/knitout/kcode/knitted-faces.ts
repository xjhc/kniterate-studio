import type { KCodeCarrierToken } from './machine-profile.js'
import type { MachineTraceBedV1, MachineTracePassV1, MachineTraceV1 } from './machine-trace.js'

/**
 * Per-bed stitch grids projected from an exact strict-KCode trace.
 *
 * Each column is one needle; its cells are the carriers of the `knit` actions
 * formed on that needle, bottom-up, inside the body window. The body window
 * starts after the last draw-thread knit and at the first non-waste pass whose
 * front knits are not an alternate-needle (1x1 / zig-zag) cast-on, which would
 * otherwise give every other needle an extra bottom loop. Waste-carrier passes
 * are excluded throughout.
 *
 * This is a software projection of programmed loop formation under the
 * empty-bed trace, used to compare and recover colorwork. It ignores tucks,
 * splits, and transfers (so it does not follow loops that change needle or
 * bed), and it does not establish stitch geometry or fabric appearance.
 */
export interface KnittedFaceRolesV1 {
  readonly drawCarrier: Exclude<KCodeCarrierToken, '0'> | null
  /** Defaults to the carrier of the first knitting pass. */
  readonly wasteCarrier?: Exclude<KCodeCarrierToken, '0'>
}

export interface KnittedFaceV1 {
  readonly bed: MachineTraceBedV1
  /** Trace coordinate of the leftmost column, or null when the face is empty. */
  readonly firstCoordinate: number | null
  /** Bottom-up rows; each character is a carrier token, or ' ' where the needle has fewer loops. */
  readonly rows: readonly string[]
}

export interface KnittedFacesV1 {
  readonly schemaVersion: 1
  readonly wasteCarrier: KCodeCarrierToken | null
  readonly bodyStartPassIndex: number | null
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

function isAlternateNeedleSet(coordinates: readonly number[]): boolean {
  return coordinates.length >= 2
    && coordinates.every((coordinate, index) => index === 0 || coordinate - coordinates[index - 1]! === 2)
}

function projectFace(
  trace: Pick<MachineTraceV1, 'passes'>,
  bed: MachineTraceBedV1,
  bodyStart: number | null,
  wasteCarrier: KCodeCarrierToken | null,
): KnittedFaceV1 {
  const columns = new Map<number, string[]>()
  if (bodyStart !== null) {
    for (let index = bodyStart; index < trace.passes.length; index += 1) {
      const pass = trace.passes[index]!
      if (pass.carrier === wasteCarrier) continue
      for (const coordinate of knitCoordinates(pass, bed)) {
        const column = columns.get(coordinate)
        if (column) column.push(pass.carrier)
        else columns.set(coordinate, [pass.carrier])
      }
    }
  }
  const coordinates = [...columns.keys()].sort((left, right) => left - right)
  const height = coordinates.reduce((max, coordinate) => Math.max(max, columns.get(coordinate)!.length), 0)
  return {
    bed,
    firstCoordinate: coordinates[0] ?? null,
    rows: Array.from({ length: height }, (_, row) =>
      coordinates.map((coordinate) => columns.get(coordinate)![row] ?? ' ').join('')),
  }
}

export function projectKnittedFacesV1(
  trace: Pick<MachineTraceV1, 'passes'>,
  roles: KnittedFaceRolesV1,
): KnittedFacesV1 {
  const wasteCarrier = roles.wasteCarrier
    ?? trace.passes.find((pass) => knitCoordinates(pass, 'front').length > 0 || knitCoordinates(pass, 'rear').length > 0)?.carrier
    ?? null
  let lastDraw = -1
  if (roles.drawCarrier !== null) {
    trace.passes.forEach((pass, index) => {
      if (pass.carrier === roles.drawCarrier && pass.actions.some((action) => action.kind === 'knit')) lastDraw = index
    })
  }
  const start = trace.passes.findIndex((pass, index) => {
    if (index <= lastDraw || pass.carrier === wasteCarrier) return false
    const front = knitCoordinates(pass, 'front')
    return front.length > 0 && !isAlternateNeedleSet(front)
  })
  const bodyStart = start < 0 ? null : start
  return {
    schemaVersion: 1,
    wasteCarrier,
    bodyStartPassIndex: bodyStart,
    front: projectFace(trace, 'front', bodyStart, wasteCarrier),
    rear: projectFace(trace, 'rear', bodyStart, wasteCarrier),
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

/** Recover a carrier colorwork chart from the complete rows of a front face. */
export function recoverColorworkFromFrontFaceV1(face: KnittedFaceV1): RecoveredColorworkV1 | null {
  const complete = face.rows.filter((row) => !row.includes(' '))
  if (complete.length === 0) return null
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
  /** Rows of `expected` found equal at the best vertical offset, after carrier relabeling. */
  readonly matchingRows: number
  readonly expectedRows: number
  readonly actualRows: number
  readonly offset: number
}

/**
 * Compare two faces row by row under a carrier bijection fixed by `carrierMap`
 * (expected token → actual token), searching a small vertical offset window
 * for frame-length differences.
 */
export function compareKnittedFaceRowsV1(
  expected: KnittedFaceV1,
  actual: KnittedFaceV1,
  carrierMap: ReadonlyMap<string, string>,
  maxOffset = 4,
): FaceRowComparisonV1 {
  const mapped = expected.rows.map((row) => [...row].map((carrier) => carrierMap.get(carrier) ?? carrier).join(''))
  let best = { matchingRows: 0, offset: 0 }
  for (let offset = -maxOffset; offset <= maxOffset; offset += 1) {
    let matchingRows = 0
    mapped.forEach((row, index) => { if (actual.rows[index + offset] === row) matchingRows += 1 })
    if (matchingRows > best.matchingRows) best = { matchingRows, offset }
  }
  return { ...best, expectedRows: expected.rows.length, actualRows: actual.rows.length }
}
