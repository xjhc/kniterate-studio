import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  MachineTraceActionV1,
  MachineTracePassV1,
  MachineTraceSelectionV1,
  MachineTraceV1,
} from '@kniterate-studio/machine-lib/browser';
import { FabricPreviewPanel } from './ForeignFabricView';
import { openMachineDocument } from '../engine';
import { compileForeignFabricPreview, createForeignFabricCompiler } from './compileForeignFabricPreview';

const span = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 1, line: 1, column: 2 },
} as const;

function selection(traceCoordinate: number): MachineTraceSelectionV1 {
  return {
    bed: 'front',
    payloadIndex: traceCoordinate + 15,
    kcodeColumn: traceCoordinate,
    traceCoordinate,
    stitchSelector: { token: '6', encodedValue: 6, sourceSpan: span },
    sourceSpan: span,
  };
}

function pass(index: number, action: MachineTraceActionV1): MachineTracePassV1 {
  const selected = action.kind === 'knit' ? [action.at] : [];
  return {
    index,
    raw: { FRNT: '', STIF: '', REAR: '', STIR: '', footer: '' },
    source: { span, fullSpan: span, FRNT: span, STIF: span, REAR: span, STIR: span, footer: span },
    rack: 0,
    direction: index % 2 === 0 ? '>>' : '<<',
    operation: 'Kn-Kn',
    carrier: '2',
    speedRaw: '300',
    speed: 300,
    rollerRaw: '450',
    roller: 450,
    carriageStops: { left: -2.5, right: 12.5 },
    carrierStops: { left: -1.5, right: 11.5 },
    selections: { front: selected, rear: [] },
    actions: [action],
  };
}

function trace(actions: readonly MachineTraceActionV1[]): MachineTraceV1 {
  return {
    schemaVersion: 1,
    sourceDocumentSchemaVersion: 1,
    profileId: 'kniterate-7gg-kcode',
    profileVersion: 2,
    dialect: 'knitout-vendor',
    rackCommands: [],
    passes: actions.map((action, index) => pass(index, action)),
  };
}

describe('foreign fabric topology Worker compiler', () => {
  it('opens every accepted reference through the real import and bounded Worker pipeline', () => {
    const names = ['2x2-rib-beanie', 'back', 'color-swatch-bindoff', 'dbj', 'fairisle', 'front', 'jacquard', 'sleeves', 'sophie', 'sophie2', 'sophie_stripe', 'swatch'];
    for (const name of names) {
      const bytes = new Uint8Array(readFileSync(new URL(`../../../../packages/machine-lib/reference/${name}.kc`, import.meta.url)));
      const document = openMachineDocument(`${name}.kc`, bytes, { dialect: 'knitout-vendor' });
      expect(document.verdict.state, name).toBe('surface');
      const response = compileForeignFabricPreview({ kind: 'project-foreign-topology', requestId: 1, trace: document.kcode!.trace! });
      expect(response.kind, name).toBe('foreign-topology-complete');
      if (response.kind !== 'foreign-topology-complete') throw new Error(response.error);
      expect(response.mesh.nodes.length, name).toBeGreaterThan(0);
      expect(response.mesh.nodes.length).toBeLessThanOrEqual(6_000);
      expect(response.mesh.edges.length).toBeLessThanOrEqual(18_000);
      expect(response.summary.loopCount).toBeGreaterThan(response.mesh.nodes.length);
    }
  }, 60_000);

  it('retains full lineage in the Worker while returning only the requested window', () => {
    const compile = createForeignFabricCompiler();
    const actions = Array.from({ length: 30 }, () => ({ kind: 'knit' as const, at: selection(4) }));
    compile({ kind: 'project-foreign-topology', requestId: 1, trace: trace(actions) });
    const response = compile({ kind: 'window-foreign-topology', requestId: 2, selectedPass: 20, radius: 0, loopId: 20 });
    expect(response.kind).toBe('foreign-topology-complete');
    if (response.kind !== 'foreign-topology-complete') throw new Error(response.error);
    expect(response.mesh.nodes.map(node => node.loopId)).toEqual([20]);
    expect(response.inspection?.parents.map(loop => loop.id)).toEqual([19]);
    expect(response.inspection?.previousCarrierLoop?.id).toBe(19);
    expect(response.incomingBoundaryConnections).toBe(2);
    expect(response.summary.loopCount).toBe(30);
    const markup = renderToStaticMarkup(<FabricPreviewPanel state={{ status: 'ready', ...response }} />);
    expect(markup).toContain('Loop 20 · P20');
    expect(markup).toContain('Creation: P21, action 1');
  });

  it('returns a deterministic schematic mesh and renders its evidence boundary', () => {
    const first = selection(4);
    const second = selection(4);
    const response = compileForeignFabricPreview({
      kind: 'project-foreign-topology',
      requestId: 7,
      trace: trace([{ kind: 'knit', at: first }, { kind: 'knit', at: second }]),
    });

    expect(response.kind).toBe('foreign-topology-complete');
    if (response.kind !== 'foreign-topology-complete') throw new Error(response.error);
    expect(response.requestId).toBe(7);
    expect(response.mesh.renderingClaim).toBe('schematic-topology-not-physical-fabric');
    expect(response.mesh.nodes).toHaveLength(2);
    expect(response.mesh.edges).toContainEqual(expect.objectContaining({ kind: 'formed-through' }));
    expect(response.summary).toMatchObject({ loopCount: 2, liveLoopCount: 1, consumedLoopCount: 1 });

    const markup = renderToStaticMarkup(<FabricPreviewPanel state={{
      status: 'ready',
      ...response,
    }} />);
    expect(markup).toContain('Surface-proven topology');
    expect(markup).toContain('not physical fabric');
    expect(markup).toContain('not physical needle labels');
    expect(markup).toContain('Carrier entry/exit is unknown');
    expect(markup).toContain('<svg');
    expect(markup).toContain('formed-through');
  });

  it('fails closed on unknown actions and renders blocked state without a mesh', () => {
    const response = compileForeignFabricPreview({
      kind: 'project-foreign-topology',
      requestId: 8,
      trace: trace([{
        kind: 'unknown',
        operation: 'Bogus-Op',
        reason: 'unsupported-operation',
        selections: [],
      }]),
    });
    expect(response).toMatchObject({
      kind: 'foreign-topology-failed',
      requestId: 8,
      code: 'unknown-action',
      passIndex: 0,
      actionIndex: 0,
    });

    const markup = renderToStaticMarkup(<FabricPreviewPanel state={{
      status: 'blocked',
      reason: 'Strict validation is blocked.',
    }} />);
    expect(markup).toContain('Topology preview withheld');
    expect(markup).toContain('Strict validation is blocked.');
    expect(markup).not.toContain('fabric-canvas');
  });
});
