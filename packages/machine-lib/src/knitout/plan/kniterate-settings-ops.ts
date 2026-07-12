/**
 * Machine-effective Kniterate setting ops.
 *
 * The vendored backend consumes these as `x-*` ops in the knitout body. Some
 * settings are also preserved in `KnitoutProgram.kniterate` for diagnostics,
 * but comment headers alone are not enough to affect generated k-code.
 */

import {
  xCarrierSpacing,
  xCarrierStoppingDistance,
  xRollerAdvance,
  xSpeedNumber,
  xStitchNumber,
  xXferStitchNumber,
  xXferStyle,
  type KniterateExtensionHeaders,
  type KnitoutOp,
} from '../types.js';

export type MachineEffectiveKniterateSetting =
  | 'rollerAdvance'
  | 'stitchNumber'
  | 'xferStitchNumber'
  | 'speedNumber'
  | 'xferStyle'
  | 'carrierSpacing'
  | 'carrierStoppingDistance';

export const MACHINE_EFFECTIVE_KNITERATE_SETTINGS: readonly MachineEffectiveKniterateSetting[] = [
  'rollerAdvance',
  'stitchNumber',
  'xferStitchNumber',
  'speedNumber',
  'xferStyle',
  'carrierSpacing',
  'carrierStoppingDistance',
] as const;

export function emitKniterateSettingsOps(settings: Partial<KniterateExtensionHeaders>): KnitoutOp[] {
  const ops: KnitoutOp[] = [];
  if (settings.rollerAdvance !== undefined) ops.push(xRollerAdvance(settings.rollerAdvance));
  if (settings.stitchNumber !== undefined) ops.push(xStitchNumber(settings.stitchNumber));
  if (settings.xferStitchNumber !== undefined) ops.push(xXferStitchNumber(settings.xferStitchNumber));
  if (settings.speedNumber !== undefined) ops.push(xSpeedNumber(settings.speedNumber));
  if (settings.xferStyle !== undefined) ops.push(xXferStyle(settings.xferStyle));
  if (settings.carrierSpacing !== undefined) ops.push(xCarrierSpacing(settings.carrierSpacing));
  if (settings.carrierStoppingDistance !== undefined) {
    ops.push(xCarrierStoppingDistance(settings.carrierStoppingDistance));
  }
  return ops;
}
