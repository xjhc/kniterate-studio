/**
 * Loop/STACK simulator over Kniterate `.kc` passes — the validation oracle
 * for the faithful Sophie macro-replay path (docs/sophie-leaf-fidelity.md).
 *
 * Unlike a bed-occupancy simulator, this counts loops per needle, models
 * k2tog consolidation, and tracks exact loop conservation — so it can prove
 * decreases are realized as genuine stacked-then-knit-together k2togs, and
 * that an emitted program's per-needle stack counts match sophie's at every
 * width.
 *
 * Machine semantics (verified against reference/sophie.kc):
 *   rack convention : front needle f aligns with rear (f - rack).
 *   pass labels     : `Tr-R*` front->rear, `R*-Tr` rear->front.
 *   transfer        : src count-- (empty source flagged), dst count++.
 *   knit N          : N==0 -> a new loop (cast-on / increase);
 *                     N>=1 -> consolidate to 1, consuming N-1 loops (k2tog…).
 *   tuck            : count++ (held stack; a new loop if empty).
 */

export const PAD = 15;
export type Bed = 'f' | 'b';

export interface KcPass {
  idx: number;
  kind: string;
  dir: '>>' | '<<';
  carrier: string;
  rack: number;
  /** Footer speed/roller (carriage-cosmetic; undefined if the footer omits them). */
  speed?: number;
  roller?: number;
  f: number[];
  r: number[];
}

const isXfer = (k: string) => /^(Tr-R[lr]|R[lr]-Tr)$/.test(k);
const isFrontToRear = (k: string) => k.startsWith('Tr-');

function operated(s: string): number[] {
  const o: number[] = [];
  for (let i = PAD; i < s.length - PAD; i++) if (s[i] === '-') o.push(i - PAD);
  return o;
}

export interface ParseKcOptions {
  /** K-1 Phase 2 (2026-06-10): `.kc` needle-mark frame dialect.
   *
   *  - `'app'` (default): knit/tuck and transfer passes mark the same
   *    physical needle at the same column. Kniterate-app-authored files
   *    (reference/sophie.kc, front/back/sleeves.kc) use this frame.
   *  - `'knitout-vendor'`: files written by the knitout-to-kcode vendor
   *    lineage (our exports AND Customist's own machine-validated
   *    exports — swatch.kc, color-swatch-bindoff.kc, fairisle.kc) print
   *    carrier-stroke passes (the Kn / Tu families) one column RIGHT of transfer
   *    passes for the same physical needle. Probe-confirmed on minimal
   *    programs and visible byte-level in color-swatch-bindoff.kc's
   *    chain (lift @112 → return @113 → knit-merge @114 → next lift
   *    @113). The frame is keyed on CARRIER ENGAGEMENT, not pass kind:
   *    carrier-attributed transfer passes (the vendor's `split`
   *    lowering, e.g. `Tr-Rr 2`) print in the +1 stroke frame too,
   *    while carrier-0 transfers stay in the transfer frame. The
   *    machine compensates; readers must too. This mode shifts
   *    carrier-engaged passes' marks −1 into the transfer frame. */
  dialect?: 'app' | 'knitout-vendor';
}

/** Parse a `.kc` document into ordered passes (operated needles + rack). */
export function parseKc(text: string, options?: ParseKcOptions): KcPass[] {
  const vendorDialect = options?.dialect === 'knitout-vendor';
  const passes: KcPass[] = [];
  let frnt = '', rear = '', rack = 0, idx = 0;
  for (const l of text.split('\n')) {
    if (l.startsWith('RACK:')) rack = parseFloat(l.slice(5)); // reference contains RACK:0.5 — don't truncate
    else if (l.startsWith('FRNT:')) frnt = l.slice(5);
    else if (l.startsWith('REAR:')) rear = l.slice(5);
    else {
      const m = l.match(/^(>>|<<) (\S+) (\S+)(?: (\S+) (\S+))?/);
      if (m) {
        const kind = m[2]!;
        const carrier = m[3]!;
        const shift = vendorDialect && carrier !== '0' ? -1 : 0;
        passes.push({
          idx: idx++, dir: m[1] as '>>' | '<<', kind, carrier, rack,
          speed: m[4] !== undefined ? parseFloat(m[4]) : undefined,
          roller: m[5] !== undefined ? parseFloat(m[5]) : undefined,
          f: operated(frnt).map(n => n + shift),
          r: operated(rear).map(n => n + shift),
        });
        frnt = ''; rear = '';
      }
    }
  }
  return passes;
}

export interface LoopStackResult {
  /** Transfers whose source needle held no loop (should be 0, sans boundary). */
  xferEmpty: number;
  /** K-1 Phase 2 (2026-06-10): per-event detail for `xferEmpty`. */
  xferEmptyEvents: { idx: number; kind: string; bed: Bed; n: number }[];
  /** Knit-into-empty events (idx + carrier + bed/needle). */
  knitHoles: { idx: number; carrier: string; bed: Bed; n: number }[];
  /** Knit-into-empty on the body carrier (the increases). */
  increases: (carrier: string) => number;
  /** Knits onto a count>=2 needle (realized decreases / k2tog). */
  k2togKnits: number;
  /** Per-event detail for `k2togKnits`. Carrier '0' events are kc DROPS
   *  of stacked needles (e.g. a lined finish dropping homed doubles),
   *  not fabric merges — filter by carrier to isolate body-yarn merges. */
  k2togEvents: { idx: number; carrier: string; bed: Bed; n: number; stack: number }[];
  /** Histogram of stack size N at consolidation time (N>=2). */
  stackHistogram: Map<number, number>;
  /** Largest stack seen on any needle at any time. */
  maxStack: number;
  /** New loops born (tuck-empty + knit-empty). */
  created: number;
  /** Loops consumed by consolidation (Σ N-1 over knits with N>1). */
  consumed: number;
  /** Final Σ of all needle counts. */
  finalTotal: number;
  /** Occupied-needle count after each body-carrier knit pass. */
  live: (carrier: string) => number[];
  /** Live snapshot of needle->count after the run (occupied only). */
  counts: Map<string, number>;
}

const K = (b: Bed, n: number) => `${b}:${n}`;

export interface LoopStackOptions {
  /** K-1 Phase 2 (2026-06-10): when true, a transfer moves the source
   *  needle's WHOLE stack (real Kniterate physics — all loops ride the
   *  transfer slider together). Default false: one loop per xfer event,
   *  the semantics the sophie.kc baselines were validated against —
   *  sophie's tip deliberately gathers parked stacks, so whole-stack
   *  accounting reads her tip as 6-deep where the pinned baseline
   *  counts per-event. Use whole-stack for shaped-panel verification;
   *  leave default for the sophie parity suite. */
  xferMovesWholeStack?: boolean;
}

/**
 * Run the loop/stack simulator. `bodyCarrier` defaults to '3' (sophie's body
 * yarn) for the `increases`/`live` projections.
 */
export function simulateLoopStack(passes: KcPass[], options?: LoopStackOptions): LoopStackResult {
  const wholeStack = options?.xferMovesWholeStack === true;
  const cnt = new Map<string, number>();
  const get = (k: string) => cnt.get(k) ?? 0;
  const setN = (k: string, n: number) => { if (n <= 0) cnt.delete(k); else cnt.set(k, n); };

  let xferEmpty = 0, k2togKnits = 0, created = 0, consumed = 0, maxStack = 0;
  const knitHoles: { idx: number; carrier: string; bed: Bed; n: number }[] = [];
  // DBJ-garment campaign (2026-06-10): per-event attribution for stack
  // merges. Carrier-0 "knits" are kc drops — a finish that drops homed
  // doubles registers here without being a real fabric merge, so tests
  // filter by carrier to isolate body-yarn merges.
  const k2togEvents: { idx: number; carrier: string; bed: Bed; n: number; stack: number }[] = [];
  const xferEmptyEvents: { idx: number; kind: string; bed: Bed; n: number }[] = [];
  const stackHistogram = new Map<number, number>();
  const liveByCarrier = new Map<string, number[]>();
  const occupied = () => { let n = 0; for (const v of cnt.values()) if (v > 0) n++; return n; };

  for (const p of passes) {
    if (p.kind === 'Tu-Tu') {
      for (const [bed, n] of [...p.f.map(x => ['f', x] as const), ...p.r.map(x => ['b', x] as const)]) {
        const k = K(bed, n); if (get(k) === 0) created++; setN(k, get(k) + 1);
        if (get(k) > maxStack) maxStack = get(k);
      }
    } else if (p.kind === 'Kn-Kn') {
      for (const [bed, n] of [...p.f.map(x => ['f', x] as const), ...p.r.map(x => ['b', x] as const)]) {
        const k = K(bed, n); const N = get(k);
        if (N > maxStack) maxStack = N;
        if (N === 0) { created++; knitHoles.push({ idx: p.idx, carrier: p.carrier, bed, n }); }
        else if (N >= 2) {
          consumed += N - 1; k2togKnits++;
          stackHistogram.set(N, (stackHistogram.get(N) ?? 0) + 1);
          k2togEvents.push({ idx: p.idx, carrier: p.carrier, bed, n, stack: N });
        }
        setN(k, 1);
      }
      const arr = liveByCarrier.get(p.carrier) ?? []; arr.push(occupied()); liveByCarrier.set(p.carrier, arr);
    } else if (isXfer(p.kind)) {
      // K-1 Phase 2 (2026-06-10): a carrier-attributed transfer pass is
      // the vendor's lowering of `split` — the carriage knits a NEW loop
      // on the source needle while moving the old stack across. Plain
      // transfers ride carrier "0". Sophie's 2,823 xfer passes are all
      // carrier-0, so split handling is additive.
      const isSplit = p.carrier !== '0';
      if (isFrontToRear(p.kind)) {
        for (const f of p.f) {
          const s = K('f', f);
          const have = get(s);
          // Legacy semantics move exactly one loop per xfer event — even
          // from an empty source (the boundary "phantom" the sophie
          // conservation pin accounts for). Whole-stack moves them all.
          const moved = wholeStack ? have : 1;
          if (have === 0 && !isSplit) { xferEmpty++; xferEmptyEvents.push({ idx: p.idx, kind: p.kind, bed: 'f', n: f }); }
          const d = K('b', f - p.rack);
          setN(d, get(d) + moved);
          if (isSplit) { created++; setN(s, have - moved + 1); } else setN(s, have - (wholeStack ? have : 1));
          if (get(d) > maxStack) maxStack = get(d);
        }
      } else {
        for (const b of p.r) {
          const s = K('b', b);
          const have = get(s);
          const moved = wholeStack ? have : 1; // see front-bed comment
          if (have === 0 && !isSplit) { xferEmpty++; xferEmptyEvents.push({ idx: p.idx, kind: p.kind, bed: 'b', n: b }); }
          const d = K('f', b + p.rack);
          setN(d, get(d) + moved);
          if (isSplit) { created++; setN(s, have - moved + 1); } else setN(s, have - (wholeStack ? have : 1));
          if (get(d) > maxStack) maxStack = get(d);
        }
      }
    }
  }

  const finalTotal = [...cnt.values()].reduce((a, b) => a + b, 0);
  return {
    xferEmpty, xferEmptyEvents, knitHoles, k2togKnits, k2togEvents, stackHistogram, maxStack, created, consumed, finalTotal,
    increases: (carrier: string) => knitHoles.filter(h => h.carrier === carrier).length,
    live: (carrier: string) => liveByCarrier.get(carrier) ?? [],
    counts: cnt,
  };
}
