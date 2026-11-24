/**
 * The reversible shaped scarf that knitted on 2026-11-23 (designs/fig-camel), as a recipe that
 * takes any outline and two-colour chart it can knit. The stitch sequences are those of
 * designs/fig-camel/cashmere-triangle-A/build.mjs, which made the knitted 4,384-pass file;
 * `shapedScarf.test.ts` holds this module to that file byte for byte.
 *
 * Fixed by the recipe: the start (the tip swatch's eight-column setup and its starter tapering to
 * three columns), a straight left edge, a right edge that moves one column per pair of courses,
 * the joined split increase made by C4, the inward decrease to opposite beds, and both edge stitches.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { parseColorworkChartV1 } from '../../packages/chart-contract/src/index.js';
import { authoredKnitoutToKCodeWithTrace } from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import {
  auditTraceV1, compareScheduledPassesToMachineTrace, deriveMachineTraceAdvisoriesV1, KNITERATE_7GG_KCODE_PROFILE_V2 as profile,
  parseKCodeDocument, projectKCodeMachineTrace, projectMachineTopologyV1, validateKCodeMachineSafetyV1, validateKCodeMachineTrace,
} from '../../packages/machine-lib/src/browser.js';
import { buildTipSwatch } from '../experiments/tip-swatch.js';

type Yarn = '3' | '4';
type RowKind = 'plain' | 'growth' | 'completion' | 'decrease';

/** Columns at the start. The starter that tapers to this width is the only one that has knitted. */
export const SCARF_TIP_COLUMNS = 3;
/** The settings of the knitted cashmere scarf. */
export const KNITTED_SCARF_SETTINGS = { stitch: 6, speed: 150, roller: 400 } as const;
const BED = profile.machine.needlesPerBed;

export interface ScarfDesign {
  title: string;
  /** Columns in work on each course, first course knitted first. The left edge stays on the first column. */
  widths: number[];
  /** One row per course. 1 is the contrast yarn (C3) on the front face, 0 the ground (C4). */
  cells: number[][];
  /** Ground then contrast, as #rrggbb, for the preview. */
  colours: [string, string];
  yarns: { c3: string; c4: string };
  settings: { stitch: number; speed: number; roller: number };
  /** Needle of the left edge, counted from one at the machine's left. */
  firstNeedle: number;
  /** Stitches and rows per 10 cm, when the design file gives them. Used for the size estimate only. */
  gauge: { stitches: number; rows: number } | null;
}

export class ScarfDesignError extends Error {
  constructor(readonly problems: string[]) { super(problems.join('\n')); }
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

/**
 * Reads a design file: a two-colour `chart` (bottom-up, so its first row is the first course),
 * `activeIntervalsExclusive` with one [0, width] per course, and an optional `knit` block
 * ({ yarns: { c3, c4 }, stitch, speed, roller, firstNeedle }). A triangle project saved by Studio's
 * scarf workspace has the first two; without `knit` the knitted cashmere settings are used.
 */
export function readScarfDesign(value: unknown): ScarfDesign {
  const file = record(value), fail = (problem: string): never => { throw new ScarfDesignError([problem]); };
  let chart: ReturnType<typeof parseColorworkChartV1>;
  try { chart = parseColorworkChartV1(file.chart); } catch (error) { return fail(`The design needs a colourwork chart in \`chart\`. ${error instanceof Error ? error.message : ''}`.trim()); }
  if (chart.palette.length !== 2) fail('The chart needs exactly two colours: the ground (C4) first, then the contrast (C3).');
  if (chart.rowNumbering !== 'bottom-up') fail('The chart is numbered bottom-up: its first row is the first course knitted.');
  const intervals = file.activeIntervalsExclusive;
  if (!Array.isArray(intervals) || intervals.length !== chart.height) fail('`activeIntervalsExclusive` gives one [0, width] pair for each chart row.');
  const widths = (intervals as unknown[]).map((interval, course) => {
    if (!Array.isArray(interval) || interval.length !== 2 || interval[0] !== 0 || !Number.isInteger(interval[1])) return fail(`Course ${course + 1}: the outline is [0, width]. The left edge stays on the first column.`);
    return interval[1] as number;
  });
  const knit = record(file.knit), yarns = record(knit.yarns), gauge = record(file.gaugePer10cm);
  const whole = (name: string, fallback: number) => {
    const given = knit[name];
    if (given === undefined) return fallback;
    return typeof given === 'number' && Number.isInteger(given) && given >= 0 ? given : fail(`\`knit.${name}\` is a whole number.`);
  };
  const widest = Math.max(...widths);
  return {
    title: typeof file.title === 'string' && file.title.trim() ? file.title.trim() : 'Shaped scarf',
    widths, cells: chart.cells.map((row) => [...row]),
    colours: [chart.palette[0]!.hex, chart.palette[1]!.hex],
    yarns: { c3: typeof yarns.c3 === 'string' ? yarns.c3 : chart.palette[1]!.name, c4: typeof yarns.c4 === 'string' ? yarns.c4 : chart.palette[0]!.name },
    settings: { stitch: whole('stitch', KNITTED_SCARF_SETTINGS.stitch), speed: whole('speed', KNITTED_SCARF_SETTINGS.speed), roller: whole('roller', KNITTED_SCARF_SETTINGS.roller) },
    firstNeedle: whole('firstNeedle', 1 + Math.max(0, Math.floor((BED - widest) / 2))),
    gauge: typeof gauge.stitches === 'number' && typeof gauge.rows === 'number' && gauge.stitches > 0 && gauge.rows > 0 ? { stitches: gauge.stitches, rows: gauge.rows } : null,
  };
}

/** Everything about the outline and chart that this recipe cannot knit, in the designer's terms. Empty when it fits. */
export function scarfOutlineProblems(design: ScarfDesign): string[] {
  const { widths, cells } = design, problems: string[] = [];
  if (widths.length < 2 || widths.length % 2 === 1) problems.push(`The outline has ${widths.length} courses. A width holds for a pair of courses, so it needs an even number of at least two.`);
  if (widths[0] !== SCARF_TIP_COLUMNS) problems.push(`The first course is ${widths[0]} columns wide. The start that has knitted is ${SCARF_TIP_COLUMNS} columns.`);
  if (cells.length !== widths.length) problems.push(`The chart has ${cells.length} rows and the outline ${widths.length} courses.`);
  widths.forEach((width, course) => {
    const before = course === 0 ? width : widths[course - 1]!, name = `Course ${course + 1}`;
    if (!Number.isInteger(width) || width < SCARF_TIP_COLUMNS) problems.push(`${name} is ${width} columns wide. The narrowest width is ${SCARF_TIP_COLUMNS}.`);
    if (course % 2 === 1 && width !== before) problems.push(`${name} changes width. A width holds for a pair of courses (1-2, 3-4, ...), so only odd-numbered courses can change it.`);
    if (course % 2 === 0 && Math.abs(width - before) > 1) problems.push(`${name} changes by ${Math.abs(width - before)} columns. The edge moves one column per pair of courses.`);
    const row = cells[course] ?? [];
    if (row.some((colour, column) => column >= width && colour !== 0)) problems.push(`${name} has colour outside the outline.`);
    // The split borrows the old edge loop, so that column is knitted by C4 on both courses of an increase.
    if (course % 2 === 0 && width === before + 1 && (row[width - 2] === 1 || cells[course + 1]?.[width - 2] === 1)) problems.push(`${name} widens. The column beside the new edge stitch is ground colour on courses ${course + 1} and ${course + 2}.`);
  });
  const widest = Math.max(...widths);
  // The draw thread parks five needles left of the piece.
  if (design.firstNeedle < 6 || design.firstNeedle + widest - 1 > BED) problems.push(`Needles ${design.firstNeedle} to ${design.firstNeedle + widest - 1} do not fit. The piece needs needle 6 or higher on the left and ${BED} or lower on the right.`);
  return problems;
}

export interface ScarfRow {
  /** Body row in the file, from one. Row 1 and the last row are the plain courses added before and after the chart. */
  row: number;
  /** The design's course, from one; null for the two added rows. */
  course: number | null;
  kind: RowKind;
  width: number;
  /** The yarn on the front bed at each column. The rear bed has the other yarn. */
  front: Yarn[];
}

/** Lowers a design to knitout and KCode. Throws `ScarfDesignError` when the outline does not fit the recipe. */
export function buildShapedScarf(design: ScarfDesign, sourceName = `${design.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scarf'}.k`) {
  const problems = scarfOutlineProblems(design);
  if (problems.length > 0) throw new ScarfDesignError(problems);
  const tip = buildTipSwatch(), lo = design.firstNeedle, { stitch, speed, roller } = design.settings;
  const [setup, starter] = tip.source.split('; TIP ROW 1 plain\n') as [string, string];
  const move = (text: string) => text.replace(/\b([fb])(\d+)\b/g, (_, bed: string, n: string) => bed + (Number(n) + lo - tip.lo));
  const lines = [move(setup.trimEnd()).replace('Orange single 2/14 acrylic', design.yarns.c3).replace('Grey single 2/14 acrylic', design.yarns.c4)];
  const emit = (...ops: string[]) => { lines.push(...ops); };
  const rows: ScarfRow[] = [];
  let hi = lo + SCARF_TIP_COLUMNS - 1;
  const pass = (carrier: string, direction: '+' | '-', bedAt: (n: number) => 'f' | 'b', first = lo, last = hi) => {
    for (let i = first; i <= last; i++) {
      const n = direction === '+' ? i : last - (i - first);
      emit(`knit ${direction} ${bedAt(n)}${n} ${carrier}`);
    }
  };

  // The tip swatch reaches three columns after its starter row 16. Its next two rows put C3 on the
  // left for the half row before the draw thread.
  emit('; STARTER', move(starter.split('; TIP ROW 19 decrease')[0]!.trimEnd())
    .replaceAll('x-stitch-number 7', `x-stitch-number ${stitch}`)
    .replaceAll('x-speed-number 200', `x-speed-number ${speed}`)
    .replaceAll('x-roller-advance 450', `x-roller-advance ${roller}`));
  emit('; STARTER half');
  pass('3', '+', (n) => (n === lo ? 'f' : 'b'));
  emit('; NECK draw', 'x-speed-number 100', 'x-roller-advance 400', 'x-stitch-number 8');
  pass('1', '+', () => 'f'); pass('1', '-', () => 'b');
  emit('x-roller-advance 0', `miss - f${lo - 5} 1`, '; NECK cast-on', 'rack 0.5', 'x-roller-advance 450', 'x-stitch-number 3');
  for (let n = hi; n >= lo; n--) emit(`knit - b${n} 3`, `knit - f${n} 3`);
  emit('x-roller-advance 400', 'x-stitch-number 5');
  pass('3', '+', () => 'f'); pass('3', '-', () => 'b'); emit('rack 0');

  // C3 is on the left before every odd row. After an increase the right edge stitch is C4 on even
  // rows; from a decrease on, and before the first increase, it is C4 on odd rows.
  let c3Left = true, widening = false;
  const colours = (r: number, kind: RowKind, right: Yarn): Yarn[] => {
    const width = hi - lo + 1, course = r - 2, charted = course >= 0 && course < design.widths.length;
    if (charted) assert.equal(width, design.widths[course]);
    const front: Yarn[] = charted ? design.cells[course]!.slice(0, width).map((colour) => (colour === 1 ? '3' : '4')) : Array<Yarn>(width).fill('4');
    front[0] = r % 2 ? '3' : '4';
    front[width - 1] = right;
    rows.push({ row: r, course: charted ? course + 1 : null, kind, width, front });
    return front;
  };
  const onFront = (carrier: Yarn, front: Yarn[]) => (n: number) => (front[n - lo] === carrier ? 'f' : 'b');
  const body = (r: number) => emit(`x-stitch-number ${stitch}`, `x-speed-number ${r === 1 ? 100 : speed}`, `x-roller-advance ${r === 1 ? 100 : roller}`);
  const plain = (r: number, narrowing = false) => {
    emit(`; ROW ${r} ${narrowing ? 'decrease' : 'plain'}`);
    if (narrowing) {
      emit('x-speed-number 100', 'x-roller-advance 0', 'x-xfer-stitch-number 5', 'rack 1', `xfer f${hi} b${hi - 1}`, 'rack -1', `xfer b${hi} f${hi - 1}`, 'rack 0');
      hi--; widening = false;
    }
    const front = colours(r, narrowing ? 'decrease' : 'plain', Boolean(r % 2) === !widening ? '4' : '3');
    body(r);
    const left: Yarn = c3Left ? '3' : '4', right: Yarn = c3Left ? '4' : '3';
    if (r <= 3) { pass(left, '+', onFront(left, front)); pass(right, '-', onFront(right, front)); }
    else { pass(right, '-', onFront(right, front)); pass(left, '+', onFront(left, front)); }
    c3Left = !c3Left;
  };
  const increase = (r: number) => {
    assert(!c3Left, 'The joined split needs C4 on the left');
    widening = true;
    emit(`; ROW ${r} growth`);
    const old = hi++;
    emit('x-roller-advance 0', `miss - f${old} 3`, `miss + f${hi} 3`, 'x-speed-number 100', 'x-xfer-stitch-number 5', 'rack 1', `xfer b${old} f${hi}`, 'rack 0');
    const growth = colours(r, 'growth', '4'); growth[old - lo] = '4';
    body(r); pass('4', '+', onFront('4', growth), lo, old); emit(`split + f${hi} b${hi} 4`);
    emit(`knit - b${hi} 3`); pass('3', '-', onFront('3', growth), lo, old - 1);
    emit(`; ROW ${r + 1} completion`);
    const finish = colours(r + 1, 'completion', '3'); finish[old - lo] = '4';
    emit('x-roller-advance 0', `knit - b${hi} 4`, `miss + f${hi} 4`, `x-roller-advance ${roller}`, `x-add-roller-advance ${roller}`, `split - f${old} b${old} 4`, 'x-roller-advance 0');
    pass('4', '-', onFront('4', finish), lo, old - 1);
    emit(`x-roller-advance ${roller}`); pass('3', '+', onFront('3', finish));
  };

  // One plain course on the starting width before the chart and one after it set and recover the yarn sides.
  plain(1);
  for (let course = 0; course < design.widths.length; course++) {
    const change = design.widths[course]! - (hi - lo + 1);
    if (change === 1) { increase(course + 2); course++; } else plain(course + 2, change === -1);
  }
  plain(design.widths.length + 2);
  emit('; BODY END', 'x-speed-number 150', 'x-stitch-number 7', 'x-roller-advance 400');
  for (let round = 0; round < 8; round++) { pass('6', '+', () => 'f'); pass('6', '-', () => 'b'); }
  emit('x-stitch-number 4');
  for (let n = lo; n <= hi; n++) emit(`drop f${n}`, `drop b${n}`);
  emit('x-roller-advance 0', 'out 1', 'out 3', 'out 4', 'out 6');
  const source = lines.join('\n') + '\n', compiled = authoredKnitoutToKCodeWithTrace(source, sourceName);
  if (!compiled.ok) throw new Error(`The scarf did not compile: ${compiled.error}`);
  return { design, source, sourceName, compiled, rows, lo };
}

export type BuiltScarf = ReturnType<typeof buildShapedScarf>;

/**
 * Replays the machine file: validator, safety envelope, audit, then every body row's loops against
 * the chart, the outline, the split of each increase, the two merged loops of each decrease and the
 * edge joins. Throws on the first thing that differs.
 */
export function verifyShapedScarf(built: BuiltScarf) {
  const { design, compiled, rows, lo } = built, { stitch, speed, roller } = design.settings;
  const parsed = parseKCodeDocument(compiled.kcode, { profile, dialect: 'knitout-vendor', strict: true, resourceProfile: 'authored-v1' }); assert(parsed.ok);
  const trace = projectKCodeMachineTrace(parsed.document, profile), validation = validateKCodeMachineTrace(trace, profile), safety = validateKCodeMachineSafetyV1(trace, profile);
  assert(validation.ok, JSON.stringify(validation.diagnostics)); assert(safety.ok, JSON.stringify(safety.diagnostics));
  assert(compareScheduledPassesToMachineTrace(compiled.scheduledPasses, trace).ok, 'Schedule differential');
  type Section = 'setup' | 'starter' | 'neck' | 'body' | 'finish';
  let label: { section: Section; row: number } = { section: 'setup', row: 0 };
  const labels = built.source.split('\n').map((line) => {
    const row = line.match(/^; ROW (\d+) \S+$/);
    if (line === '; STARTER') label = { section: 'starter', row: 0 };
    else if (line.startsWith('; NECK ')) label = { section: 'neck', row: 0 };
    else if (row) label = { section: 'body', row: Number(row[1]) };
    else if (line === '; BODY END') label = { section: 'finish', row: 0 };
    return label;
  });
  const passLabels = compiled.scheduledPasses.map((pass) => labels[pass.sourceLines.at(-1)! - 1]!);
  const range = (section: Section): [number, number] => {
    const own = trace.passes.filter((pass) => passLabels[pass.index]!.section === section);
    return [own[0]!.index + 1, own.at(-1)!.index + 1];
  };
  const ranges = { setup: range('setup'), starter: range('starter'), neck: range('neck'), body: range('body'), finish: range('finish') };
  const audit = auditTraceV1(trace, { sections: [{ name: 'waste', from: 1, to: ranges.body[0] - 1 }, { name: 'body', from: ranges.body[0], to: ranges.body[1] }, { name: 'top', from: ranges.finish[0], to: ranges.finish[1] }] });
  assert(audit.checks.every((check) => check.ok), JSON.stringify(audit.checks.filter((check) => !check.ok)));

  const loopBudget = 2 * design.widths.reduce((sum, width) => sum + width, 0) + 4000;
  const topology = projectMachineTopologyV1(trace, { maxLoops: loopBudget, maxConnections: loopBudget * 3, maxMovements: Math.max(60000, loopBudget) });
  const offset = compiled.coordinateMapping.frontSourceSlotToKCodeColumnOffset;
  const loopsByRow = rows.map(() => [] as (typeof topology.loops)[number][]), passesByRow = rows.map(() => [] as (typeof trace.passes)[number][]);
  for (const loop of topology.loops) { const row = passLabels[loop.createdAt.passIndex]!.row; if (row > 0) loopsByRow[row - 1]!.push(loop); }
  for (const pass of trace.passes) { const row = passLabels[pass.index]!.row; if (row > 0) passesByRow[row - 1]!.push(pass); }
  const occupancy = new Map<string, number>(), afterRow: Map<string, number>[] = [];
  for (const pass of trace.passes) {
    const state = validation.passStates[pass.index]!, here = passLabels[pass.index]!;
    for (const delta of state.stackDeltas) occupancy.set(`${delta.bed}:${delta.traceCoordinate}`, delta.afterCount);
    if (pass.index + 1 >= ranges.starter[0]) assert(state.after.maxStack <= 2, `pass ${pass.index + 1} stacks more than two loops`);
    if (here.section === 'body' && passLabels[pass.index + 1]?.row !== here.row) afterRow.push(new Map(occupancy));
  }
  assert.equal(validation.passStates.at(-1)!.after.totalLoops, 0, 'Loops are left on the needles');
  assert(topology.loops.filter((loop) => loop.createdAt.passIndex + 1 >= ranges.starter[0]).every((loop) => loop.parentLoopIds.length > 0), 'A stitch is knitted on an empty needle after the starter begins');
  assert.equal(rows.length, design.widths.length + 2);
  assert.equal(afterRow.length, rows.length);

  const joins = { left: [] as number[], right: [] as number[] };
  for (const { row: r, course, kind, width, front } of rows) {
    const edge = lo + width - 1, state = afterRow[r - 1]!, loops = loopsByRow[r - 1]!, passes = passesByRow[r - 1]!, name = `row ${r}`;
    assert.equal(width, course === null ? (r === 1 ? design.widths[0] : design.widths.at(-1)) : design.widths[course - 1], `${name} width`);
    assert.equal(loops.length, 2 * width - (kind === 'growth' ? 1 : 0), `${name} loop count`);
    assert.equal(new Set(loops.map((loop) => `${loop.createdAt.location.bed}:${loop.createdAt.location.traceCoordinate}`)).size, loops.length, `${name} knits a needle twice`);
    const onFront: (string | null)[] = Array<string | null>(width).fill(null);
    for (const loop of loops) {
      const { bed, traceCoordinate } = loop.createdAt.location, n = traceCoordinate - offset;
      assert(n >= lo && n <= edge, `${name} knits outside the outline`);
      const expected = front[n - lo]!;
      assert.equal(loop.carrier, bed === 'front' ? expected : expected === '4' ? '3' : '4', `${name} colour at column ${n - lo + 1}`);
      if (bed === 'front') onFront[n - lo] = loop.carrier;
      const previous = loop.previousCarrierLoopId === null ? undefined : topology.loops[loop.previousCarrierLoopId]?.createdAt.location;
      if (previous && previous.bed !== bed) {
        if (previous.traceCoordinate === traceCoordinate && n === lo) joins.left.push(r);
        if (Math.min(n, previous.traceCoordinate - offset) >= edge - 1 && Math.abs(traceCoordinate - previous.traceCoordinate) <= 1) joins.right.push(r);
      }
    }
    for (let n = lo; n <= edge; n++) for (const bed of ['front', 'rear'] as const) {
      assert.equal(state.get(`${bed}:${n + offset}`) ?? 0, kind === 'growth' && n === edge - 1 && bed === 'rear' ? 0 : 1, `${name} loops on ${bed} needle ${n}`);
    }
    // The chart itself, apart from the two edge stitches the recipe sets.
    if (course !== null) assert.deepEqual(onFront.slice(1, -1), design.cells[course - 1]!.slice(1, width - 1).map((colour) => (colour === 1 ? '3' : '4')), `${name} differs from course ${course} of the chart`);
    const splits = loops.filter((loop) => loop.creation === 'split');
    assert.equal(splits.length, kind === 'growth' || kind === 'completion' ? 1 : 0, `${name} splits`);
    if (splits.length === 1) {
      const split = splits[0]!, at = split.createdAt.location;
      assert.equal(split.carrier, '4'); assert.equal(split.parentLoopIds.length, 1); assert.equal(at.bed, 'front');
      assert.equal(at.traceCoordinate - offset, kind === 'growth' ? edge : edge - 1, `${name} split needle`);
      const receiving = loops.find((other) => other.createdAt.location.bed === 'rear' && other.createdAt.location.traceCoordinate === at.traceCoordinate);
      assert.deepEqual(receiving?.parentLoopIds, split.parentLoopIds, `${name}: both loops of the split share its parent`);
    }
    if (kind === 'decrease') assert.equal(loops.filter((loop) => loop.parentLoopIds.length === 2).length, 2, `${name} merges two loops`);
    const transfers = passes.flatMap((pass) => pass.actions.flatMap((action) => (action.kind === 'xfer' ? [[action.source.bed, action.source.traceCoordinate - offset, action.target.bed, action.target.traceCoordinate - offset]] : [])));
    assert.deepEqual(transfers, kind === 'growth' ? [['rear', edge - 1, 'front', edge]] : kind === 'decrease' ? [['front', edge + 1, 'rear', edge], ['rear', edge + 1, 'front', edge]] : [], `${name} transfers`);
    assert.equal(passes.filter((pass) => pass.roller > 0).length, 2, `${name} take-down advances`);
    for (const pass of passes) {
      assert(pass.carrier !== '1' && pass.carrier !== '6', `${name}: the draw and waste yarns stay out of the body`);
      const working = pass.actions.flatMap((action) => (action.kind === 'knit' ? [action.at] : action.kind === 'split' ? [action.source, action.target] : []));
      for (const needle of working) assert.equal(needle.stitchSelector.encodedValue, stitch, `${name} stitch size`);
      if (working.length > 0) { assert.equal(pass.rack, 0); assert.equal(pass.speed, r === 1 ? 100 : speed); assert([0, r === 1 ? 100 : roller].includes(pass.roller), `${name} roller`); }
    }
  }
  // The yarns cross beds at each edge at least once in any four rows, as in the knitted scarf.
  for (const [side, joined] of Object.entries(joins)) for (let r = 1; r <= rows.length - 3; r++) assert(joined.some((row) => row >= r && row <= r + 3), `the ${side} edge is not joined from row ${r}`);

  const widest = Math.max(...design.widths), kinds = (kind: RowKind) => rows.filter((row) => row.kind === kind);
  return {
    passed: true as const,
    sha256: createHash('sha256').update(compiled.kcode).digest('hex'), bytes: Buffer.byteLength(compiled.kcode), passes: trace.passes.length,
    ranges, courses: design.widths.length, increases: kinds('growth').length, decreases: kinds('decrease').length,
    columns: { start: design.widths[0]!, widest, end: design.widths.at(-1)! }, needles: [lo, lo + widest - 1] as [number, number],
    compilerWarnings: compiled.warningCount, floatAdvisories: deriveMachineTraceAdvisoriesV1(trace, profile).advisories.length,
  };
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function pngChunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]), out = Buffer.alloc(body.length + 8);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, body.length + 4);
  return out;
}

/**
 * Both faces as a PNG, in worn orientation: the scarf's length runs left to right and the straight
 * edge is at the top. The upper piece is the front face, the lower the rear. Cells follow the gauge
 * when the design gives one.
 */
export function scarfPreviewPng(built: BuiltScarf): Buffer {
  const { rows, design } = built, widest = Math.max(...rows.map((row) => row.width));
  const along = Math.max(1, Math.round(1600 / rows.length)), across = Math.max(1, Math.round(along * (design.gauge ? design.gauge.rows / design.gauge.stitches : 1)));
  const gap = 4 * across, width = rows.length * along, height = 2 * widest * across + gap;
  const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const yarn = { '4': rgb(design.colours[0]), '3': rgb(design.colours[1]) };
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  rows.forEach((row, course) => row.front.forEach((front, column) => {
    for (const [face, colour] of [[0, yarn[front]], [1, yarn[front === '3' ? '4' : '3']]] as const) {
      for (let y = 0; y < across; y++) for (let x = 0; x < along; x++) {
        const at = (face * (widest * across + gap) + column * across + y) * (width * 4 + 1) + 1 + (course * along + x) * 4;
        pixels[at] = colour[0]!; pixels[at + 1] = colour[1]!; pixels[at + 2] = colour[2]!; pixels[at + 3] = 255;
      }
    }
  }));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0))]);
}

/** The sheet that goes to the machine with the file. */
export function scarfHandoffSheet(built: BuiltScarf, report: ReturnType<typeof verifyShapedScarf>, knitted: Record<string, number> | null) {
  const { design } = built, { ranges, columns } = report, span = (range: [number, number]) => `${range[0]}–${range[1]}`;
  const size = design.gauge ? ` At ${Number(design.gauge.stitches.toFixed(1))} stitches and ${Number(design.gauge.rows.toFixed(1))} rows per 10 cm that is about ${(report.courses * 10 / design.gauge.rows).toFixed(0)} cm long and ${(columns.widest * 10 / design.gauge.stitches).toFixed(0)} cm at the widest.` : '';
  const seen = knitted === null ? [] : [
    '## Against the knit log', '',
    `Of the ${report.passes} passes, ${knitted.new ?? 0} are new on the machine, ${knitted.faulted ?? 0} have a fault on record and ${knitted.unclear ?? 0} have only run in a knit whose fault was never placed. \`studio knitted command.kc\` lists them.`, '',
  ];
  return [
    `# ${design.title}`, '',
    `\`command.kc\`: ${report.passes} passes, ${report.bytes.toLocaleString('en-US')} bytes, SHA-256 \`${report.sha256}\`.`,
    '**Not knitted.** The checks behind this sheet are software checks.', '',
    '## Load', '',
    'Copy `command.kc` to the root of the SD card, not into a folder: the machine loads the file at the root. Check the hash of the file on the card.',
    'Start on an empty bed with the feeders home on the left.', '',
    '| Feeder | Yarn |', '|---|---|',
    '| C1 | Draw thread |', `| C3 | ${design.yarns.c3} (contrast on the front face; casts on) |`, `| C4 | ${design.yarns.c4} (ground on the front face; makes every increase) |`, '| C6 | Waste yarn |', '',
    `Body: stitch size ${design.settings.stitch}, speed ${design.settings.speed}, roller ${design.settings.roller}. The first body course runs at speed 100 and roller 100. Transfers run at speed 100, transfer stitch 5 and roller 0.`, '',
    '## What it knits', '',
    `${columns.start} → ${columns.widest} → ${columns.end} columns over ${report.courses} courses, on needles ${report.needles[0]}–${report.needles[1]} counted from the machine's left, with ${report.increases} increases and ${report.decreases} decreases on the right edge.${size}`, '',
    '| Passes | Section |', '|---|---|',
    `| ${span(ranges.setup)} | Eight-column waste start and the two body yarns brought in |`,
    `| ${span(ranges.starter)} | Starter tapering to three columns; thrown away afterwards |`,
    `| ${span(ranges.neck)} | Draw-thread round and the cast-on on three columns |`,
    `| ${span(ranges.body)} | The scarf |`,
    `| ${span(ranges.finish)} | Eight rounds of waste, release, feeders out |`, '',
    ...seen,
    '## Record', '',
    '1. For every stop, dropped stitch or yarn break: the pass shown on the machine and which feeder.',
    '2. Whether the file finished. If it stopped early, the last pass that completed.',
    '3. Finished length and width, lying flat, and whether it was washed.',
    '4. Photos of both faces and of each edge.', '',
  ].join('\n');
}
