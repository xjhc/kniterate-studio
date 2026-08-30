import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  MachineTraceActionV1,
  MachineTracePassV1,
  MachineTraceSelectionV1,
  MachineTraceV1,
} from '@kniterate-studio/machine-lib/browser';
import { FabricPreviewPanel } from './ForeignFabricView';
import { compileForeignFabricPreview } from './compileForeignFabricPreview';

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
      mesh: response.mesh,
      summary: response.summary,
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
