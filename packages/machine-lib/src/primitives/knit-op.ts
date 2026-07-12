export const KNIT_OPS = [
  'knit',
  'purl',
  'no-stitch',
  'tuck',
  // B-1 brioche (2026-06-09): back-bed twin of 'tuck'. Tucks the column's
  // held back-bed loop (machine brioche / half-cardigan row vocabulary).
  // Machine-only: the hand-knit equivalent (brk/brp with yarnover pairs)
  // is a different stitch grammar and is not modeled.
  'tuck-back',
  'yarn-over',
  'k2tog',
  'ssk',
  'sk2p',
  'k3tog',
  'sssk',
  'p2tog',
  'ssp',
  'sp2p',
  'p3tog',
  'sssp',
  'sl-wyif',
  'sl-wyib',
  'k-tbl',
  'p-tbl',
  'kfb',
  'pfb',
  'knit-below',
  'mb',
  'kpk-in-1',
  'm1l',
  'm1r',
  // Batch D Phase 1 (2026-05-22): 1×1 twists (no cable needle needed) and
  // cables-over-purl (LPC/RPC). All `stitchDelta: 0`. LT/RT are mechanically
  // identical to C2F/C2B (width=2 symmetric cross); LPC/RPC are asymmetric
  // crosses where the worked side passes over a purl background.
  'lt',
  'rt',
  'lpc-1-1',
  'lpc-1-2',
  'lpc-2-1',
  'rpc-1-1',
  'rpc-1-2',
  'rpc-2-1',
  // Structural-soundness goal (2026-05-23): fully-fashioned lateral shift,
  // per-stitch primitive. Each shift-1-L / shift-1-R is a 1-cell DESTINATION
  // marker (semantic op resolves to 'knit'); the matching source no-stitch
  // sits one knitting-prev row + one column toward the source side and is
  // auto-painted by the paint path. Adjacent runs of shift-1-L (or -R) cells
  // in a row compose into a single rack-and-xfer dance — the walker reads
  // composed ChartShiftEvents from shift-events-from-chart. stitchDelta is
  // 0; the row preserves total stitch count (destination cells balance the
  // newly-deactivated source columns one row back).
  'shift-1-l',
  'shift-1-r',
  // Batch D Phase 3 (2026-05-22): purl-symmetry + drop. M1Lp/M1Rp are
  // purl-face left/right-leaning make-1 increases (+1). p1-below is the
  // purl-face row-below pickup (0, hand-knit only). drop-st releases a
  // stitch column on hand-knit (0 delta on the paint row; subsequent
  // rows must be no-stitch in the dropped column).
  'm1lp',
  'm1rp',
  'p1-below',
  'drop-st',
  // Milestone B (2026-05-26): machine annotation palette ops. These are
  // triggered via palette key clicks that activate an annotation tool rather
  // than placing a cell stitch. They extend the op union so the palette
  // entry type-checks without widening KnitlabKeyDefinition.op to string.
  'rack-plus-1',
  'rack-minus-1',
  'wt-left',
  'wt-right',
  // Carriage pause: clicking the palette key activates Tool.Pause; the knitout
  // `pause` op fires via row annotation, not per-cell stitch placement.
  'pause',
] as const;

export type KnitOp = (typeof KNIT_OPS)[number];

export type KnitSurface = 'colorwork' | 'hand-knit' | 'kniterate';

export type DecreaseLean = 'left' | 'right' | 'center';

export interface DecreaseSpan {
  consumes: number;
  produces: 1;
  /** Source stitch columns relative to the result-row cell. Includes 0. */
  sourceOffsets: readonly number[];
  lean: DecreaseLean;
}

export interface KnitPrimitiveDefinition {
  op: KnitOp;
  label: string;
  offeredIn: readonly KnitSurface[];
  validIn: readonly KnitSurface[];
  stitchDelta: number | null;
  decreaseSpan?: DecreaseSpan;
  bedEffect: string;
  machineTechnique: string | null;
  instructionAbbreviation: string;
}

export const KNIT_PRIMITIVES: readonly KnitPrimitiveDefinition[] = [
  {
    op: 'knit',
    label: 'Knit',
    offeredIn: ['colorwork', 'hand-knit', 'kniterate'],
    validIn: ['colorwork', 'hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'keep-or-knit-active-bed',
    machineTechnique: 'knit-active-bed',
    instructionAbbreviation: 'K',
  },
  {
    op: 'purl',
    label: 'Purl',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'use-back-bed',
    machineTechnique: 'back-bed-route-or-transfer',
    instructionAbbreviation: 'P',
  },
  {
    op: 'no-stitch',
    label: 'No stitch',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['colorwork', 'hand-knit', 'kniterate'],
    stitchDelta: null,
    bedEffect: 'inactive-cell',
    machineTechnique: 'skip',
    instructionAbbreviation: '',
  },
  {
    op: 'tuck',
    label: 'Tuck',
    offeredIn: ['kniterate'],
    validIn: ['kniterate'],
    stitchDelta: 0,
    bedEffect: 'add-tuck-on-active-bed',
    machineTechnique: 'tuck-active-carrier',
    instructionAbbreviation: 'Tk',
  },
  {
    op: 'tuck-back',
    label: 'Tuck (back bed)',
    offeredIn: ['kniterate'],
    validIn: ['kniterate'],
    stitchDelta: 0,
    bedEffect: 'add-tuck-on-back-bed',
    machineTechnique: 'tuck-back-bed',
    instructionAbbreviation: 'TkB',
  },
  {
    op: 'yarn-over',
    label: 'Yarn over',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 1,
    bedEffect: 'wrap-on-empty-needle',
    machineTechnique: 'knit-empty-needle-wrap-becomes-loop',
    instructionAbbreviation: 'YO',
  },
  {
    op: 'k2tog',
    label: 'K2tog',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: -1,
    decreaseSpan: { consumes: 2, produces: 1, sourceOffsets: [0, 1], lean: 'right' },
    bedEffect: 'merge-loops-right-leaning',
    machineTechnique: 'choose-decrease-technique',
    instructionAbbreviation: 'k2tog',
  },
  {
    op: 'ssk',
    label: 'SSK',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: -1,
    decreaseSpan: { consumes: 2, produces: 1, sourceOffsets: [-1, 0], lean: 'left' },
    bedEffect: 'merge-loops-left-leaning',
    machineTechnique: 'choose-decrease-technique',
    instructionAbbreviation: 'ssk',
  },
  {
    op: 'sk2p',
    label: 'SK2P (sl1-k2tog-psso)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: -2,
    decreaseSpan: { consumes: 3, produces: 1, sourceOffsets: [-1, 0, 1], lean: 'center' },
    bedEffect: 'merge-three-loops-centered',
    machineTechnique: 'centered-double-decrease',
    instructionAbbreviation: 'sk2p',
  },
  {
    op: 'k3tog',
    label: 'K3tog (double dec, right-leaning)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: -2,
    decreaseSpan: { consumes: 3, produces: 1, sourceOffsets: [-2, -1, 0], lean: 'right' },
    bedEffect: 'merge-three-loops-right-leaning',
    machineTechnique: 'right-leaning-double-decrease',
    instructionAbbreviation: 'k3tog',
  },
  {
    op: 'sssk',
    label: 'SSSK (double dec, left-leaning)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: -2,
    decreaseSpan: { consumes: 3, produces: 1, sourceOffsets: [0, 1, 2], lean: 'left' },
    bedEffect: 'merge-three-loops-left-leaning',
    machineTechnique: 'left-leaning-double-decrease',
    instructionAbbreviation: 'sssk',
  },
  {
    op: 'p2tog',
    label: 'P2tog (purl 2 together)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: -1,
    decreaseSpan: { consumes: 2, produces: 1, sourceOffsets: [0, 1], lean: 'right' },
    bedEffect: 'merge-loops-purl-face',
    machineTechnique: 'choose-decrease-technique',
    instructionAbbreviation: 'p2tog',
  },
  {
    op: 'ssp',
    label: 'SSP (slip slip purl, left-leaning purl decrease)',
    // 2026-05-29: surfaced in kniterate to mirror SSK. Purl-face machine
    // lowering is preview-grade (same caveat as P2tog) — it reuses SSK's
    // decrease technique rather than a true purl-bed route.
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: -1,
    decreaseSpan: { consumes: 2, produces: 1, sourceOffsets: [-1, 0], lean: 'left' },
    bedEffect: 'merge-loops-purl-face-left-leaning',
    machineTechnique: 'choose-decrease-technique',
    instructionAbbreviation: 'ssp',
  },
  {
    // 2026-05-29: centered purl double decrease (sl1-p2tog-psso), the purl
    // mirror of SK2P. Rare but completes the purl decrease family. Purl-face
    // machine lowering is preview-grade (reuses SK2P's centered technique).
    op: 'sp2p',
    label: 'SP2P (sl1-p2tog-psso, centered purl double dec)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: -2,
    decreaseSpan: { consumes: 3, produces: 1, sourceOffsets: [-1, 0, 1], lean: 'center' },
    bedEffect: 'merge-three-loops-purl-face',
    machineTechnique: 'centered-double-decrease',
    instructionAbbreviation: 'sp2p',
  },
  {
    op: 'p3tog',
    label: 'P3tog (purl 3 together)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: -2,
    decreaseSpan: { consumes: 3, produces: 1, sourceOffsets: [-2, -1, 0], lean: 'right' },
    bedEffect: 'merge-three-loops-purl-face',
    machineTechnique: 'right-leaning-double-decrease',
    instructionAbbreviation: 'p3tog',
  },
  {
    // 2026-05-29: left-leaning purl double decrease, the purl mirror of SSSK.
    // Completes the purl decrease family. Preview-grade machine lowering
    // (reuses SSSK's left-leaning technique).
    op: 'sssp',
    label: 'SSSP (left-leaning purl double dec)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: -2,
    decreaseSpan: { consumes: 3, produces: 1, sourceOffsets: [0, 1, 2], lean: 'left' },
    bedEffect: 'merge-three-loops-purl-face',
    machineTechnique: 'left-leaning-double-decrease',
    instructionAbbreviation: 'sssp',
  },
  {
    op: 'sl-wyif',
    label: 'Slip 1 wyif (purlwise, yarn in front)',
    offeredIn: ['hand-knit'],
    validIn: ['hand-knit'],
    stitchDelta: 0,
    bedEffect: 'skip-active-needle-yarn-front',
    machineTechnique: null,
    instructionAbbreviation: 'sl wyif',
  },
  {
    op: 'sl-wyib',
    label: 'Slip 1 wyib (purlwise, yarn in back)',
    offeredIn: ['hand-knit'],
    validIn: ['hand-knit'],
    stitchDelta: 0,
    bedEffect: 'skip-active-needle-yarn-back',
    machineTechnique: null,
    instructionAbbreviation: 'sl wyib',
  },
  {
    op: 'k-tbl',
    label: 'K-tbl (knit through back loop)',
    offeredIn: ['hand-knit'],
    validIn: ['hand-knit'],
    stitchDelta: 0,
    bedEffect: 'knit-twisted-leg',
    machineTechnique: null,
    instructionAbbreviation: 'k tbl',
  },
  {
    op: 'p-tbl',
    label: 'P-tbl (purl through back loop)',
    offeredIn: ['hand-knit'],
    validIn: ['hand-knit'],
    stitchDelta: 0,
    bedEffect: 'purl-twisted-leg',
    machineTechnique: null,
    instructionAbbreviation: 'p tbl',
  },
  {
    op: 'kfb',
    label: 'Kfb (knit front and back)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 1,
    bedEffect: 'knit-twice-into-loop',
    machineTechnique: 'choose-increase-technique',
    instructionAbbreviation: 'kfb',
  },
  {
    op: 'pfb',
    label: 'Pfb (purl front and back)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 1,
    bedEffect: 'purl-twice-into-loop',
    machineTechnique: 'choose-increase-technique',
    instructionAbbreviation: 'pfb',
  },
  {
    op: 'knit-below',
    label: 'Knit below (one row down)',
    offeredIn: ['hand-knit'],
    validIn: ['hand-knit'],
    stitchDelta: 0,
    bedEffect: 'knit-into-previous-row-loop',
    machineTechnique: null,
    instructionAbbreviation: 'k1b',
  },
  {
    op: 'mb',
    label: 'Make bobble',
    offeredIn: ['hand-knit'],
    validIn: ['hand-knit'],
    stitchDelta: 0,
    bedEffect: 'multi-step-cluster',
    machineTechnique: null,
    instructionAbbreviation: 'MB',
  },
  {
    op: 'kpk-in-1',
    label: '(k1, p1, k1) in 1 stitch',
    offeredIn: ['hand-knit'],
    validIn: ['hand-knit'],
    stitchDelta: 2,
    bedEffect: 'cluster-three-into-one',
    machineTechnique: null,
    instructionAbbreviation: '(k1,p1,k1)',
  },
  {
    op: 'm1l',
    label: 'M1L',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 1,
    bedEffect: 'create-left-leaning-loop',
    machineTechnique: 'choose-increase-technique',
    instructionAbbreviation: 'm1l',
  },
  {
    op: 'm1r',
    label: 'M1R',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 1,
    bedEffect: 'create-right-leaning-loop',
    machineTechnique: 'choose-increase-technique',
    instructionAbbreviation: 'm1r',
  },
  // Batch D Phase 1 (2026-05-22): traveller + asymmetric cable family.
  // All carry the cross choreography on the kniterate side via
  // emitTraveller / emitAsymmetricCableCross in src/knitout/passes/
  // cable-cross.ts. The chart key's `cableSpan` (workedWidth / purlWidth /
  // direction) drives which helper fires; the per-op stitchDelta is 0
  // because the cross row preserves stitch count.
  {
    op: 'lt',
    label: 'LT (1×1 left twist, no cable needle)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'rack-and-cross-1x1-left',
    machineTechnique: 'rack-and-cross',
    instructionAbbreviation: 'LT',
  },
  {
    op: 'rt',
    label: 'RT (1×1 right twist, no cable needle)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'rack-and-cross-1x1-right',
    machineTechnique: 'rack-and-cross',
    instructionAbbreviation: 'RT',
  },
  {
    op: 'lpc-1-1',
    label: 'LPC 1/1 (left purl cross, 1 knit over 1 purl)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'rack-and-cross-asymmetric',
    machineTechnique: 'rack-and-cross',
    instructionAbbreviation: 'LPC 1/1',
  },
  {
    op: 'lpc-1-2',
    label: 'LPC 1/2 (left purl cross, 1 knit over 2 purls)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'rack-and-cross-asymmetric',
    machineTechnique: 'rack-and-cross',
    instructionAbbreviation: 'LPC 1/2',
  },
  {
    op: 'lpc-2-1',
    label: 'LPC 2/1 (left purl cross, 2 knits over 1 purl)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'rack-and-cross-asymmetric',
    machineTechnique: 'rack-and-cross',
    instructionAbbreviation: 'LPC 2/1',
  },
  {
    op: 'rpc-1-1',
    label: 'RPC 1/1 (right purl cross, 1 knit over 1 purl)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'rack-and-cross-asymmetric',
    machineTechnique: 'rack-and-cross',
    instructionAbbreviation: 'RPC 1/1',
  },
  {
    op: 'rpc-1-2',
    label: 'RPC 1/2 (right purl cross, 1 knit over 2 purls)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'rack-and-cross-asymmetric',
    machineTechnique: 'rack-and-cross',
    instructionAbbreviation: 'RPC 1/2',
  },
  {
    op: 'rpc-2-1',
    label: 'RPC 2/1 (right purl cross, 2 knits over 1 purl)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'rack-and-cross-asymmetric',
    machineTechnique: 'rack-and-cross',
    instructionAbbreviation: 'RPC 2/1',
  },
  // Structural-soundness goal (2026-05-23): fully-fashioned lateral shift,
  // per-stitch primitive. shift-1-L destination cell at (r, c) implies the
  // loop was lifted from (r_prev, c+1) and racked one needle left; shift-1-R
  // implies (r_prev, c-1) racked one right. The destination cell IS a knit
  // stitch (semantic op = knit), the marker just records lineage. Adjacent
  // runs in the same row collapse into one rack-dance of count=runLength by
  // shift-events-from-chart. Paint path auto-adds KEY_ID_EMPTY at the source
  // position so the source column is terminated atomically per click.
  {
    op: 'shift-1-l',
    label: 'Shift 1 left (fully-fashioned lateral slide)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'rack-and-shift-left',
    machineTechnique: 'rack-and-xfer',
    instructionAbbreviation: 'shift-1-L',
  },
  {
    op: 'shift-1-r',
    label: 'Shift 1 right (fully-fashioned lateral slide)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 0,
    bedEffect: 'rack-and-shift-right',
    machineTechnique: 'rack-and-xfer',
    instructionAbbreviation: 'shift-1-R',
  },
  // Batch D Phase 3 (2026-05-22): purl-face make-1 increases. Lower via
  // the same machine technique as M1L/M1R on kniterate (preview-grade:
  // the loop ends up on the front bed rather than back; full purl-face
  // back-bed routing is a follow-up). On hand-knit the instruction is
  // "M1Lp" / "M1Rp".
  {
    op: 'm1lp',
    label: 'M1Lp (purl-face left-leaning make-1)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 1,
    bedEffect: 'create-left-leaning-purl-loop',
    machineTechnique: 'choose-increase-technique',
    instructionAbbreviation: 'm1lp',
  },
  {
    op: 'm1rp',
    label: 'M1Rp (purl-face right-leaning make-1)',
    offeredIn: ['hand-knit', 'kniterate'],
    validIn: ['hand-knit', 'kniterate'],
    stitchDelta: 1,
    bedEffect: 'create-right-leaning-purl-loop',
    machineTechnique: 'choose-increase-technique',
    instructionAbbreviation: 'm1rp',
  },
  // p1-below is the purl-face row-below pickup. Hand-knit only; the
  // machine variant needs the same opposite-leg bed routing as knit-tbl,
  // which we don't model.
  {
    op: 'p1-below',
    label: 'P1-below (purl into stitch one row down)',
    offeredIn: ['hand-knit'],
    validIn: ['hand-knit'],
    stitchDelta: 0,
    bedEffect: 'purl-into-previous-row-loop',
    machineTechnique: null,
    instructionAbbreviation: 'p1b',
  },
  // drop-st releases a stitch column on the paint row. stitchDelta is 0 on
  // the paint row (the cell itself is still active as a result of the
  // dropped loop); subsequent rows must be no-stitch in the dropped
  // column. `chart-continuity-drop-orphan` enforces this at chart level.
  {
    op: 'drop-st',
    label: 'Drop stitch (release column)',
    offeredIn: ['hand-knit'],
    validIn: ['hand-knit'],
    stitchDelta: 0,
    bedEffect: 'release-loop-from-needle',
    machineTechnique: null,
    instructionAbbreviation: 'drop',
  },
] as const;

const KNIT_OP_SET: ReadonlySet<string> = new Set(KNIT_OPS);

export function isKnitOp(value: unknown): value is KnitOp {
  return typeof value === 'string' && KNIT_OP_SET.has(value);
}

export function opForKey(key: { op?: unknown } | null | undefined): KnitOp {
  return isKnitOp(key?.op) ? key.op : 'knit';
}

export function primitiveForOp(op: KnitOp): KnitPrimitiveDefinition {
  const primitive = KNIT_PRIMITIVES.find((entry) => entry.op === op);
  if (!primitive) {
    throw new Error(`Unknown knit op: ${op}`);
  }
  return primitive;
}

export function decreaseSpanForOp(op: KnitOp): DecreaseSpan | null {
  return primitiveForOp(op).decreaseSpan ?? null;
}

export function isOpValidForSurface(op: KnitOp, surface: KnitSurface): boolean {
  return primitiveForOp(op).validIn.includes(surface);
}

export function isOpOfferedForSurface(op: KnitOp, surface: KnitSurface): boolean {
  return primitiveForOp(op).offeredIn.includes(surface);
}
