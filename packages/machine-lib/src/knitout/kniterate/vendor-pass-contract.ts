import type { CarrierId } from '../types.js';
import {
  KNITOUT_RESOURCE_LIMITS_V1,
  type KnitoutResourceProfileV1,
} from '../parser.js';

export interface VendorLoweringSettings {
  readonly carrierSpacing: number;
  readonly carrierDistance: number;
  readonly resourceLimits: VendorLoweringResourceLimits;
}

/** Internal adapter context selected from a named Studio resource profile. */
export interface VendorLoweringResourceLimits {
  readonly maxPasses: number;
  readonly maxSelections: number;
  readonly maxKCodeRecords: number;
}

export type VendorPositionV1 = 'Left' | 'Center' | 'Right' | 'Keep';

/**
 * Exact affine placement selected by the pinned backend for one lowering run.
 * A front-bed Knitout needle/slot `s` is serialized at KCode column
 * `s + frontSourceSlotToKCodeColumnOffset`. Rear-bed selections additionally
 * depend on the pass rack and are therefore not represented as a fixed source
 * offset here.
 */
export interface VendorKCodeCoordinateMappingV1 {
  readonly schemaVersion: 1;
  readonly position: VendorPositionV1;
  readonly sourceSlotRange: {
    readonly min: number;
    readonly max: number;
  };
  readonly frontSourceSlotToKCodeColumnOffset: number;
  readonly formula: 'kcodeColumn=frontSourceSlot+offset';
}

export function vendorLoweringResourceLimits(
  profile: KnitoutResourceProfileV1,
): VendorLoweringResourceLimits {
  const limits = KNITOUT_RESOURCE_LIMITS_V1[profile];
  return {
    maxPasses: limits.loweredPasses,
    maxSelections: limits.loweredSelections,
    maxKCodeRecords: limits.kcodeRecords,
  };
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
  readonly coordinateMapping: VendorKCodeCoordinateMappingV1;
}
