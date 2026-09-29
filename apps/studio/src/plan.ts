import {
  AUTHORED_CAPACITY_LIMITS_V1,
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
  rule: 'size-off-target' | 'size-needs-gauge' | 'gauge-assumed' | 'size-exceeds-capacity' | 'name-encodes-carrier';
  severity: 'error' | 'warning';
  path: string;
  message: string;
  /** Typed edits that clear this finding; re-planning with them applied is checked before they are offered. */
  fixes: { label: string; edits: ProjectEdit[] }[];
}

export interface ProjectPlan {
  piece: 'panel';
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
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

function perCm(gauge: ProjectGauge, dimension: 'width' | 'height'): number {
  return (dimension === 'width' ? gauge.stitchesPer10cm : gauge.rowsPer10cm) / 10;
}

function newRowIds(state: ProjectState, count: number): string[] {
  const taken = new Set(state.rowIds);
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
  if (dimension === 'width') {
    if (count > AUTHORED_CAPACITY_LIMITS_V1.chartWidth) return null;
    if (count * state.chart.height > AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState) return null;
    const edits: ProjectEdit[] = [];
    if (state.machine.needleOffset + count - 1 > 252) {
      edits.push({ kind: 'set-needle-offset', needleOffset: Math.floor((252 - count) / 2) + 1 });
    }
    edits.push({ kind: 'set-width', width: count, fillPaletteIndex: 0 });
    return edits;
  }
  if (count > AUTHORED_CAPACITY_LIMITS_V1.chartHeight) return null;
  if (count * state.chart.width > AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState) return null;
  return [{ kind: 'set-height', height: count, fillPaletteIndex: 0, newRowIds: newRowIds(state, Math.max(0, count - state.chart.height)) }];
}

const CARRIER_IN_NAME = /\bC([1-6])\b/;

export function planProject(state: ProjectState): ProjectPlan {
  const assignments = new Map(state.machine.yarnAssignments.map((item) => [item.paletteId, item]));
  const gauge = state.gauge ?? null;
  const target = state.target ?? null;
  const findings: PlanFinding[] = [];

  const predicted = gauge === null ? null : {
    widthCm: {
      value: round1(state.chart.width / perCm(gauge, 'width')),
      provenance: 'calculated' as const,
      how: `${state.chart.width} st ÷ ${gauge.stitchesPer10cm} st/10 cm`,
    },
    heightCm: {
      value: round1(state.chart.height / perCm(gauge, 'height')),
      provenance: 'calculated' as const,
      how: `${state.chart.height} rows ÷ ${gauge.rowsPer10cm} rows/10 cm`,
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
      const count = Math.max(1, Math.round(exact));
      const unit = dimension === 'width' ? 'st' : 'rows';
      const actual = dimension === 'width' ? state.chart.width : state.chart.height;
      const required: Valued<number> = {
        value: count,
        provenance: 'calculated',
        how: `${targetCm} cm × ${dimension === 'width' ? gauge.stitchesPer10cm : gauge.rowsPer10cm} ${unit}/10 cm = ${round1(exact)} → ${count}`,
      };
      const ok = actual === count;
      sizeChecks.push({ dimension, targetCm, required, actual, ok });
      if (ok) continue;
      const edits = resizeEdits(state, dimension, count);
      if (edits === null) {
        findings.push({
          rule: 'size-exceeds-capacity',
          severity: 'error',
          path: `target.${dimension}Cm`,
          message: `Target ${dimension} ${targetCm} cm needs ${count} ${unit}; the V1 bed and capacity cannot hold that (at most 252 needles, ${AUTHORED_CAPACITY_LIMITS_V1.chartHeight.toLocaleString('en-US')} rows, ${AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState.toLocaleString('en-US')} cells).`,
          fixes: [],
        });
        continue;
      }
      findings.push({
        rule: 'size-off-target',
        severity: 'warning',
        path: `target.${dimension}Cm`,
        message: `Target ${dimension} ${targetCm} cm needs ${count} ${unit} (${required.how}); the chart has ${actual} (${round1(actual / perCm(gauge, dimension))} cm).`,
        fixes: [{ label: `Resize the chart to ${count} ${unit}${count > actual ? ', filling new cells with palette 0' : ''}`, edits }],
      });
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

  return {
    piece: 'panel',
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
  };
}
