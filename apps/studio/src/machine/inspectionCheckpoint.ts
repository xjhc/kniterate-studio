import type { MachineExecutionInspectionV1 } from '@kniterate-studio/machine-lib/browser';
import { sha256Bytes } from '../kcode/sha256';

export const CHECKPOINT_MAX_BYTES = 64 * 1024;
export interface CheckpointContext {
  source: string;
  profileId: string;
  profileVersion: number;
  eventCount: number;
}
interface InspectionCheckpoint {
  kind: 'kniterate-inspection-checkpoint';
  version: 1;
  initialState: 'empty-bed-model';
  kcodeSha256: string;
  profileId: string;
  profileVersion: number;
  eventCount: number;
  eventIndex: number;
  eventAnchor: string | null;
  breakpoints: number[];
}
function anchor(snapshot: MachineExecutionInspectionV1): string | null {
  const event = snapshot.event;
  return event === null ? null : JSON.stringify([event.id, event.kind, event.sourceSpan]);
}
async function sourceHash(source: string): Promise<string> {
  // KCode rawText is one code unit per byte. Never re-encode it as UTF-8.
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) > 255) throw new Error('Checkpoint source is not byte-preserving KCode.');
  return sha256Bytes(Uint8Array.from(source, (character) => character.charCodeAt(0)));
}
export async function saveInspectionCheckpoint(context: CheckpointContext, snapshot: MachineExecutionInspectionV1, breakpoints: ReadonlySet<number>): Promise<string> {
  const checkpoint: InspectionCheckpoint = {
    kind: 'kniterate-inspection-checkpoint', version: 1, initialState: 'empty-bed-model',
    kcodeSha256: await sourceHash(context.source), profileId: context.profileId, profileVersion: context.profileVersion,
    eventCount: context.eventCount, eventIndex: snapshot.eventIndex, eventAnchor: anchor(snapshot),
    breakpoints: [...breakpoints].sort((a, b) => a - b),
  };
  const text = JSON.stringify(checkpoint, null, 2);
  // Apply the same resource and shape contract to our own exports.
  await readInspectionCheckpoint(text, context);
  return text;
}
export async function readInspectionCheckpoint(text: string, context: CheckpointContext): Promise<InspectionCheckpoint> {
  if (text.length > CHECKPOINT_MAX_BYTES || new TextEncoder().encode(text).length > CHECKPOINT_MAX_BYTES) throw new Error('Inspection checkpoint exceeds 64 KiB.');
  const value = JSON.parse(text) as InspectionCheckpoint;
  const keys = ['kind', 'version', 'initialState', 'kcodeSha256', 'profileId', 'profileVersion', 'eventCount', 'eventIndex', 'eventAnchor', 'breakpoints'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))
    || value.kind !== 'kniterate-inspection-checkpoint' || value.version !== 1 || value.initialState !== 'empty-bed-model'
    || typeof value.kcodeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.kcodeSha256)
    || (value.eventAnchor !== null && (typeof value.eventAnchor !== 'string' || value.eventAnchor.length > 2048))
    || !Number.isInteger(value.eventIndex) || value.eventIndex < -1 || value.eventIndex >= context.eventCount
    || !Array.isArray(value.breakpoints) || value.breakpoints.length > 1000 || new Set(value.breakpoints).size !== value.breakpoints.length
    || value.breakpoints.some((event) => !Number.isInteger(event) || event < 0 || event >= context.eventCount)) {
    throw new Error('Invalid inspection checkpoint. Only a cursor and up to 1,000 breakpoints are accepted.');
  }
  if (value.profileId !== context.profileId || value.profileVersion !== context.profileVersion || value.eventCount !== context.eventCount) throw new Error('Inspection checkpoint does not match this execution profile.');
  if (value.kcodeSha256 !== await sourceHash(context.source)) throw new Error('Inspection checkpoint does not match the exact KCode bytes.');
  return value;
}
export function verifyCheckpointReplay(checkpoint: InspectionCheckpoint, snapshot: MachineExecutionInspectionV1 | null): void {
  if (!snapshot || snapshot.eventIndex !== checkpoint.eventIndex || anchor(snapshot) !== checkpoint.eventAnchor) throw new Error('Inspection checkpoint event does not match the recomputed execution.');
}
