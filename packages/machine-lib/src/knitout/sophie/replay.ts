/**
 * Faithful Sophie macro-replay emitter — the parameterized constant-width
 * round rule, reverse-engineered from reference/sophie.kc and validated
 * needle-for-needle against every steady-state round (widths 4..51) by
 * test/knitout/sophie-body-round.test.ts.
 *
 * This module owns the abstract pass sequence (cast-on + body + shaping
 * transport walks + tip closure). Lowering to the loop/stack simulator and
 * direct `.kc` text rendering live in `./render-kc.ts`.
 *
 * The leaf is a PARTIAL TUBE: positions 0,1,2 (left selvedge) and the spine
 * are double-layered (loops on both beds); the middle bulk is single-layer and
 * ping-pongs. A constant-width round at width `w` (the bulk count) is six
 * passes, edge-relative (position 0 = current left edge):
 *
 *   1. Kn-Kn <<  knit front bulk {1}∪{3..w}∪{w+2}, rear wraps {2,w+1,w+3}
 *   2. Tr-Rr     flip interior odd  {3,5,…}∩[3,w-1] front→rear
 *   3. Tr-Rl     flip interior even {4,6,…}∩[3,w-1] front→rear
 *   4. Kn-Kn >>  knit rear bulk (mirror), front wraps {2,w+1,w+3}
 *   5. Rl-Tr     flip interior odd  rear→front
 *   6. Rr-Tr     flip interior even rear→front
 *
 * This is the BODY only; cast-on and the shaping transport walks are separate.
 */

export type RoundPassKind = 'Kn-Kn' | 'Tr-Rr' | 'Tr-Rl' | 'Rl-Tr' | 'Rr-Tr' | 'Tu-Tu';

export interface RoundPass {
  kind: RoundPassKind;
  dir?: '<<' | '>>';
  /** Edge-relative front needles operated (for Kn-Kn and front-sourced xfers). */
  f?: number[];
  /** Edge-relative rear needles operated. */
  r?: number[];
}

const odd = (lo: number, hi: number): number[] => { const a: number[] = []; for (let i = lo; i <= hi; i++) if (i % 2 === 1) a.push(i); return a; };
const even = (lo: number, hi: number): number[] => { const a: number[] = []; for (let i = lo; i <= hi; i++) if (i % 2 === 0) a.push(i); return a; };

/** The six edge-relative passes of a constant-width Sophie round at width `w`. */
export function sophieRoundRule(w: number): RoundPass[] {
  const bulk = [1, ...Array.from({ length: Math.max(0, w - 2) }, (_, i) => i + 3), w + 2]; // {1}∪{3..w}∪{w+2}
  const wraps = [2, w + 1, w + 3];
  return [
    { kind: 'Kn-Kn', dir: '<<', f: bulk, r: wraps },
    { kind: 'Tr-Rr', f: odd(3, w - 1) },
    { kind: 'Tr-Rl', f: even(3, w - 1) },
    { kind: 'Kn-Kn', dir: '>>', f: wraps, r: bulk },
    { kind: 'Rl-Tr', r: odd(3, w - 1) },
    { kind: 'Rr-Tr', r: even(3, w - 1) },
  ];
}

// ── Shaping transport walks (fixed, edge-relative; width-independent) ─────────
// Each single-transfer step is (kind, front-needle, rack); the rear needle is
// (f - rack). Verified identical across widths in reference/sophie.kc.
type WalkStep = { kind: RoundPassKind; f: number; rack: number };

const INC_WALK: WalkStep[] = [
  { kind: 'Tr-Rl', f: 0, rack: 1 }, { kind: 'Rr-Tr', f: -1, rack: 0 }, { kind: 'Rl-Tr', f: 0, rack: 0 },
  { kind: 'Tr-Rr', f: 0, rack: 1 }, { kind: 'Tr-Rl', f: 1, rack: 1 }, { kind: 'Rr-Tr', f: 0, rack: 0 },
  { kind: 'Rl-Tr', f: 1, rack: 0 }, { kind: 'Tr-Rr', f: 1, rack: 1 }, { kind: 'Tr-Rl', f: 2, rack: 1 },
  { kind: 'Rr-Tr', f: 1, rack: 0 }, { kind: 'Rl-Tr', f: 2, rack: 0 }, { kind: 'Tr-Rr', f: 2, rack: 1 },
];
const DEC_WALK: WalkStep[] = [
  { kind: 'Tr-Rl', f: 3, rack: -1 }, { kind: 'Rr-Tr', f: 3, rack: 1 }, { kind: 'Tr-Rl', f: 2, rack: 0 },
  { kind: 'Tr-Rr', f: 3, rack: 0 }, { kind: 'Rl-Tr', f: 2, rack: 1 }, { kind: 'Rr-Tr', f: 3, rack: 1 },
  { kind: 'Tr-Rl', f: 1, rack: 0 }, { kind: 'Tr-Rr', f: 2, rack: 0 }, { kind: 'Rl-Tr', f: 1, rack: 1 },
  { kind: 'Rr-Tr', f: 2, rack: 1 }, { kind: 'Tr-Rl', f: 0, rack: 0 }, { kind: 'Tr-Rr', f: 1, rack: 0 },
  { kind: 'Rl-Tr', f: 1, rack: 1 }, { kind: 'Rr-Tr', f: 3, rack: -1 },
];

const expandWalk = (w: WalkStep[]): RoundPass[] => w.map(s => ({ kind: s.kind, f: [s.f], r: [s.f - s.rack] }));
const flipRearToFront = (w: number): RoundPass[] => [
  { kind: 'Rl-Tr', f: odd(3, w - 1), r: odd(3, w - 1) },
  { kind: 'Rr-Tr', f: even(3, w - 1), r: even(3, w - 1) },
];

/**
 * Edge-relative transfer passes of an increase transition at width `w`
 * (the transport walk, then the rear→front bulk flip). Edge moves out by 1.
 */
export function sophieIncTransition(w: number): RoundPass[] {
  return [...expandWalk(INC_WALK), ...flipRearToFront(w)];
}

/**
 * Edge-relative transfer passes of a decrease transition at width `w`
 * (the rear→front bulk flip, then the secured k2tog transport walk). Edge
 * moves in by 1.
 */
export function sophieDecTransition(w: number): RoundPass[] {
  return [...flipRearToFront(w), ...expandWalk(DEC_WALK)];
}

// ── full body assembler ──────────────────────────────────────────────────────
/**
 * A fully-specified pass: bed needles (f/r) plus every structural footer field
 * sophie's .kc carries — carriage direction, carrier, and rack. (speed/roller
 * are carriage-cosmetic and synthesized at render time, not here.) Carrier is
 * '3' for knits/tucks (the body yarn) and '0' for transfers and the tip's
 * bind-off drop; rack is 0 for knits/tucks and front−rear for a transfer.
 */
export interface BodyPass { kind: RoundPassKind; dir: '<<' | '>>'; carrier: string; rack: number; f: number[]; r: number[]; }

/** Carriage direction: transfers encode it in the kind (…-Rr/Rr-… = `>>`,
 * …-Rl/Rl-… = `<<`); knits carry it explicitly. */
const dirOf = (p: RoundPass): '<<' | '>>' =>
  p.kind === 'Kn-Kn' ? (p.dir ?? '<<') : /Rr/.test(p.kind) ? '>>' : '<<';

const isXferKind = (k: RoundPassKind): boolean => k !== 'Kn-Kn' && k !== 'Tu-Tu';

const flipFrontToRear = (w: number): RoundPass[] => [
  { kind: 'Tr-Rr', f: odd(3, w - 1), r: odd(3, w - 1) },
  { kind: 'Tr-Rl', f: even(3, w - 1), r: even(3, w - 1) },
];

/**
 * Assemble the full Sophie body+shaping as absolute passes, given a per-round
 * width schedule (one entry per `Kn-Kn <<` round) and the absolute column of
 * the left edge for the first round. Each round is
 *   Kn<< · flipF→R · Kn>> · [ const flipR→F | inc walk+flip | flip+dec walk ]
 * and the edge advances by ∓1 across each transition. Reproduces sophie
 * needle-for-needle across the steady range (see sophie-replay-compose.test.ts).
 */
export function emitSophieBody(widthSchedule: number[], startEdge: number): BodyPass[] {
  const out: BodyPass[] = [];
  let e = startEdge;
  const abs = (p: RoundPass): BodyPass => {
    const f = (p.f ?? []).map(n => n + e), r = (p.r ?? []).map(n => n + e);
    const xfer = isXferKind(p.kind);
    return { kind: p.kind, dir: dirOf(p), carrier: xfer ? '0' : '3', rack: xfer ? (f[0]! - r[0]!) : 0, f, r };
  };
  for (let i = 0; i < widthSchedule.length - 1; i++) {
    const w = widthSchedule[i]!, next = widthSchedule[i + 1]!;
    const type: 'const' | 'inc' | 'dec' = next > w ? 'inc' : next < w ? 'dec' : 'const';
    const bulk = [1, ...Array.from({ length: Math.max(0, w - 2) }, (_, k) => k + 3), w + 2];
    const wraps = [2, w + 1, w + 3];
    const firstHalf: RoundPass[] = [
      { kind: 'Kn-Kn', dir: '<<', f: bulk, r: wraps },
      ...flipFrontToRear(w),
      { kind: 'Kn-Kn', dir: '>>', f: wraps, r: bulk },
    ];
    const secondHalf: RoundPass[] =
      type === 'const' ? flipRearToFront(w) :
      type === 'inc' ? sophieIncTransition(w) : sophieDecTransition(w);
    // Drop transfer passes that move nothing: at small widths the even/odd
    // interior flips can be empty (e.g. width 3 has no interior), and a real
    // machine emits no pass for a zero-needle transfer.
    for (const p of [...firstHalf, ...secondHalf]) {
      if (p.kind !== 'Kn-Kn' && (p.f ?? []).length === 0 && (p.r ?? []).length === 0) continue;
      out.push(abs(p));
    }
    e += type === 'inc' ? -1 : type === 'dec' ? 1 : 0;
  }
  return out;
}

/** Edge advance over a width schedule's first `widthSchedule.length-1` rounds —
 * the absolute edge where the body hands off to the tip (each inc moves the
 * edge out by 1, each dec in by 1). */
export function sophieBodyFinalEdge(widthSchedule: number[], startEdge: number): number {
  let e = startEdge;
  for (let i = 0; i < widthSchedule.length - 1; i++) {
    const next = widthSchedule[i + 1]!, w = widthSchedule[i]!;
    e += next > w ? -1 : next < w ? 1 : 0;
  }
  return e;
}

// ── tip closure ───────────────────────────────────────────────────────────────
// The leaf's tip is a FIXED choreography (no width parameter): a width-4→3
// decrease variant (the dec walk runs in the opposite carriage phase than the
// steady DEC_WALK), a full collapse-to-front, a 5-round i-cord spine that walks
// rightward, then plain 1-wide rounds and a carrier-0 drop-close. Captured
// edge-relative to the tip-start edge (TIP_BASE) by decoding reference/sophie.kc
// segments 399..410; validated needle-for-needle by sophie-replay-compose.test.ts.
export const TIP_BASE = 0; // template stored edge-relative; offset by tipStartEdge

const TIP_CLOSURE: { kind: RoundPassKind; dir: '<<' | '>>'; f: number[]; r: number[] }[] = [
  { kind: 'Kn-Kn', dir: '<<', f: [1, 3, 4, 6], r: [2, 5, 7] },
  { kind: 'Tr-Rr', dir: '>>', f: [3], r: [3] },
  { kind: 'Kn-Kn', dir: '>>', f: [2, 5, 7], r: [1, 3, 4, 6] },
  { kind: 'Rl-Tr', dir: '<<', f: [3], r: [3] },
  { kind: 'Tr-Rr', dir: '>>', f: [3], r: [4] },
  { kind: 'Rl-Tr', dir: '<<', f: [3], r: [2] },
  { kind: 'Tr-Rr', dir: '>>', f: [2], r: [2] },
  { kind: 'Tr-Rl', dir: '<<', f: [3], r: [3] },
  { kind: 'Rr-Tr', dir: '>>', f: [2], r: [1] },
  { kind: 'Rl-Tr', dir: '<<', f: [3], r: [2] },
  { kind: 'Tr-Rr', dir: '>>', f: [1], r: [1] },
  { kind: 'Tr-Rl', dir: '<<', f: [2], r: [2] },
  { kind: 'Rr-Tr', dir: '>>', f: [1], r: [0] },
  { kind: 'Rl-Tr', dir: '<<', f: [2], r: [1] },
  { kind: 'Tr-Rr', dir: '>>', f: [0], r: [0] },
  { kind: 'Tr-Rl', dir: '<<', f: [1], r: [1] },
  { kind: 'Rr-Tr', dir: '>>', f: [1], r: [0] },
  { kind: 'Kn-Kn', dir: '<<', f: [2, 4, 6], r: [3, 5, 7] },
  { kind: 'Kn-Kn', dir: '>>', f: [3, 5, 7], r: [2, 4, 6] },
  { kind: 'Kn-Kn', dir: '<<', f: [2, 4, 6], r: [3, 5, 7] },
  { kind: 'Kn-Kn', dir: '>>', f: [3, 5, 7], r: [2, 4, 6] },
  { kind: 'Rl-Tr', dir: '<<', f: [1, 3, 5], r: [1, 3, 5] },
  { kind: 'Rr-Tr', dir: '>>', f: [2, 4, 6], r: [2, 4, 6] },
  { kind: 'Kn-Kn', dir: '<<', f: [2], r: [] },
  { kind: 'Tr-Rr', dir: '>>', f: [1], r: [1] },
  { kind: 'Rl-Tr', dir: '<<', f: [2], r: [1] },
  { kind: 'Kn-Kn', dir: '<<', f: [3], r: [] },
  { kind: 'Tr-Rr', dir: '>>', f: [2], r: [2] },
  { kind: 'Rl-Tr', dir: '<<', f: [3], r: [2] },
  { kind: 'Kn-Kn', dir: '<<', f: [4], r: [] },
  { kind: 'Tr-Rr', dir: '>>', f: [3], r: [3] },
  { kind: 'Rl-Tr', dir: '<<', f: [4], r: [3] },
  { kind: 'Kn-Kn', dir: '<<', f: [5], r: [] },
  { kind: 'Tr-Rr', dir: '>>', f: [4], r: [4] },
  { kind: 'Rl-Tr', dir: '<<', f: [5], r: [4] },
  { kind: 'Kn-Kn', dir: '<<', f: [6], r: [] },
  { kind: 'Tr-Rr', dir: '>>', f: [5], r: [5] },
  { kind: 'Rl-Tr', dir: '<<', f: [6], r: [5] },
  { kind: 'Kn-Kn', dir: '<<', f: [7], r: [] },
  { kind: 'Kn-Kn', dir: '>>', f: [7], r: [] },
  { kind: 'Kn-Kn', dir: '<<', f: [7], r: [] },
  { kind: 'Kn-Kn', dir: '>>', f: [7], r: [] },
  { kind: 'Kn-Kn', dir: '<<', f: [7], r: [] },
  { kind: 'Kn-Kn', dir: '>>', f: [7], r: [] },
  { kind: 'Kn-Kn', dir: '<<', f: [7], r: [] },
  { kind: 'Kn-Kn', dir: '>>', f: [7], r: [] },
  { kind: 'Kn-Kn', dir: '<<', f: [6], r: [] }, // carrier-0 drop closes the spine
];

/** The leaf tip's 47 fixed passes, absolute, given the edge where the body hands
 * off (sophie's last width-4 round). The final `Kn-Kn <<` is a carrier-0 drop. */
export function emitSophieTip(tipStartEdge: number): BodyPass[] {
  const d = tipStartEdge - TIP_BASE;
  const last = TIP_CLOSURE.length - 1;
  return TIP_CLOSURE.map((p, i) => {
    const f = p.f.map(n => n + d), r = p.r.map(n => n + d);
    const xfer = isXferKind(p.kind);
    // The final Kn-Kn is the carrier-0 bind-off drop; every other knit is body yarn.
    const carrier = xfer ? '0' : (i === last ? '0' : '3');
    return { kind: p.kind, dir: p.dir, carrier, rack: xfer ? (f[0]! - r[0]!) : 0, f, r };
  });
}

// ── cast-on ───────────────────────────────────────────────────────────────────
/**
 * Synthesized tuck cast-on that seeds the width-3 base tube. The body's first
 * round expects exactly sophie's entering state — front {1..6}, rear {0..6}
 * (13 loops, edge-relative) — measured by simulating sophie up to its first
 * body round. Two interlocking tuck passes establish it loop/stack-clean; this
 * replaces sophie's waste-yarn + carrier-1 framing (out of scope here, see
 * docs/sophie-leaf-fidelity.md), not her body. Front position 0 is intentionally
 * left empty: the first increase walk transfers it (sophie's one boundary
 * empty-source) to establish the new edge wale.
 */
export function emitSophieCastOn(edge: number): BodyPass[] {
  const at = (ns: number[]) => ns.map(n => n + edge);
  return [
    { kind: 'Tu-Tu', dir: '<<', carrier: '3', rack: 0, f: at([1, 3, 5]), r: at([1, 3, 5]) },
    { kind: 'Tu-Tu', dir: '>>', carrier: '3', rack: 0, f: at([2, 4, 6]), r: at([0, 2, 4, 6]) },
  ];
}

/**
 * Assemble a complete Sophie leaf: cast-on + body + tip. `bodySchedule` is the
 * per-round width schedule from the first body round (width 3) through the last
 * width-4 round before the tip takes over (its last entry picks the final body
 * round's transition); `startEdge` is the absolute left edge of the base tube.
 * The fixed tip closure attaches at the body's final edge.
 */
export function emitSophieLeaf(bodySchedule: number[], startEdge: number): BodyPass[] {
  return [
    ...emitSophieCastOn(startEdge),
    ...emitSophieBody(bodySchedule, startEdge),
    ...emitSophieTip(sophieBodyFinalEdge(bodySchedule, startEdge)),
  ];
}

// ── the canonical Sophie leaf (fixed validated template) ──────────────────────
/**
 * Sophie's exact body width schedule — one entry per knit round, extracted from
 * reference/sophie.kc and validated needle-for-needle by
 * test/knitout/sophie-replay-compose.test.ts. 398 rounds, width 3 → peak 51 → 4
 * (the fixed tip closure takes over at width 4). THIS is the Sophie leaf: the
 * faithful stamp emits exactly this; the product surface does not vary it.
 */
export const SOPHIE_BODY_SCHEDULE: readonly number[] = [
  3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10,
  11, 11, 11, 11, 11, 12, 12, 12, 12, 13, 13, 13, 13, 14, 14, 14, 14, 15, 15, 15, 15, 16, 16, 16, 16,
  17, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 22, 22, 22, 22,
  23, 23, 23, 23, 24, 24, 24, 24, 25, 25, 25, 25, 26, 26, 26, 26, 27, 27, 27, 27, 28, 28, 28, 28,
  29, 29, 29, 29, 30, 30, 30, 30, 31, 31, 31, 31, 32, 32, 32, 32, 32, 33, 33, 33, 33, 34, 34, 34, 34,
  35, 35, 35, 35, 36, 36, 36, 36, 37, 37, 37, 37, 38, 38, 38, 38, 39, 39, 39, 39, 40, 40, 40, 40,
  41, 41, 41, 41, 42, 42, 42, 42, 43, 43, 43, 43, 44, 44, 44, 44, 44, 45, 45, 45, 45, 45, 46, 46, 46, 46,
  47, 47, 47, 47, 47, 48, 48, 48, 48, 48, 49, 49, 49, 49, 49, 50, 50, 50, 51, 51, 50, 50, 50, 49, 49, 49,
  48, 48, 48, 48, 48, 47, 47, 47, 47, 46, 46, 46, 46, 45, 45, 45, 45, 45, 44, 44, 44, 44, 43, 43, 43, 43,
  42, 42, 42, 42, 41, 41, 41, 41, 41, 40, 40, 40, 40, 39, 39, 39, 39, 39, 38, 38, 38, 38, 37, 37, 37, 37,
  36, 36, 36, 36, 35, 35, 35, 35, 35, 34, 34, 34, 34, 33, 33, 33, 33, 32, 32, 32, 32, 31, 31, 31, 31, 31,
  30, 30, 30, 30, 29, 29, 29, 29, 28, 28, 28, 28, 27, 27, 27, 27, 27, 26, 26, 26, 26, 25, 25, 25, 25, 25,
  24, 24, 24, 24, 23, 23, 23, 23, 22, 22, 22, 22, 22, 21, 21, 21, 21, 20, 20, 20, 20, 19, 19, 19, 19,
  18, 18, 18, 18, 17, 17, 17, 17, 17, 16, 16, 16, 16, 15, 15, 15, 15, 14, 14, 14, 14, 13, 13, 13, 13, 13,
  12, 12, 12, 12, 11, 11, 11, 11, 10, 10, 10, 10, 10, 9, 9, 9, 9, 8, 8, 8, 8, 7, 7, 7, 7, 6, 6, 6, 6, 6,
  5, 5, 5, 5, 4, 4, 4, 4, 4,
];

/**
 * The absolute left-edge column where Sophie's width-3 base tube starts in
 * reference/sophie.kc. The leaf grows leftward as it widens (edge − (peak−3) ≈
 * 99 at the peak), so it occupies roughly needles 99..200. The faithful stamp
 * positions at this validated edge (plus a caller offset) to reproduce the
 * reference layout exactly and keep every needle non-negative.
 */
export const SOPHIE_BASE_EDGE = 148;

/**
 * The faithful Sophie leaf as absolute passes — a fixed stamp over
 * `SOPHIE_BODY_SCHEDULE` at the validated base edge. `needleOffset` shifts the
 * whole leaf across the bed; the painted chart footprint does NOT parameterize
 * it (the export always emits Sophie's exact validated choreography). Render to
 * `.kc` with `renderSophieKc` — see `../compile/sophie-leaf-chart.ts`.
 */
export function emitSophieLeafTemplate(needleOffset = 0): BodyPass[] {
  return emitSophieLeaf([...SOPHIE_BODY_SCHEDULE], SOPHIE_BASE_EDGE + needleOffset);
}
