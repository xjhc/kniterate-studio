import { BIRDSEYE_BODY_EXTRA_FRONT_ROWS, CUSTOMIST_RIB_CROWN_194_V1, CUSTOMIST_RIB_CROWN_WIDTH, planEightLineCrown } from '@kniterate-studio/machine-lib/browser';
import { beanieObjectOf,
  AUTHORED_CAPACITY_LIMITS_V1,
  type ResolvedProjectPlacement,
  type ProjectEdit,
  type ProjectGauge,
  type ProjectState,
  type ProjectTarget,
} from '@kniterate-studio/project-contract';

/**
 * The Plan: sizing facts derived from a project's authored state, each with
 * where it came from. The chart's stitch and row counts are the only source
 * of truth for the program; gauge and target are checked against them, never
 * applied behind the author's back. Pure and browser-safe.
 */

export type Provenance = 'authored' | 'calculated' | 'measured' | 'assumed';

export interface Valued<T> {
  value: T;
  provenance: Provenance;
  /** Human-readable derivation, e.g. `25 cm × 26 st/10 cm = 65.0 → 65`. */
  how: string;
}

export interface SizeCheck {
  dimension: 'width' | 'height';
  targetCm: number;
  /** Stitches (width) or rows (height) the target calls for at this gauge. */
  required: Valued<number>;
  actual: number;
  ok: boolean;
}

export interface PlanFinding {
  rule: 'size-off-target' | 'size-needs-gauge' | 'gauge-assumed' | 'size-exceeds-capacity' | 'name-encodes-carrier' | 'cuff-off-target' | 'placement-size-off' | 'beanie-width-invalid';
  severity: 'error' | 'warning';
  path: string;
  message: string;
  /** Typed edits that clear this finding; re-planning with them applied is checked before they are offered. */
  fixes: { label: string; edits: ProjectEdit[] }[];
}

export interface ProjectPlan {
  piece: 'panel' | 'beanie';
  stitches: Valued<number>;
  rows: Valued<number>;
  /** One-based Knitout front-bed needles the chart occupies. */
  needles: { first: number; last: number };
  yarns: { paletteId: string; name: string; hex: string; carrier: string | null; yarnName: string | null }[];
  backing: ProjectState['strategy'];
  gauge: (ProjectGauge & { provenance: Provenance }) | null;
  predicted: { widthCm: Valued<number>; heightCm: Valued<number> } | null;
  target: ProjectTarget | null;
  sizeChecks: SizeCheck[];
  findings: PlanFinding[];
  /** Hand-finishing steps after the machine, in order. */
  finishing: string[];
  /** Beanie sections bottom to top, with knitted lengths under the recorded gauges; null for a panel. */
  sections: BeanieSections | null;
}

export interface BeanieSections {
  cuff: { rows: number; knittedCm: Valued<number> | null; visibleCm: Valued<number> | null; folds: boolean } | null;
  /** Knitted body rows: the chart's body rows plus any rows the backing adds (birdseye starts and joins its back layer). */
  body: { rows: number; chartRows: number; fabric: 'rib' | 'fairisle colorwork' | 'birdseye colorwork'; cm: Valued<number> | null };
  /**
   * Null when the width cannot take a crown (see beanie-width-invalid).
   * `needles`: the needles each crown row knits (offsets from the first), bottom row first, from the construction's own crown steps.
   */
  crown: { rows: number; recipe: string; finalStitches: number; needles: readonly (readonly number[])[]; cm: Valued<number> | null } | null;
  /** Visible cuff + body + crown, flat and unstretched; the crown's gathered top shortens it in wear. */
  finishedHeightCm: Valued<number> | null;
}

/** Default fit: 10% negative ease, so the hat stays on. */
export const DEFAULT_BEANIE_EASE = -0.1;

/** Flat 2×2 rib beanie: seam allowance, rib rounding, and width limits (see compileProject). */
const BEANIE = { seamStitches: 2, minNeedles: 60, maxNeedles: 244 } as const;

/** Stitches for a finished beanie circumference: plus seam stitches, kept at 2 (mod 4) so the rib is symmetric. */
function beanieNeedles(exactStitches: number): number {
  return 4 * Math.round(exactStitches / 4) + 2;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

function perCm(gauge: ProjectGauge, dimension: 'width' | 'height'): number {
  return (dimension === 'width' ? gauge.stitchesPer10cm : gauge.rowsPer10cm) / 10;
}

function newRowIds(state: ProjectState, count: number): string[] {
  // An ID still anchored by an override (even a quarantined one) must never be reused, or that override would revive on a new row.
  const taken = new Set([...state.rowIds, ...state.overrides.map((override) => override.anchor.rowId)]);
  const ids: string[] = [];
  for (let next = state.rowIds.length + 1; ids.length < count; next += 1) {
    const id = `row_${String(next).padStart(4, '0')}`;
    if (!taken.has(id)) ids.push(id);
  }
  return ids;
}

/** Edits that give the chart exactly `count` stitches or rows, or null when the bed or capacity cannot hold it. */
function resizeEdits(state: ProjectState, dimension: 'width' | 'height', count: number): ProjectEdit[] | null {
  if (count < 1) return null;
  const beanie = state.object?.kind === 'beanie';
  if (dimension === 'width') {
    if (count > AUTHORED_CAPACITY_LIMITS_V1.chartWidth) return null;
    if (beanie && (count < BEANIE.minNeedles || count > BEANIE.maxNeedles)) return null;
    if (count * state.chart.height > AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState) return null;
    // A beanie stays centred on the bed; a rectangle only moves when it would run off.
    const centred = Math.floor((252 - count) / 2) + 1;
    const move = beanie ? state.machine.needleOffset !== centred : state.machine.needleOffset + count - 1 > 252;
    const resize: ProjectEdit = { kind: 'set-width', width: count, fillPaletteIndex: 0 };
    if (!move) return [resize];
    const recentre: ProjectEdit = { kind: 'set-needle-offset', needleOffset: centred };
    // Every intermediate state must fit the bed: shrink before moving, move before growing.
    return count < state.chart.width ? [resize, recentre] : [recentre, resize];
  }
  if (count > AUTHORED_CAPACITY_LIMITS_V1.chartHeight) return null;
  if (count * state.chart.width > AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState) return null;
  return [{ kind: 'set-height', height: count, fillPaletteIndex: 0, newRowIds: newRowIds(state, Math.max(0, count - state.chart.height)) }];
}

/**
 * Rows added or removed at the cuff/body boundary (the cuff's top), so the
 * body rows and everything painted or placed on them keep their place
 * relative to the cuff. Added rows repeat the cuff's top row.
 */
function cuffBoundaryEdits(state: ProjectState, cuffRows: number, required: number): ProjectEdit[] | null {
  const height = state.chart.height;
  const bodyRows = height - cuffRows;
  if (bodyRows < 1 || cuffRows < 1) return null;
  const newHeight = height + required - cuffRows;
  if (newHeight > AUTHORED_CAPACITY_LIMITS_V1.chartHeight || newHeight * state.chart.width > AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState) return null;
  // Rows are stored top first: the cuff is the last `cuffRows` rows, its top row at index `bodyRows`.
  const cuffTop = state.chart.cells[bodyRows]!;
  // One bulk edit, so a large cuff change stays one small, undoable operation.
  if (required > cuffRows) {
    return [{ kind: 'insert-rows', afterRowId: state.rowIds[bodyRows - 1]!, rows: newRowIds(state, required - cuffRows).map((rowId) => ({ rowId, cells: [...cuffTop] })) }];
  }
  return [{ kind: 'delete-rows', rowIds: state.rowIds.slice(bodyRows, bodyRows + cuffRows - required) }];
}

const CARRIER_IN_NAME = /\bC([1-6])\b/;

/** Whether the beanie construction can knit this width (compileProject enforces the same limits). */
function beanieWidthOk(width: number): boolean {
  return width % 2 === 0 && width >= BEANIE.minNeedles && width <= BEANIE.maxNeedles;
}

/** The needles (offsets from the first) each knitted crown row uses, bottom row first. */
function crownNeedles(steps: typeof CUSTOMIST_RIB_CROWN_194_V1): number[][] {
  return steps.flatMap((step) => (step[0] === 'k' ? [[...new Set([...step[6], ...step[7]])].sort((a, b) => a - b)] : []));
}

/** Crown rows, final stitches and needles the beanie construction will knit at this width, or null when it cannot. */
function crownFor(width: number, jersey: boolean): { rows: number; recipe: string; finalStitches: number; needles: number[][] } | null {
  if (!beanieWidthOk(width)) return null;
  if (!jersey && width === CUSTOMIST_RIB_CROWN_WIDTH) {
    const knits = CUSTOMIST_RIB_CROWN_194_V1.filter((step) => step[0] === 'k');
    const last = knits.at(-1);
    return { rows: knits.length, recipe: "Customist's own (reference/2x2-rib-beanie.kc)", finalStitches: last?.[0] === 'k' ? last[6].length : 0, needles: crownNeedles(CUSTOMIST_RIB_CROWN_194_V1) };
  }
  const plan = planEightLineCrown(width, '+', jersey ? 'jersey' : 'rib');
  return { rows: plan.steps.filter((step) => step[0] === 'k').length, recipe: `eight-line (${jersey ? 'jersey' : 'rib'})`, finalStitches: plan.counts.at(-1)!, needles: crownNeedles(plan.steps) };
}

export function planProject(state: ProjectState, placements: readonly ResolvedProjectPlacement[] = []): ProjectPlan {
  const assignments = new Map(state.machine.yarnAssignments.map((item) => [item.paletteId, item]));
  const gauge = state.gauge ?? null;
  // A beanie's fit intent (head circumference and ease) is its finished-circumference target.
  const head = state.object?.kind === 'beanie' ? state.object.headCircumferenceCm : undefined;
  const ease = beanieObjectOf(state)?.ease ?? DEFAULT_BEANIE_EASE;
  const target: ProjectTarget | null = head === undefined
    ? state.target ?? null
    : { ...state.target, widthCm: round1(head * (1 + ease)) };
  const findings: PlanFinding[] = [];
  const beanie = state.object?.kind === 'beanie';
  // A cuff-and-body beanie: the height target is the body above the rib cuff.
  const beanieObject = beanieObjectOf(state);
  const cuffRows = beanieObject?.construction === 'rib-cuff-jersey-body' ? Math.min(beanieObject.cuffRows ?? 0, state.chart.height) : 0;
  // Ground rows the construction knits in the body beyond the chart's (a birdseye body starts and joins its back layer).
  const bodyExtraRows = cuffRows > 0 && state.strategy.technique === 'birdseye' ? BIRDSEYE_BODY_EXTRA_FRONT_ROWS : 0;

  // Sizes predicted from an assumed gauge are assumptions, not calculations from measurements.
  const gaugeProvenance: Provenance = gauge?.source === 'assumed' ? 'assumed' : 'calculated';
  const predicted = gauge === null ? null : {
    widthCm: beanie
      ? {
          value: round1((state.chart.width - BEANIE.seamStitches) / perCm(gauge, 'width')),
          provenance: gaugeProvenance,
          how: `finished circumference: (${state.chart.width} − ${BEANIE.seamStitches} seam st) ÷ ${gauge.stitchesPer10cm} st/10 cm`,
        }
      : {
          value: round1(state.chart.width / perCm(gauge, 'width')),
          provenance: gaugeProvenance,
          how: `${state.chart.width} st ÷ ${gauge.stitchesPer10cm} st/10 cm`,
        },
    heightCm: {
      value: round1((state.chart.height - cuffRows + bodyExtraRows) / perCm(gauge, 'height')),
      provenance: gaugeProvenance,
      how: cuffRows > 0
        ? `body: (${state.chart.height} − ${cuffRows} cuff rows${bodyExtraRows ? ` + ${bodyExtraRows} birdseye start/join rows` : ''}) ÷ ${gauge.rowsPer10cm} rows/10 cm`
        : `${state.chart.height} rows ÷ ${gauge.rowsPer10cm} rows/10 cm`,
    },
  };

  const sizeChecks: SizeCheck[] = [];
  if (target !== null && gauge === null) {
    findings.push({
      rule: 'size-needs-gauge',
      severity: 'warning',
      path: 'gauge',
      message: 'A target size is set but no gauge is recorded, so stitch and row counts cannot be derived. Measure a swatch and record it with set-gauge.',
      fixes: [],
    });
  }
  if (target !== null && gauge !== null) {
    if (gauge.source === 'assumed') {
      findings.push({
        rule: 'gauge-assumed',
        severity: 'warning',
        path: 'gauge',
        message: `Sizing uses an assumed gauge (${gauge.stitchesPer10cm} st / ${gauge.rowsPer10cm} rows per 10 cm). Finished size is unverified until a swatch is measured.`,
        fixes: [],
      });
    }
    for (const dimension of ['width', 'height'] as const) {
      const targetCm = dimension === 'width' ? target.widthCm : target.heightCm;
      if (targetCm === undefined) continue;
      const exact = targetCm * perCm(gauge, dimension);
      const beanieWidth = beanie && dimension === 'width';
      const count = beanieWidth ? beanieNeedles(exact) : Math.max(1, Math.round(exact));
      const unit = dimension === 'width' ? 'st' : 'rows';
      const actual = dimension === 'width' ? state.chart.width : state.chart.height - cuffRows + bodyExtraRows;
      const required: Valued<number> = {
        value: count,
        provenance: 'calculated',
        how: beanieWidth
          ? `${head !== undefined ? `${head} cm head × (1 ${ease < 0 ? '−' : '+'} ${round1(Math.abs(ease) * 100)}% ease) = ` : ''}${targetCm} cm finished circumference × ${gauge.stitchesPer10cm} st/10 cm = ${round1(exact)} st, + ${BEANIE.seamStitches} seam stitches, rounded to 2 (mod 4) → ${count}`
          : `${targetCm} cm × ${dimension === 'width' ? gauge.stitchesPer10cm : gauge.rowsPer10cm} ${unit}/10 cm = ${round1(exact)} → ${count}`,
      };
      const ok = actual === count;
      sizeChecks.push({ dimension, targetCm, required, actual, ok });
      if (ok) continue;
      const edits = resizeEdits(state, dimension, dimension === 'height' ? count + cuffRows - bodyExtraRows : count);
      if (edits === null) {
        findings.push({
          rule: 'size-exceeds-capacity',
          severity: 'error',
          path: `target.${dimension}Cm`,
          message: beanieWidth
            ? `A ${targetCm} cm finished circumference needs ${count} needles; the flat 2x2 rib beanie supports ${BEANIE.minNeedles} to ${BEANIE.maxNeedles}.`
            : `Target ${dimension} ${targetCm} cm needs ${count} ${unit}; the V1 bed and capacity cannot hold that (at most 252 needles, ${AUTHORED_CAPACITY_LIMITS_V1.chartHeight.toLocaleString('en-US')} rows, ${AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState.toLocaleString('en-US')} cells).`,
          fixes: [],
        });
        continue;
      }
      findings.push({
        rule: 'size-off-target',
        severity: 'warning',
        path: `target.${dimension}Cm`,
        message: `Target ${dimension} ${targetCm} cm needs ${count} ${unit} (${required.how}); ${dimension === 'height' && bodyExtraRows > 0 ? `the body knits ${actual} (${actual - bodyExtraRows} chart rows + ${bodyExtraRows} birdseye start/join rows)` : `the chart has ${actual}`} (${round1(actual / perCm(gauge, dimension))} cm).`,
        fixes: [{ label: `Resize the chart to ${count} ${unit}${count > actual ? ', filling new cells with palette 0' : ''}`, edits }],
      });
    }
  }

  if (beanie && !beanieWidthOk(state.chart.width)) {
    // Prefer the width the fit target asks for; otherwise the nearest valid one.
    const targeted = sizeChecks.find((check) => check.dimension === 'width')?.required.value;
    const nearest = targeted !== undefined && beanieWidthOk(targeted) ? targeted : Math.min(BEANIE.maxNeedles, Math.max(BEANIE.minNeedles, beanieNeedles(state.chart.width - 2)));
    const edits = resizeEdits(state, 'width', nearest);
    findings.push({
      rule: 'beanie-width-invalid',
      severity: 'error',
      path: 'chart.width',
      message: `A beanie needs an even width from ${BEANIE.minNeedles} to ${BEANIE.maxNeedles} needles; this one has ${state.chart.width}, so its crown cannot be planned.`,
      fixes: edits === null ? [] : [{ label: `Make it ${nearest} needles`, edits }],
    });
  }

  const object = beanieObjectOf(state);
  const ribGauge = object?.ribGauge ?? null;
  const fold = object?.cuffFold === true;
  // Cuff intent: visible height × (2 when it folds up) at the rib's row gauge.
  if (cuffRows > 0 && object?.cuffTargetCm !== undefined) {
    if (ribGauge === null) {
      findings.push({ rule: 'size-needs-gauge', severity: 'warning', path: 'object.ribGauge', message: 'A cuff height is requested but no 2x2 rib gauge is recorded, so its rows cannot be derived.', fixes: [] });
    } else {
      if (ribGauge.source === 'assumed') {
        findings.push({ rule: 'gauge-assumed', severity: 'warning', path: 'object.ribGauge', message: `The cuff uses an assumed 2x2 rib gauge (${ribGauge.stitchesPer10cm} st / ${ribGauge.rowsPer10cm} rows per 10 cm). Its height is unverified until a rib swatch is measured.`, fixes: [] });
      }
      const exact = (object.cuffTargetCm * (fold ? 2 : 1) * ribGauge.rowsPer10cm) / 10;
      const required = Math.max(2, Math.round(exact));
      if (required !== cuffRows) {
        const height = cuffBoundaryEdits(state, cuffRows, required);
        findings.push({
          rule: 'cuff-off-target',
          severity: 'warning',
          path: 'object.cuffRows',
          message: `The cuff should be ${required} rows (${object.cuffTargetCm} cm visible${fold ? ' × 2 folded' : ''} × ${ribGauge.rowsPer10cm} rows/10 cm = ${round1(exact)}); it has ${cuffRows}.`,
          fixes: height === null ? [] : [{ label: `Make the cuff ${required} rows; the body and everything on it stay as they are`, edits: [...height, { kind: 'set-object', object: { ...object, cuffRows: required } }] }],
        });
      }
    }
  }
  // Motif size intent: an image placed at a height in cm should span that many rows at the body gauge.
  if (gauge !== null) {
    for (const resolved of placements) {
      const source = resolved.placement.source;
      if (source === undefined) continue;
      // Converted at another gauge (either axis), the motif is stretched or squashed at this one.
      const stale = source.gauge !== undefined
        ? source.gauge.stitchesPer10cm !== gauge.stitchesPer10cm || source.gauge.rowsPer10cm !== gauge.rowsPer10cm
        : Math.abs(Math.max(1, Math.round((source.heightCm * gauge.rowsPer10cm) / 10)) - resolved.placement.motif.height) > 1;
      if (stale) {
        findings.push({
          rule: 'placement-size-off',
          severity: 'warning',
          path: `placements/${resolved.placement.id}`,
          message: `Placement "${resolved.placement.id}" was converted ${source.gauge ? `at ${source.gauge.stitchesPer10cm} st / ${source.gauge.rowsPer10cm} rows per 10 cm` : 'at another gauge'}; the project gauge is now ${gauge.stitchesPer10cm} / ${gauge.rowsPer10cm}, so the ${source.heightCm} cm motif would knit distorted. Re-convert it from its stored image (studio place --refresh ${resolved.placement.id}, or Refresh in the motif inspector).`,
          fixes: [],
        });
      }
    }
  }

  const yarns = state.chart.palette.map((entry) => {
    const assignment = assignments.get(entry.id);
    const named = assignment?.yarnName.match(CARRIER_IN_NAME);
    if (assignment !== undefined && named && named[1] !== assignment.carrier) {
      const stripped = assignment.yarnName.replace(/\s*[([]?\bC[1-6]\b[)\]]?/, '').trim() || entry.id;
      findings.push({
        rule: 'name-encodes-carrier',
        severity: 'warning',
        path: `yarns/${entry.id}`,
        message: `Yarn "${assignment.yarnName}" names carrier C${named[1]} but is loaded on C${assignment.carrier}. Keep carrier numbers out of yarn names.`,
        fixes: [{ label: `Rename the yarn to "${stripped}"`, edits: [{ kind: 'set-yarn-assignment', assignment: { ...assignment, yarnName: stripped } }] }],
      });
    }
    return { paletteId: entry.id, name: entry.name, hex: entry.hex, carrier: assignment?.carrier ?? null, yarnName: assignment?.yarnName ?? null };
  });

  const finishing = beanie
    ? [
        'The top comes off the machine as live stitches (the last front loops are dropped). Thread the main-yarn tail through the top stitches straight away, before they ladder, and pull them closed.',
        'Pull the draw thread (C1) to separate the waste yarn from the cast-on edge.',
        'Sew the two long edges together with mattress stitch, one stitch in from each edge, from the crown down to the brim. Where the brim will fold up, sew from the other side so the seam is hidden.',
        ...(beanieObjectOf(state)?.cuffFold ? [`Fold the rib cuff up along its middle (the cuff is ${cuffRows} rows, so fold at row ${Math.floor(cuffRows / 2)}); the folded half shows the rib's reverse, which looks the same for 2x2 rib.`] : []),
        'Weave in the ends. Wash or steam as the yarn label says, then measure.',
      ]
    : ['Pull the draw thread (C1) to separate the waste yarn from the cast-on edge.', 'Weave in the ends. Wash or steam as the yarn label says, then measure.'];

  let sections: BeanieSections | null = null;
  if (beanie) {
    const jersey = cuffRows > 0;
    const chartBodyRows = state.chart.height - cuffRows;
    const birdseye = bodyExtraRows > 0;
    const bodyRows = chartBodyRows + bodyExtraRows;
    const crown = crownFor(state.chart.width, jersey);
    const rowsCm = (rows: number, g: ProjectGauge | null, label: string): Valued<number> | null => g === null ? null : {
      value: round1(rows / perCm(g, 'height')),
      provenance: g.source === 'assumed' ? 'assumed' : 'calculated',
      how: `${rows} ${label} rows ÷ ${g.rowsPer10cm} rows/10 cm${g.source === 'assumed' ? ' (assumed gauge)' : ''}`,
    };
    const cuffKnitted = jersey ? rowsCm(cuffRows, ribGauge, 'cuff') : null;
    const cuffVisible = cuffKnitted === null ? null : fold
      ? { value: round1(cuffRows / perCm(ribGauge!, 'height') / 2), provenance: ribGauge!.source === 'assumed' ? 'assumed' as const : 'calculated' as const, how: `half of the knitted cuff (it folds up): ${cuffRows} rows ÷ ${ribGauge!.rowsPer10cm} rows/10 cm ÷ 2` }
      : cuffKnitted;
    const bodyRowsCm = rowsCm(bodyRows, gauge, jersey ? 'body' : 'rib');
    const bodyCm = bodyRowsCm === null || !birdseye ? bodyRowsCm : {
      ...bodyRowsCm,
      how: `${bodyRowsCm.how}; ${chartBodyRows} chart rows + ${bodyExtraRows} ground rows that start and join the birdseye back; the gauge must be measured on birdseye fabric`,
    };
    // The crown is plain jersey; no jersey gauge is recorded, so its length is estimated with the body gauge.
    const crownRowsCm = crown === null ? null : rowsCm(crown.rows, gauge, 'crown');
    const crownCm = crownRowsCm === null ? null : jersey
      ? { ...crownRowsCm, provenance: 'assumed' as const, how: `${crownRowsCm.how}; estimated with the body gauge, since the plain jersey crown has no gauge of its own` }
      : crownRowsCm;
    const parts = [cuffVisible, bodyCm, crownCm];
    sections = {
      cuff: jersey ? { rows: cuffRows, knittedCm: cuffKnitted, visibleCm: cuffVisible, folds: fold } : null,
      body: { rows: bodyRows, chartRows: chartBodyRows, fabric: birdseye ? 'birdseye colorwork' : jersey ? 'fairisle colorwork' : 'rib', cm: bodyCm },
      crown: crown === null ? null : { rows: crown.rows, recipe: crown.recipe, finalStitches: crown.finalStitches, needles: crown.needles, cm: crownCm },
      finishedHeightCm: parts.some((part, index) => part === null && (index > 0 || jersey)) ? null : {
        value: round1(parts.reduce((sum, part) => sum + (part?.value ?? 0), 0)),
        provenance: parts.some((part) => part?.provenance === 'assumed') ? 'assumed' : 'calculated',
        how: `${jersey ? `visible cuff ${cuffVisible!.value} + ` : ''}body ${bodyCm!.value} + crown ${crownCm!.value} cm, flat and unstretched; the crown is measured along its knitted length and the gathered top shortens it in wear`,
      },
    };
  }

  return {
    sections,
    piece: beanie ? 'beanie' : 'panel',
    stitches: { value: state.chart.width, provenance: 'authored', how: 'chart width' },
    rows: { value: state.chart.height, provenance: 'authored', how: 'chart height' },
    needles: { first: state.machine.needleOffset, last: state.machine.needleOffset + state.chart.width - 1 },
    yarns,
    backing: state.strategy,
    gauge: gauge === null ? null : { ...gauge, provenance: gauge.source },
    predicted,
    target,
    sizeChecks,
    findings,
    finishing,
  };
}
