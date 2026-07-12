import type { CarrierId } from '../types.js';

export interface ShortRowWrapRegistry {
  setWrap(needle: number, carrier: CarrierId): void;
  hasWrap(needle: number): boolean;
  pickUpWrap(needle: number): CarrierId | undefined;
  wrapNeedles(): number[];
}

export class ShortRowWrapState implements ShortRowWrapRegistry {
  private wraps = new Map<number, CarrierId>();

  /** Register a wrap at the given needle. The next resolve row picks
   *  it up. Calling on a needle that already has a wrap overwrites —
   *  nested wraps on the same needle are rare and the cheatsheet caps
   *  stacked tucks at 2, so the emitter that drives this should guard. */
  setWrap(needle: number, carrier: CarrierId): void {
    this.wraps.set(needle, carrier);
  }

  hasWrap(needle: number): boolean {
    return this.wraps.has(needle);
  }

  pickUpWrap(needle: number): CarrierId | undefined {
    const c = this.wraps.get(needle);
    if (c !== undefined) this.wraps.delete(needle);
    return c;
  }

  wrapNeedles(): number[] {
    return [...this.wraps.keys()];
  }
}
