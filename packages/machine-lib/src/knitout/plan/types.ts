/**
 * KniteratePlan — load-bearing IR between source (chart or package) and
 * emitted KnitoutProgram. See docs/knitlab1-kniterate-export-plan.md §7.1
 * (B1.0 deliverable 1) for the rationale.
 *
 * Two compile entries land in a Plan:
 *   - compileChartToKniteratePlan(spec)         (Track A)
 *   - compilePackageToKniteratePlan(pkg, ...)   (Track B1)
 *
 * Both feed compilePlanToKnitout(plan) → KnitoutProgram, which the
 * vendored backend turns into .kc. Wizard, validators, notes generator,
 * and SVG preview all read from the Plan.
 *
 * Shape constraints:
 *   - JSON-safe: no Map<>, no embedded closures, no circular refs.
 *     Bindings serialize as records.
 *   - Source-tagged: a Plan can describe its origin so the wizard can
 *     surface a "from chart X" vs "from session Y/panel Z" header.
 */

import type {
  CarrierId,
  KnitoutOp,
  Position,
  Bed,
  Direction,
  StitchType,
  YarnBinding,
} from '../types.js';
import type { ValidationMessage } from '../../validators/knitout-program.js';
import type { CarrierSide, PredictedPass } from '../sim/types.js';

// ---- Source tags ----------------------------------------------------------

/** Identifies what was compiled. Plans don't carry the full source object —
 *  just enough to identify it and re-resolve if needed. */
export type KniteratePlanSource =
  | {
      kind: 'chart';
      chartId: string;
      chartName?: string;
      /** Rectangular dimensions of the chart. */
      rows: number;
      cols: number;
    }
  | {
      kind: 'package';
      sessionId?: string;
      packageId?: string;
      panelId: string;
      panelLabel?: string;
      method: string;
    };

// ---- Settings ------------------------------------------------------------

export interface KniteratePlanSettings {
  /** Machine extension knobs. Machine-effective settings are emitted as
   *  inline ops at program start; some are also retained in program headers
   *  for diagnostics/back-compat. */
  rollerAdvance?: number;
  stitchNumber?: number;
  xferStitchNumber?: number;
  speedNumber?: number;
  carrierSpacing?: number;
  carrierStoppingDistance?: number;
  xferStyle?: 'four-pass' | 'two-pass';
  /** Pass speed for time estimate (defaults to speedNumber). */
  position: Position;
  /** ;;Gauge: header. */
  gauge: number;
  /** Number of waste rows. */
  wastePasses: number;
  /** Bind-off style for the body terminus. */
  bindOff: 'machine-bindoff' | 'waste-and-drop' | 'drop' | 'fairisle-park-bindoff';
}

// ---- Carrier / waste plan ------------------------------------------------

export interface CarrierAssignment {
  carrier: CarrierId;
  /** What this carrier represents — pattern yarn, waste, draw thread. */
  role: 'pattern' | 'waste' | 'draw';
  /** Human-readable yarn name (rendered into ;;Yarn-N: headers). */
  yarnName?: string;
  /** keyId from the chart this carrier is bound to (pattern only). */
  keyId?: string;
  /** Initial parked side when brought into work. */
  initialSide: CarrierSide;
}

export interface WastePlan {
  needleStart: number;
  needleEnd: number;
  wasteCarrier: CarrierId;
  drawThreadCarrier: CarrierId | null;
  patternCarriers: CarrierId[];
  wastePasses: number;
  castOnCarrier: CarrierId;
  /** Per-column bed assignment for the cast-on row. Length = cols.
   *  Omitted if alternating-parity default applies. */
  castOnBedPattern?: ('f' | 'b')[];
}

// ---- Pass schedule (per-pass groupings of ops) ---------------------------

export type PassPurpose =
  | 'settings'
  | 'waste'
  | 'draw'
  | 'cast-on'
  | 'body'
  | 'transfer'
  | 'bind-off'
  | 'release';

/** A grouping of ops with a shared semantic purpose. Used by validators and
 *  the bed simulator to slice the op stream into meaningful chunks. */
export interface PlannedPass {
  index: number;
  purpose: PassPurpose;
  /** Optional human comment. */
  label?: string;
  /** Ops emitted for this pass, in emission order. */
  ops: KnitoutOp[];
}

// ---- Bed state (simulator output) ---------------------------------------

export interface BedLoop {
  /** Carrier that owns this loop. `null` = waste/draw yarn loop from cast-on. */
  carrier: CarrierId | null;
}

/** Per-needle loop occupancy for a bed at a single tick. Sparse — only
 *  occupied needles appear. */
export type BedOccupancy = Record<number /*needle*/, BedLoop[]>;

export interface BedState {
  /** Pass index this state reflects (AFTER the pass executed). */
  afterPassIndex: number;
  /** Front bed needle → loops (most recent on top). */
  front: BedOccupancy;
  /** Back bed needle → loops. */
  back: BedOccupancy;
  /** Current racking offset (integer or ±0.5). */
  racking: number;
  /** Per-carrier parked side after this pass. Carriers not active are absent. */
  carrierSides: Partial<Record<CarrierId, CarrierSide>>;
}

// ---- Notes (renderable content) -----------------------------------------

/** Pre-rendered content for the notes.md file. Pure data; the formatter
 *  pulls strings off this rather than recomputing them. */
export interface NotesContent {
  title: string;
  yarn: Array<{ carrier: CarrierId; role: string; name?: string; keyId?: string }>;
  machineSettings: {
    stitchNumber?: number;
    speedNumber?: number;
    rollerAdvance?: number;
    xferStitchNumber?: number;
    wastePasses: number;
    position: Position;
    gauge: number;
  };
  dimensions: {
    needleStart: number;
    needleEnd: number;
    needleCount: number;
    estimatedRows: number;
  };
  estimatedKnitTimeSeconds: number;
  passCount: number;
  opCount: number;
  warnings: string[];
  /**
   * B2a (2026-05-20): cable events extracted from the source chart by
   * `cableEventsFromChart`. Present when the chart has any
   * `KnitlabKeyDefinition.cableSpan`-marked placement. The export tech
   * pack reads this list to summarize cables for the operator; B2b will
   * lower each event to the transfer choreography pass. Today these are
   * informational — the `track-a-cable-unsupported` diagnostic still
   * gates `.k` output until B2b ships.
   */
  cableEvents?: Array<{
    row: number;
    startCol: number;
    width: number;
    /** Batch D Phase 0 §0.2 (2026-05-22): worked/purl split for asymmetric
     *  cables. Symmetric C2/4/6/8 events default to floor(width/2). */
    workedWidth: number;
    purlWidth: number;
    direction: 'front' | 'back';
    /** Batch D Phase 1 (2026-05-22): true for LPC/RPC tiles. */
    hasPurlBackground: boolean;
    keyId: string;
  }>;
}

// ---- Top-level Plan -----------------------------------------------------

export interface KniteratePlan {
  schemaVersion: 1;
  machine: 'kniterate';
  source: KniteratePlanSource;
  technique:
    | 'stockinette'
    | 'stockinette-shaped'
    /**
     * B5 (2026-05-20): shaped panel with horizontal-stripe color variety.
     * Routes through `emitShapedStockinetteWalk` with per-row `rowCarriers`
     * — single bed, no jacquard back-bed, no float planning. Eligible
     * only when `detectShapedColorMode === 'horizontal-stripes'`.
     */
    | 'stockinette-shaped-stripes'
    /**
     * B5 full (post-2026-05-20): shaped panel with within-row multicolor.
     * Routes through `emitShapedStockinetteWalk` with `colorBindings`
     * (per-cell carrier) plus optional birdseye back-bed. Replaces the
     * earlier `track-a-shape-jacquard-unsupported` error with a preview
     * warning.
     */
    | 'stockinette-shaped-jacquard'
    | 'stockinette-with-overrides'
    | 'ladder-jacquard'
    | 'lined-jacquard'
    | 'birdseye-jacquard'
    /**
     * Campaign 4 (2026-06-13): two-color inverse-image double jacquard —
     * each carrier knits its color on the front bed and the complement on
     * the back bed in one pass (2 passes/row, rack 0). The construction
     * the captured reference sweater uses. See
     * `src/knitout/passes/jacquard-complement.ts`.
     */
    | 'complement-jacquard'
    /**
     * Front-bed only, no back-bed knit. Stranded fairisle with unsecured
     * floats. Per-row pass count = N (colors present). Used for small
     * 2-color fairisle repeats where back-bed coverage is not needed and
     * the output should match the fairisle parity recipe's `.kc` fairisle style.
     */
    | 'floats-jacquard'
    | 'custom';

  /** Resolved keyId at each (row, col). Row 0 is cast-on. */
  resolvedCells?: string[][];
  /** Yarn bindings as a JSON-safe record. keyId → binding. */
  yarnBindings: Record<string, YarnBinding>;
  /** Per-cell stitch overrides as a JSON-safe record. keyId → stitch type. */
  stitchBindings: Record<string, StitchType>;

  carriers: CarrierAssignment[];
  settings: KniteratePlanSettings;
  waste: WastePlan;

  /** Op-grouped schedule. compilePlanToKnitout flattens these into program ops. */
  passes: PlannedPass[];

  /** Total live rows of pattern (excludes waste / bind-off). */
  estimatedRows: number;
  /** Crude time estimate using a per-pass duration assumption. */
  estimatedKnitTimeSeconds: number;

  /** Validation messages collected during compilation (chart-level + plan-level). */
  validations: ValidationMessage[];

  /** Pre-rendered notes content; the formatter prints from this. */
  notes: NotesContent;

  /**
   * Phase 4a + 4b (2026-05-24): per-section CarriageSimulator predicted-
   * pass traces concatenated in walk order (waste → carrier-intro →
   * body → bind-off). Phase 4b threads `nextDirection` between
   * sim-backed emitters via `initialNextDirection`/`finalNextDirection`,
   * so the sim sees a coherent direction state across sim segments.
   *
   * Phase 4c threads raw-op `nextDirection` effects between sim-backed
   * sections, so section handoff no longer ignores `carrierOut` and xfer
   * batches emitted by compile-chart. This is still NOT "vendor-byte-
   * identical for the whole walk": raw legacy sections can advance
   * `finalNextDirection` without contributing individual predicted
   * passes, and Phase E still owns the single program-wide simulator
   * cutover.
   *
   * Empty only for compile paths that don't construct a simulator.
   * Track B package plans populate this for their sim-backed waste and
   * terminus sections; their raw body emitters still do not contribute
   * per-row predicted passes until the package body walker cuts over.
   */
  predictedPasses?: readonly PredictedPass[];
}

// ---- Re-exports for convenience -----------------------------------------

export type { Bed, Direction, CarrierId, CarrierSide };
