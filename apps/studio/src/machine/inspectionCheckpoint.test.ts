import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openMachineDocument } from '../engine';
import { createMachineInspector } from './inspection';
import { CHECKPOINT_MAX_BYTES, readInspectionCheckpoint, saveInspectionCheckpoint, verifyCheckpointReplay } from './inspectionCheckpoint';

const bytes = new Uint8Array(readFileSync('../../packages/machine-lib/reference/fairisle.kc'));
const inspector = createMachineInspector(openMachineDocument('fairisle.kc', bytes, { dialect: 'knitout-vendor' }));
const navigation = inspector.document.kcode!.inspection!.navigation!;
const context = {
  source: inspector.document.kcode!.document!.rawText,
  profileId: inspector.initial.scene!.profileId,
  profileVersion: inspector.initial.scene!.profileVersion,
  eventCount: navigation.eventCount,
};
const eventIndex = navigation.passes[1]!.actionEventIndices[0]!;
const snapshot = inspector.inspect({ eventIndex }).snapshot!;
async function saved() { return saveInspectionCheckpoint(context, snapshot, new Set([eventIndex, 1])); }

describe('source-bound inspection checkpoints', () => {
  it('reconstructs the exact event and loop state without accepting serialized machine state', async () => {
    const checkpoint = await readInspectionCheckpoint(await saved(), context);
    expect(checkpoint.kcodeSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(checkpoint.breakpoints).toEqual([1, eventIndex]);
    expect(checkpoint).not.toHaveProperty('loopState');
    const fresh = createMachineInspector(openMachineDocument('renamed.kc', bytes, { dialect: 'knitout-vendor' })).inspect({ eventIndex: checkpoint.eventIndex }).snapshot!;
    expect(() => verifyCheckpointReplay(checkpoint, fresh)).not.toThrow();
    expect(fresh.loopState).toEqual(snapshot.loopState);
    expect(fresh.carriers).toEqual(snapshot.carriers);
  });
  it('supports the pre-program cursor with no event anchor', async () => {
    const initial = inspector.inspect({ eventIndex: -1 }).snapshot!;
    const checkpoint = await readInspectionCheckpoint(await saveInspectionCheckpoint(context, initial, new Set()), context);
    expect(checkpoint.eventAnchor).toBeNull();
    expect(() => verifyCheckpointReplay(checkpoint, initial)).not.toThrow();
  });
  it('rejects even a comment-only byte change and a changed execution profile', async () => {
    const text = await saved();
    await expect(readInspectionCheckpoint(text, { ...context, source: context.source + '\n// note' })).rejects.toThrow('exact KCode bytes');
    await expect(readInspectionCheckpoint(text, { ...context, profileVersion: context.profileVersion + 1 })).rejects.toThrow('execution profile');
    await expect(readInspectionCheckpoint(text, { ...context, eventCount: context.eventCount + 1 })).rejects.toThrow('execution profile');
  });
  it('rejects malformed, oversized, out-of-range, duplicate and state-injecting files', async () => {
    const value = JSON.parse(await saved());
    for (const patch of [
      { eventIndex: context.eventCount }, { eventIndex: -2 }, { eventIndex: 0.5 },
      { breakpoints: [-1] }, { breakpoints: [1, 1] }, { breakpoints: [context.eventCount] },
      { breakpoints: Array.from({ length: 1001 }, (_, index) => index) },
      { loopState: { front: [{ count: 9 }] } }, { initialState: 'loaded-bed' },
      { eventAnchor: {} }, { version: 2 },
    ]) await expect(readInspectionCheckpoint(JSON.stringify({ ...value, ...patch }), context)).rejects.toThrow();
    for (const text of ['null', '[]', '{', ' '.repeat(CHECKPOINT_MAX_BYTES + 1)]) await expect(readInspectionCheckpoint(text, context)).rejects.toThrow();
  });
  it('checks the recomputed event anchor before cursor restoration', async () => {
    const checkpoint = await readInspectionCheckpoint(await saved(), context);
    expect(() => verifyCheckpointReplay({ ...checkpoint, eventAnchor: 'tampered' }, snapshot)).toThrow('recomputed execution');
    expect(() => verifyCheckpointReplay(checkpoint, inspector.initial.snapshot)).toThrow('recomputed execution');
    expect(() => verifyCheckpointReplay(checkpoint, null)).toThrow('recomputed execution');
  });
  it('hashes byte-preserving source instead of a UTF-8 re-encoding', async () => {
    const source = context.source + '\n// \u00ff';
    const text = await saveInspectionCheckpoint({ ...context, source }, snapshot, new Set());
    expect(JSON.parse(text).kcodeSha256).toBe(createHash('sha256').update(Buffer.from(source, 'latin1')).digest('hex'));
    await expect(saveInspectionCheckpoint({ ...context, source: source + '\u0100' }, snapshot, new Set())).rejects.toThrow('byte-preserving');
  });
});
