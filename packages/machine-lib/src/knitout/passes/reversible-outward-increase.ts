import { CarriageSimulator } from '../sim/carriage-simulator.js';
import { b, comment, f, type CarrierId, type Direction, type KnitoutOp } from '../types.js';

export interface ReversibleOutwardIncreaseInput {
  readonly sim: CarriageSimulator;
  readonly lo: number;
  readonly hi: number;
  readonly side: 'left' | 'right';
  readonly frontCarrier: CarrierId;
  readonly rearCarrier: CarrierId;
  /** Zero-based first cycle; completion is the following cycle. */
  readonly sourceRow: number;
}

/**
 * Gate 3's reviewed O schedule, plus the borrowed-loop control at the other
 * edge. Experimental: not wired into the production chart/diamond compiler.
 * The caller supplies one live loop on both beds throughout lo..hi and empty
 * new columns, and must finish both cycles before any further shaping.
 * Terminal splits and this two-bed construction remain physically untested.
 */
export function emitReversibleOutwardIncrease(input: ReversibleOutwardIncreaseInput): KnitoutOp[] {
  const { sim, lo, hi, side, frontCarrier: A, rearCarrier: B, sourceRow } = input;
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 2 || hi > 251 || hi - lo < 3) throw new Error('Outward increase needs at least four columns and one free column at each edge');
  if (A === B || sim.positionOf(A)?.side !== (side === 'right' ? 'left' : 'right') || sim.positionOf(B)?.side !== side) throw new Error('Outward increase requires the front-ground feeder opposite the candidate edge and the rear-ground feeder at it');
  if (!Number.isInteger(sourceRow) || sourceRow < 0) throw new Error('Outward increase requires a source cycle');
  if (sim.finalize().length) throw new Error('Drain earlier operations before the outward increase');

  const ops: KnitoutOp[] = [];
  // Reflect the whole reviewed right-edge schedule; never swap yarns or beds.
  const n = (column: number) => side === 'right' ? column : lo + hi - column;
  const d = (direction: Direction): Direction => side === 'right' ? direction : direction === '+' ? '-' : '+';
  const rack = (value: number) => side === 'right' ? value : -value;
  const slot = (name: string, cycle: number, emit: () => void) => {
    sim.setSourceRows([sourceRow + cycle - 1]);
    ops.push(comment(`GATE3 ${name} cycle ${sourceRow + cycle}`));
    emit();
    ops.push(...sim.drainOps());
  };
  const fetch = () => { sim.setSpeed(600); sim.setRoller(0); sim.parkCarriage(); };
  const move = (carrier: CarrierId, direction: Direction, column: number) => {
    sim.setSpeed(200); sim.setRoller(0); sim.miss(carrier, d(direction), f(n(column)));
  };
  const knit = (carrier: CarrierId, direction: Direction, bed: 'f' | 'b', column: number) => sim.knit(carrier, d(direction), bed === 'f' ? f(n(column)) : b(n(column)));
  const settings = (roller: number) => { sim.setSpeed(200); sim.setStitch(7); sim.setRoller(roller); };
  const split = (direction: Direction, column: number, first: boolean) => {
    // A knit-first pass keeps its first knit's 450. A split-first pass needs
    // the vendor's one-shot increment (ordinary roller is ignored by split).
    if (first) sim.addRollerAdvance(450);
    sim.split(A, d(direction), f(n(column)), b(n(column)));
  };
  sim.setPresserSpeed(600); sim.setPresserRoller(0); sim.setRacking(0);
  if (sim.finalNextDirection() !== d('-')) slot('Q0', 1, fetch);
  slot('Q1', 1, fetch);
  slot('Q2', 1, () => move(A, '+', lo));
  slot('Q3', 1, () => move(A, '-', lo - 1));
  slot('Q4', 1, fetch);
  slot('Q5', 1, () => move(B, '-', hi));
  slot('Q6', 1, () => move(B, '+', hi + 1));
  slot('Q7', 1, () => {
    sim.setSpeed(100); sim.setRoller(0); sim.setXferStitch(5); sim.setRacking(rack(-1));
    sim.xferBatch([{ from: b(n(lo)), to: f(n(lo - 1)) }]);
  });
  slot('Q8', 1, () => {
    sim.setRacking(rack(1));
    sim.xferBatch([{ from: b(n(hi)), to: f(n(hi + 1)) }]);
    sim.setRacking(0);
  });
  slot('Q9', 1, fetch);
  slot('O1', 1, () => { settings(0); knit(A, '+', 'b', lo - 1); });
  slot('O2', 1, () => move(A, '-', lo - 1));
  slot('O3', 1, () => {
    settings(450);
    for (let x = lo; x <= hi; x++) knit(A, '+', 'f', x);
    split('+', hi + 1, false);
  });
  slot('O4', 1, () => {
    settings(450); knit(B, '-', 'b', hi + 1);
    for (let x = hi - 1; x >= lo; x--) knit(B, '-', 'b', x);
    knit(B, '-', 'f', lo - 1);
  });
  slot('O5', 2, fetch);
  slot('O6', 2, () => { settings(0); knit(A, '-', 'b', hi + 1); });
  slot('O7', 2, () => move(A, '+', hi + 1));
  slot('O8', 2, () => {
    settings(450); split('-', hi, true);
    for (let x = hi - 1; x >= lo - 1; x--) knit(A, '-', 'f', x);
  });
  slot('O9', 2, () => {
    settings(450);
    for (let x = lo - 1; x <= hi; x++) knit(B, '+', 'b', x);
    knit(B, '+', 'f', hi + 1);
  });
  return ops;
}
