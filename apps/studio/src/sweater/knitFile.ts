import type { KCodeArtifact } from '../kcode/kcodeProtocol';
import type { PanelPlan } from './rasterize';

/**
 * What a piece's .kc file makes the machine do, read back from the emitted
 * file itself (its strict trace), not from the design: every carriage pass
 * in order, grouped into the courses of fabric it knits and into the
 * sections of the run (waste yarn, draw thread, cast-on, rib, body, the
 * shoulders after the neck split, the top). The picture and the pass list
 * the browser shows are drawn only from this.
 *
 * Needle numbers are Studio's numbering (the pattern's), through the
 * verified authored-to-trace bridge; physical bed labels stay unverified.
 */

export type KnitSectionKind = 'waste' | 'draw' | 'cast-on' | 'rib' | 'body' | 'shoulders' | 'top' | 'carriers-out';

export interface KnitFilePass {
  carrier: string;
  direction: '>>' | '<<';
  operation: string;
  rack: number;
  speed: number;
  roller: number;
  /** What the pass does: knits or tucks stitches, moves stitches between beds, drops them, or only moves a carrier. */
  kind: 'knit' | 'transfer' | 'drop' | 'move';
  knit: { front: number; rear: number };
  tuck: number;
  transfer: { toRear: number; toFront: number };
  drop: number;
  /** The needles the pass selects, in Studio's numbering. */
  needles: { lo: number; hi: number } | null;
  /** Line span in the .kc text, 1-based and inclusive. */
  lines: { start: number; end: number } | null;
  /** The design row (0-based) this pass belongs to, when it is part of one. */
  row: number | null;
  /** The course this pass knits into, for passes that knit or tuck. */
  course: number | null;
  /** Where the pass sits in the picture: its course, or for one that knits nothing, the course below it. */
  at: number | null;
  section: number;
}

export interface KnitFileCourse {
  /** Per needle from `needles.lo`: '.' nothing, 'k' knit on the front bed, 'p' knit on the back bed, 'x' both, 't' tuck. */
  stitches: string;
  /** Per needle: the carrier that made the stitch, '.' for none. */
  carriers: string;
  passes: number[];
  row: number | null;
  section: number;
}

export interface KnitFileSection {
  kind: KnitSectionKind;
  label: string;
  carriers: string[];
  /** Carriers that knit for the first time in this section without it being theirs (brought in during the waste yarn). */
  joins: string[];
  passes: { from: number; to: number };
  rows: { from: number; to: number } | null;
}

export interface KnitFile {
  passCount: number;
  lineCount: number;
  needles: { lo: number; hi: number };
  courses: KnitFileCourse[];
  passes: KnitFilePass[];
  sections: KnitFileSection[];
}

export interface KnitFileCarriers {
  main: string;
  second: string | null;
  waste: string;
  draw: string;
}

export function readKnitFile(kcode: KCodeArtifact, raster: PanelPlan, carriers: KnitFileCarriers, pieceKind: 'body' | 'sleeve' | 'band'): KnitFile | null {
  const trace = kcode.trace;
  if (trace === null || !kcode.ok) return null;
  const offset = kcode.coordinateBridge?.offsets.compilerProjectToTraceCoordinate ?? 0;
  const needleOf = (coordinate: number) => coordinate - offset;
  const rowOf = (index: number) => {
    const rows = kcode.passProvenance[index]?.sourceRows ?? [];
    return rows.length > 0 ? Math.min(...rows) : null;
  };
  const firstBody = kcode.passProvenance.findIndex((item) => item.sourceRows.length > 0);
  let lastBody = -1;
  kcode.passProvenance.forEach((item, index) => { if (item.sourceRows.length > 0) lastBody = index; });
  const splitRow = (() => {
    if (carriers.second === null) return null;
    const index = trace.passes.findIndex((pass, i) => i >= firstBody && i <= lastBody && pass.carrier === carriers.second && pass.actions.some((action) => action.kind === 'knit'));
    return index === -1 ? null : rowOf(index);
  })();

  // Each pass's role in the run, from the file: before the first design row
  // the waste, draw-thread and cast-on passes; then the design rows; then the top.
  const roles: KnitSectionKind[] = [];
  let lastRole: KnitSectionKind = 'waste';
  let lastWork = -1;
  trace.passes.forEach((pass, index) => { if (pass.actions.some((action) => action.kind !== 'move')) lastWork = index; });
  // The cast-on is the main yarn's knitting after the last draw-thread pass; before it, the main yarn is only being brought in.
  let lastDraw = -1;
  trace.passes.forEach((pass, index) => { if ((firstBody === -1 || index < firstBody) && pass.carrier === carriers.draw && pass.actions.some((action) => action.kind === 'knit')) lastDraw = index; });
  trace.passes.forEach((pass, index) => {
    const stitches = pass.actions.some((action) => action.kind === 'knit' || action.kind === 'tuck');
    let role: KnitSectionKind;
    if (firstBody === -1 || index < firstBody) {
      if (!stitches) role = lastRole;
      else role = pass.carrier === carriers.draw ? 'draw' : pass.carrier === carriers.main && index > lastDraw ? 'cast-on' : 'waste';
    } else if (index <= lastBody) {
      const row = rowOf(index)!;
      role = raster.rows[row]?.zone === 'rib' ? 'rib' : splitRow !== null && row >= splitRow ? 'shoulders' : 'body';
    } else {
      role = index > lastWork ? 'carriers-out' : 'top';
    }
    roles.push(role);
    lastRole = role;
  });

  // Sections: runs of one role, in file order.
  const sections: KnitFileSection[] = [];
  const passSection: number[] = [];
  roles.forEach((role, index) => {
    const current = sections.at(-1);
    if (current && current.kind === role) current.passes.to = index;
    else sections.push({ kind: role, label: '', carriers: [], joins: [], passes: { from: index, to: index }, rows: null });
    const section = sections.at(-1)!;
    passSection.push(sections.length - 1);
    const carrier = trace.passes[index]!.carrier;
    if (carrier !== '0' && trace.passes[index]!.actions.some((action) => action.kind !== 'move') && !section.carriers.includes(carrier)) {
      if (role === 'waste' && carrier !== carriers.waste) section.joins.push(carrier);
      else section.carriers.push(carrier);
    }
    const row = rowOf(index);
    if (row !== null) section.rows = section.rows ? { from: Math.min(section.rows.from, row), to: Math.max(section.rows.to, row) } : { from: row, to: row };
  });
  let ribRuns = 0;
  for (const section of sections) section.label = sectionLabel(section, carriers, pieceKind, () => ribRuns++);

  // Courses: stitches stack on their own needle, as fabric grows on each
  // wale. Passes on different needles (two shoulders, the steps of a
  // bind-off chain, the halves of a cast-on) share a course, and one
  // shoulder's extra bind-off pass opens no gap in the other.
  let lo = Infinity;
  let hi = -Infinity;
  for (const pass of trace.passes) for (const action of pass.actions) {
    if (action.kind === 'knit' || action.kind === 'tuck') { lo = Math.min(lo, needleOf(action.at.traceCoordinate)); hi = Math.max(hi, needleOf(action.at.traceCoordinate)); }
  }
  if (!Number.isFinite(lo)) return null;
  const width = hi - lo + 1;
  const height = new Array<number>(width).fill(0);
  const grid: { stitches: string[]; carriers: string[]; passes: number[]; row: number | null; section: number }[] = [];
  const passes: KnitFilePass[] = trace.passes.map((pass, index) => {
    const knit = { front: 0, rear: 0 };
    const transfer = { toRear: 0, toFront: 0 };
    let tuck = 0;
    let drop = 0;
    const touched: { needle: number; mark: string }[] = [];
    for (const action of pass.actions) {
      if (action.kind === 'knit') { knit[action.at.bed === 'front' ? 'front' : 'rear']++; touched.push({ needle: needleOf(action.at.traceCoordinate), mark: action.at.bed === 'front' ? 'k' : 'p' }); }
      else if (action.kind === 'tuck') { tuck++; touched.push({ needle: needleOf(action.at.traceCoordinate), mark: 't' }); }
      else if (action.kind === 'xfer' || action.kind === 'split') transfer[action.source.bed === 'front' ? 'toRear' : 'toFront']++;
      else if (action.kind === 'drop') drop++;
    }
    const selected = [...pass.selections.front, ...pass.selections.rear].map((selection) => needleOf(selection.traceCoordinate));
    const inside = (needle: number) => needle >= lo && needle <= hi;
    let course: number | null = null;
    if (touched.length > 0) {
      // The pass's course is where most of its needles are; a needle with no
      // fabric below that (a new stitch from an increase) starts there, and
      // one already above it (the last stitch of a bind-off chain, knitted
      // again by the row) stacks on its own needle.
      const levels = new Map<number, number>();
      for (const item of touched) levels.set(item.needle, height[item.needle - lo]!);
      const counts = new Map<number, number>();
      for (const level of levels.values()) counts.set(level, (counts.get(level) ?? 0) + 1);
      course = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
      const row = rowOf(index);
      for (const [needle, own] of levels) {
        const level = Math.max(own, course);
        while (grid.length <= level) grid.push({ stitches: new Array<string>(width).fill('.'), carriers: new Array<string>(width).fill('.'), passes: [], row: null, section: passSection[index]! });
        const target = grid[level]!;
        const at = needle - lo;
        for (const item of touched) {
          if (item.needle !== needle) continue;
          const before = target.stitches[at]!;
          // Both beds knitting one needle position in one pass is a double stitch.
          target.stitches[at] = before !== '.' && before !== item.mark && item.mark !== 't' && before !== 't' ? 'x' : item.mark;
        }
        target.carriers[at] = pass.carrier === '0' ? '.' : pass.carrier;
        height[at] = level + 1;
      }
      const target = grid[course]!;
      target.passes.push(index);
      if (row !== null) target.row = target.row === null ? row : Math.min(target.row, row);
    }
    // A pass that knits nothing sits on top of the last stitches its needles hold.
    const onNeedles = selected.filter(inside);
    const at = course ?? (onNeedles.length > 0 ? Math.max(...onNeedles.map((needle) => height[needle - lo]!)) - 1 : null);
    const line = kcode.passLines[index];
    return {
      carrier: pass.carrier,
      direction: pass.direction,
      operation: pass.operation,
      rack: pass.rack,
      speed: pass.speed,
      roller: pass.roller,
      kind: touched.length > 0 ? 'knit' : transfer.toRear + transfer.toFront > 0 ? 'transfer' : drop > 0 ? 'drop' : 'move',
      knit,
      tuck,
      transfer,
      drop,
      needles: selected.length > 0 ? { lo: Math.min(...selected), hi: Math.max(...selected) } : null,
      lines: line ? { start: line.lineStart, end: line.lineEnd } : null,
      row: rowOf(index),
      course,
      at: at !== null && at >= 0 ? at : null,
      section: passSection[index]!,
    };
  });
  const courses: KnitFileCourse[] = grid.map((item) => ({ stitches: item.stitches.join(''), carriers: item.carriers.join(''), passes: item.passes, row: item.row, section: item.section }));

  return {
    passCount: trace.passes.length,
    lineCount: kcode.kcText.split('\n').length,
    needles: { lo, hi },
    courses,
    passes,
    sections,
  };
}

function sectionLabel(section: KnitFileSection, carriers: KnitFileCarriers, pieceKind: 'body' | 'sleeve' | 'band', nextRib: () => number): string {
  switch (section.kind) {
    case 'waste': return 'Waste yarn';
    case 'draw': return 'Draw thread';
    case 'cast-on': return 'Cast-on';
    case 'rib': {
      const first = nextRib() === 0;
      return pieceKind === 'band' ? 'Rib' : first ? (pieceKind === 'sleeve' ? 'Cuff rib' : 'Hem rib') : 'Top rib';
    }
    case 'body': return 'Body';
    case 'shoulders': return carriers.second ? `Neck split: left shoulder on C${carriers.main}, right on C${carriers.second}` : 'Shoulders';
    case 'top': return section.carriers.includes(carriers.waste) ? 'Waste yarn on top' : 'Bind-off';
    case 'carriers-out': return 'Carriers out';
  }
}
