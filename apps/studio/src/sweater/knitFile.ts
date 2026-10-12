import type { KCodeArtifact } from '../kcode/kcodeProtocol';

/**
 * What a .kc file makes the machine do, read back from the emitted file
 * itself (its strict trace and the compiler's row links), not from the
 * design: every carriage pass in order, the fabric it knits, and the
 * sections of the run (waste yarn, draw thread, cast-on, rib, body, the
 * shoulders after a neck split, the top). The picture and the pass list the
 * browser shows are drawn only from this.
 *
 * The picture is the face of the fabric: each design row is one course; a
 * needle shows its front-bed stitch (a knit), or its back-bed stitch (a purl
 * from this side) when the front bed did not knit it. Passes outside the
 * design rows (waste yarn, draw thread, cast-on, the top) stack on their own
 * needles.
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
  /** The design row (0-based, in knitting order) this pass belongs to, when it is part of one. */
  row: number | null;
  /** The course this pass knits into, for passes that knit or tuck. */
  course: number | null;
  /** Where the pass sits in the picture: its course, or for one that knits nothing, the course below it. */
  at: number | null;
  section: number;
}

export interface KnitFileCourse {
  /** Per needle from `needles.lo`: '.' nothing, 'k' a knit, 'p' a purl (back bed), 't' a tuck. */
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
  /** The yarn that casts on. */
  main: string;
  /** A second cone of the main yarn (a sweater's right shoulder). */
  second: string | null;
  waste: string;
  /** Null when the piece knits without a draw thread. */
  draw: string | null;
  /** Colourwork: every pattern carrier's yarn. */
  yarns?: Record<string, { name: string; hex: string }>;
}

export type KnitFileKind = 'body' | 'sleeve' | 'band' | 'panel' | 'beanie';

export function readKnitFile(kcode: KCodeArtifact, options: { zoneOfRow: (row: number) => 'rib' | 'body'; carriers: KnitFileCarriers; kind: KnitFileKind }): KnitFile | null {
  const { zoneOfRow, carriers, kind } = options;
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
  const yarn = (carrier: string) => carrier === carriers.main || carrier === carriers.second || (carriers.yarns?.[carrier] !== undefined);
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
  // The cast-on is the yarn's knitting after the last draw-thread pass (with none, the last waste pass); before it, a yarn is only being brought in.
  const separator = carriers.draw ?? carriers.waste;
  let lastDraw = -1;
  trace.passes.forEach((pass, index) => { if ((firstBody === -1 || index < firstBody) && pass.carrier === separator && pass.actions.some((action) => action.kind === 'knit')) lastDraw = index; });
  const knits = (index: number) => trace.passes[index]!.actions.some((action) => action.kind === 'knit' || action.kind === 'tuck');
  const frontKnits = (index: number) => trace.passes[index]!.actions.flatMap((action) => (action.kind === 'knit' && action.at.bed === 'front' ? [action.at.traceCoordinate] : [])).sort((a, b) => a - b).join(' ');
  // A beanie's body runs to its first crown decrease: rows after the design's
  // last that knit the same front needles (a birdseye back joining the face) are still body.
  let bodyEnd = lastBody;
  if (kind === 'beanie' && lastBody !== -1) {
    const across = frontKnits(lastBody);
    for (let index = lastBody + 1; index < trace.passes.length; index++) {
      if (!knits(index)) continue;
      if (frontKnits(index) !== across) break;
      bodyEnd = index;
    }
  }
  const roleOfRow = (row: number): KnitSectionKind => (zoneOfRow(row) === 'rib' ? 'rib' : splitRow !== null && row >= splitRow ? 'shoulders' : 'body');
  // A row the design does not have, between its rows (a ground row starting a birdseye back), belongs to the section it leads into.
  const nextRowRole: (KnitSectionKind | null)[] = new Array(trace.passes.length).fill(null);
  for (let index = trace.passes.length - 1, next: KnitSectionKind | null = null; index >= 0; index--) {
    const row = rowOf(index);
    if (row !== null) next = roleOfRow(row);
    nextRowRole[index] = next;
  }
  trace.passes.forEach((pass, index) => {
    const stitches = knits(index);
    let role: KnitSectionKind;
    if (firstBody === -1 || index < firstBody) {
      if (!stitches) role = lastRole;
      else role = pass.carrier === carriers.draw ? 'draw' : yarn(pass.carrier) && index > lastDraw ? 'cast-on' : 'waste';
    } else if (index <= bodyEnd) {
      const row = rowOf(index);
      role = row !== null ? roleOfRow(row) : stitches && index < lastBody ? nextRowRole[index] ?? lastRole : lastRole;
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
    if (carrier !== '0' && trace.passes[index]!.actions.some((action) => action.kind !== 'move') && !section.carriers.includes(carrier) && !section.joins.includes(carrier)) {
      if (role === 'waste' && carrier !== carriers.waste) section.joins.push(carrier);
      else section.carriers.push(carrier);
    }
    const row = rowOf(index);
    if (row !== null) section.rows = section.rows ? { from: Math.min(section.rows.from, row), to: Math.max(section.rows.to, row) } : { from: row, to: row };
  });
  // A beanie's crown ends in straight rows that come off open and are gathered by hand: their own section.
  const crown = kind === 'beanie' ? sections.findIndex((section) => section.kind === 'top') : -1;
  if (crown !== -1) {
    const section = sections[crown]!;
    const knitted = (index: number) => trace.passes[index]!.actions.flatMap((action) => (action.kind === 'knit' ? [`${action.at.bed}${action.at.traceCoordinate}`] : [])).sort().join(' ');
    const knitPasses: number[] = [];
    for (let index = section.passes.from; index <= section.passes.to; index++) if (knitted(index) !== '') knitPasses.push(index);
    const last = knitPasses.length > 0 ? knitted(knitPasses.at(-1)!) : '';
    let start = knitPasses.length;
    while (start > 0 && knitted(knitPasses[start - 1]!) === last) start--;
    if (start > 0 && start < knitPasses.length) {
      const from = knitPasses[start]!;
      const carriersIn = new Set<string>();
      for (let index = from; index <= section.passes.to; index++) if (trace.passes[index]!.actions.some((action) => action.kind !== 'move') && trace.passes[index]!.carrier !== '0') carriersIn.add(trace.passes[index]!.carrier);
      sections.splice(crown + 1, 0, { kind: 'top', label: '', carriers: [...carriersIn], joins: [], passes: { from, to: section.passes.to }, rows: null });
      section.passes.to = from - 1;
      for (let index = from; index < passSection.length; index++) passSection[index] = passSection[index]! + 1;
    }
  }
  let ribRuns = 0;
  let topRuns = 0;
  const allRib = !sections.some((section) => section.kind === 'body' || section.kind === 'shoulders');
  for (const section of sections) section.label = sectionLabel(section, carriers, kind, () => ribRuns++, () => topRuns++, allRib);

  let lo = Infinity;
  let hi = -Infinity;
  for (const pass of trace.passes) for (const action of pass.actions) {
    if (action.kind === 'knit' || action.kind === 'tuck') { lo = Math.min(lo, needleOf(action.at.traceCoordinate)); hi = Math.max(hi, needleOf(action.at.traceCoordinate)); }
  }
  if (!Number.isFinite(lo)) return null;
  const width = hi - lo + 1;
  // Stitches outside the design rows stack on their own needles.
  const height = new Array<number>(width).fill(0);
  const grid: { stitches: string[]; carriers: string[]; passes: number[]; row: number | null; section: number }[] = [];
  const course = (level: number, section: number) => {
    while (grid.length <= level) grid.push({ stitches: new Array<string>(width).fill('.'), carriers: new Array<string>(width).fill('.'), passes: [], row: null, section });
    return grid[level]!;
  };
  let bodyBase: number | null = null;
  let bodyTop = -1;
  // Courses for rows the design does not have, between its rows: the design rows above move up by as many.
  let extra = 0;
  const place = (target: ReturnType<typeof course>, at: number, mark: string, front: boolean, carrier: string) => {
    // The face shows the front bed; a back-bed stitch only where the front bed has none.
    const before = target.stitches[at]!;
    if (!front && (before === 'k' || before === 't')) return;
    target.stitches[at] = mark;
    target.carriers[at] = carrier === '0' ? '.' : carrier;
  };
  const passes: KnitFilePass[] = trace.passes.map((pass, index) => {
    const knit = { front: 0, rear: 0 };
    const transfer = { toRear: 0, toFront: 0 };
    let tuck = 0;
    let drop = 0;
    const touched: { needle: number; mark: string; front: boolean }[] = [];
    for (const action of pass.actions) {
      if (action.kind === 'knit' || action.kind === 'tuck') {
        const front = action.at.bed === 'front';
        if (action.kind === 'knit') knit[front ? 'front' : 'rear']++; else tuck++;
        touched.push({ needle: needleOf(action.at.traceCoordinate), mark: action.kind === 'tuck' ? 't' : front ? 'k' : 'p', front });
      }
      else if (action.kind === 'xfer' || action.kind === 'split') transfer[action.source.bed === 'front' ? 'toRear' : 'toFront']++;
      else if (action.kind === 'drop') drop++;
    }
    const selected = [...pass.selections.front, ...pass.selections.rear].map((selection) => needleOf(selection.traceCoordinate));
    const row = rowOf(index);
    let placedAt: number | null = null;
    if (touched.length > 0 && row !== null) {
      // A design row is one course.
      bodyBase ??= Math.max(0, ...height);
      placedAt = bodyBase + row + extra;
      const target = course(placedAt, passSection[index]!);
      for (const item of touched) place(target, item.needle - lo, item.mark, item.front, pass.carrier);
      target.passes.push(index);
      target.row = target.row === null ? row : Math.min(target.row, row);
      bodyTop = Math.max(bodyTop, placedAt);
    } else if (touched.length > 0 && bodyBase !== null && index < lastBody) {
      // A row the design does not have, between its rows: a row on the face is a course of its own; a back-bed row lies behind the last one.
      if (touched.some((item) => item.front)) { extra++; placedAt = bodyTop + 1; } else placedAt = bodyTop;
      const target = course(placedAt, passSection[index]!);
      for (const item of touched) place(target, item.needle - lo, item.mark, item.front, pass.carrier);
      target.passes.push(index);
      bodyTop = Math.max(bodyTop, placedAt);
    } else if (touched.length > 0) {
      // After the design rows, stacking starts above them.
      if (bodyBase !== null && index > lastBody && height.some((value) => value <= bodyTop)) for (let k = 0; k < width; k++) height[k] = Math.max(height[k]!, bodyTop + 1);
      // The pass's course is where most of its needles are; a needle with no
      // fabric below that starts there, and one already above it stacks on its own needle.
      const levels = new Map<number, number>();
      for (const item of touched) levels.set(item.needle, height[item.needle - lo]!);
      const counts = new Map<number, number>();
      for (const level of levels.values()) counts.set(level, (counts.get(level) ?? 0) + 1);
      placedAt = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
      for (const [needle, own] of levels) {
        const level = Math.max(own, placedAt);
        const target = course(level, passSection[index]!);
        for (const item of touched) if (item.needle === needle) place(target, needle - lo, item.mark, item.front, pass.carrier);
        height[needle - lo] = level + 1;
      }
      course(placedAt, passSection[index]!).passes.push(index);
    }
    // A pass that knits nothing sits on top of the last stitches its needles hold.
    const onNeedles = selected.filter((needle) => needle >= lo && needle <= hi);
    const at = placedAt ?? (row !== null && bodyBase !== null ? bodyBase + row + extra - 1 : bodyBase !== null && index < lastBody ? bodyTop : onNeedles.length > 0 ? Math.max(...onNeedles.map((needle) => height[needle - lo]!)) - 1 : null);
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
      row,
      course: placedAt,
      at: at !== null && at >= 0 ? at : null,
      section: passSection[index]!,
    };
  });
  // A design row whose passes are all linked to an earlier row leaves its course empty: close the gap.
  const kept: number[] = [];
  const renumber = new Map<number, number>();
  grid.forEach((item, index) => { if (item.passes.length > 0 || item.stitches.some((mark) => mark !== '.')) { renumber.set(index, kept.length); kept.push(index); } });
  const nearest = (index: number) => { for (let k = index; k >= 0; k--) { const to = renumber.get(k); if (to !== undefined) return to; } return null; };
  for (const pass of passes) { pass.course = pass.course === null ? null : nearest(pass.course); pass.at = pass.at === null ? null : nearest(pass.at); }
  const courses: KnitFileCourse[] = kept.map((index) => { const item = grid[index]!; return { stitches: item.stitches.join(''), carriers: item.carriers.join(''), passes: item.passes, row: item.row, section: item.section }; });

  return {
    passCount: trace.passes.length,
    lineCount: lineCount(kcode.kcText),
    needles: { lo, hi },
    courses,
    passes,
    sections,
  };
}

/** Lines in a text, counted without splitting it (a .kc can be megabytes). */
function lineCount(text: string): number {
  let count = 1;
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) count++;
  return count;
}

function sectionLabel(section: KnitFileSection, carriers: KnitFileCarriers, kind: KnitFileKind, nextRib: () => number, nextTop: () => number, allRib: boolean): string {
  switch (section.kind) {
    case 'waste': return 'Waste yarn';
    case 'draw': return 'Draw thread';
    case 'cast-on': return 'Cast-on';
    case 'rib': {
      const first = nextRib() === 0;
      if (!first) return 'Top rib';
      return allRib ? 'Rib' : kind === 'sleeve' || kind === 'beanie' ? 'Cuff rib' : kind === 'body' ? 'Hem rib' : 'Rib';
    }
    case 'body': return kind === 'panel' ? 'Pattern' : 'Body';
    case 'shoulders': return carriers.second ? `Neck split: left shoulder on C${carriers.main}, right on C${carriers.second}` : 'Shoulders';
    case 'top': return kind === 'beanie' ? (nextTop() === 0 ? 'Crown' : 'Gathered top') : section.carriers.includes(carriers.waste) ? 'Waste yarn on top' : 'Bind-off';
    case 'carriers-out': return 'Carriers out';
  }
}
