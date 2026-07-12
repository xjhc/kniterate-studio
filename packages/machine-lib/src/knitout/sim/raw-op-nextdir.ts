/**
 * Compatibility shim. Phase E moved raw-op direction accounting under
 * `carriage-simulator.ts` so xfer batching and nextDirection ownership
 * live with the simulator. Existing callers can keep this import path
 * until the dirty compile-chart dispatcher stream is ready to retarget.
 */
export type { AdvanceNextDirOptions } from './carriage-simulator.js';
export { advanceNextDirectionThroughRawOps } from './carriage-simulator.js';
