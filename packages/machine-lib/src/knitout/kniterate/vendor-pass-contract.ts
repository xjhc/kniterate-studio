import type { CarrierId } from '../types.js';

export interface VendorLoweringSettings {
  readonly carrierSpacing: number;
  readonly carrierDistance: number;
}

/**
 * Exact post-lowering pass emitted by the pinned Kniterate backend.
 *
 * This is intentionally vendor-shaped. `FRNT`/`REAR` include the carriage
 * and carrier markers exactly as serialized, while the numeric stop fields
 * retain the backend's half-needle coordinates. It is an independent oracle
 * for the public KCode parser and MachineTrace projection.
 */
export interface VendorScheduledPass {
  readonly index: number;
  readonly FRNT: string;
  readonly STIF: string;
  readonly REAR: string;
  readonly STIR: string;
  readonly RACK: number;
  readonly direction: '>>' | '<<';
  readonly type: string;
  readonly carrier: CarrierId | '0';
  readonly speed: number;
  readonly roller: number;
  readonly carriageLeft: number;
  readonly carriageRight: number;
  readonly carrierLeft?: number;
  readonly carrierRight?: number;
  readonly isAutoMove: boolean;
  /** One-based Knitout source lines whose operations lowered into this pass. */
  readonly sourceLines: readonly number[];
  readonly comment?: string;
}

export interface VendorScheduledKCode {
  readonly kcode: string;
  readonly passes: readonly VendorScheduledPass[];
}
