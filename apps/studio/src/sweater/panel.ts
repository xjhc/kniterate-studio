import {
  appendProjectOperation,
  createColorworkProjectV1,
  panelObjectOf,
  type ColorworkProjectV1,
  type PanelObject,
  type ProjectEdit,
  type ProjectEditEntry,
  type ProjectGauge,
  type ProjectState,
} from '@kniterate-studio/project-contract';
import type { DraftPiece } from './draft';
import { rasterizePiece } from './rasterize';
import { BED_CENTRE, DEFAULT_RIB_GAUGE, SWEATER_DRAW_CARRIER, SWEATER_MAX_NEEDLES, SWEATER_WASTE_CARRIER, yarnEstimate, type PiecesPlan, type SweaterPieceFinding, type SweaterPiecePlan } from './sweater';
import { TEXTURES, textureById, textureMatching, textureProblem } from './textures';

/**
 * A one-yarn scarf or blanket: one flat rectangle in any stitch, with an
 * optional rib band at each end. It is planned and compiled exactly like a
 * sweater piece (the same rasterizer, construction, checks and verdict).
 */

export interface PanelIntent {
  title: string;
  widthCm: number;
  lengthCm: number;
  textureId: string;
  /** A rib band at each end; `cm` 0 for none. */
  ends?: { rib: string; cm: number };
  yarn: { name: string; hex: string };
  gauge?: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'>;
  ribGauge?: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'>;
}

export interface PanelPlan extends PiecesPlan {
  object: PanelObject;
  /** The panel as knitted. */
  knitted: { widthCm: number; lengthCm: number; stitches: number; rows: number } | null;
}

export function panelObjectFor(intent: PanelIntent): PanelObject {
  const texture = textureById(intent.textureId) ?? TEXTURES[0]!;
  return {
    kind: 'panel',
    widthCm: intent.widthCm,
    lengthCm: intent.lengthCm,
    body: { name: texture.name, texture: [...texture.rows] },
    ends: intent.ends ?? { rib: 'kkpp', cm: 0 },
    ribGauge: { ...(intent.ribGauge ?? { ...DEFAULT_RIB_GAUGE, source: 'assumed' as const }) },
  };
}

/** A new one-yarn panel project. The chart holds only the yarn. */
export function createPanelProject(intent: PanelIntent, options: { id: string; source: ProjectEditEntry['source']; group: string }): ColorworkProjectV1 {
  const texture = textureById(intent.textureId) ?? TEXTURES[0]!;
  const chart = {
    kind: 'knitlab-colorwork-chart' as const, version: 1 as const, title: intent.title, width: 1, height: 1, rowNumbering: 'bottom-up' as const,
    palette: [{ id: 'main', name: intent.yarn.name, hex: intent.yarn.hex }],
    cells: [[0]],
  };
  const project = createColorworkProjectV1(chart, { id: options.id, title: intent.title });
  const edits: ProjectEdit[] = [
    { kind: 'set-object', object: panelObjectFor(intent) },
    { kind: 'set-yarn-assignment', assignment: { paletteId: 'main', carrier: '3', yarnName: intent.yarn.name } },
    { kind: 'set-gauge', gauge: { ...(intent.gauge ?? { ...texture.gauge, source: 'assumed' as const }) } },
  ];
  return appendProjectOperation(project, { group: options.group, source: options.source, label: `Create ${intent.title}`, edits });
}

/** The edit that replaces the panel's design with `next`. */
export function panelEdit(next: PanelObject): ProjectEdit {
  return { kind: 'set-object', object: next };
}

/** The panel's one piece: a rectangle, centred on the bed, with its rib ends. */
function panelDraft(object: PanelObject): DraftPiece {
  const half = object.widthCm / 2;
  const ends = object.ends.cm > 0 ? object.ends.cm : 0;
  return {
    id: 'panel',
    name: object.widthCm >= 60 ? 'Blanket' : 'Scarf',
    copies: 1,
    outline: [{ x: -half, y: 0 }, { x: half, y: 0 }, { x: half, y: object.lengthCm }, { x: -half, y: object.lengthCm }],
    bottomRibCm: ends,
    topRibCm: ends,
    allRib: false,
    edges: { hem: [{ x: -half, y: 0 }, { x: half, y: 0 }], side: [{ x: half, y: 0 }, { x: half, y: object.lengthCm }], top: [{ x: -half, y: object.lengthCm }, { x: half, y: object.lengthCm }] },
  };
}

export function planPanel(state: ProjectState): PanelPlan {
  const object = panelObjectOf(state);
  if (object === undefined) throw new Error('This project is not a one-yarn panel.');
  const gauge = state.gauge ?? { ...(textureMatching(object.body.texture)?.gauge ?? TEXTURES[0]!.gauge), source: 'assumed' as const };
  const ribGauge = object.ribGauge ?? { ...DEFAULT_RIB_GAUGE, source: 'assumed' as const };
  const findings: SweaterPieceFinding[] = [];
  const problem = textureProblem(object.body.texture);
  if (problem !== null) findings.push({ rule: 'sweater-texture-unknittable', severity: 'error', piece: null, path: 'object.body.texture', message: problem });
  const draft = panelDraft(object);
  let piece: SweaterPiecePlan;
  try {
    const raster = rasterizePiece({ piece: draft, gauge, ribGauge, texture: problem === null ? object.body.texture : ['k'], rib: object.ends.rib, topRib: object.ends.rib, centre: BED_CENTRE });
    piece = { id: 'panel', name: draft.name, copies: 1, draft, raster, error: null };
  } catch (error) {
    piece = { id: 'panel', name: draft.name, copies: 1, draft, raster: null, error: error instanceof Error ? error.message : String(error) };
  }
  if (gauge.source === 'assumed') findings.push({ rule: 'gauge-assumed', severity: 'warning', piece: null, path: 'gauge', message: `Gauge ${gauge.stitchesPer10cm} st / ${gauge.rowsPer10cm} rows per 10 cm is a guess: measure a ${object.body.name.toLowerCase()} swatch.` });
  if (object.ends.cm > 0 && ribGauge.source === 'assumed') findings.push({ rule: 'gauge-assumed', severity: 'warning', piece: null, path: 'object.ribGauge', message: `Rib gauge ${ribGauge.rowsPer10cm} rows per 10 cm is a guess: measure a rib swatch.` });
  const raster = piece.raster;
  if (piece.error !== null) findings.push({ rule: 'sweater-piece-unplanned', severity: 'error', piece: 'panel', path: 'pieces/panel', message: `${piece.name}: ${piece.error}` });
  else if (raster!.realized.widestStitches > SWEATER_MAX_NEEDLES) findings.push({ rule: 'sweater-piece-too-wide', severity: 'error', piece: 'panel', path: 'pieces/panel', message: `${piece.name} is ${raster!.realized.widestStitches} stitches wide (${raster!.realized.widthCm} cm); the bed takes ${SWEATER_MAX_NEEDLES}. Make it narrower or use a finer gauge.` });
  return {
    object,
    gauge,
    ribGauge,
    pieces: [piece],
    carriers: { main: state.machine.yarnAssignments.find((item) => item.paletteId === state.chart.palette[0]?.id)?.carrier ?? '3', second: null, waste: SWEATER_WASTE_CARRIER, draw: SWEATER_DRAW_CARRIER },
    findings,
    yarn: yarnEstimate([piece]),
    knitted: raster ? { widthCm: raster.realized.widthCm, lengthCm: raster.realized.heightCm, stitches: raster.realized.castOnStitches, rows: raster.rows.length } : null,
  };
}
