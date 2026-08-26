import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  MachineSceneV1,
  MachineValidationReportV1,
} from '@kniterate-studio/machine-lib/browser';
import { MachineMovementView } from './MachineMovementView';

const front = {
  bed: 'front' as const,
  payloadIndex: 55,
  kcodeColumn: 40,
  traceCoordinate: 39,
  stitchSelector: { token: '6', encodedValue: 6 },
};
const rear = {
  bed: 'rear' as const,
  payloadIndex: 55,
  kcodeColumn: 40,
  traceCoordinate: 39,
  stitchSelector: { token: '5', encodedValue: 5 },
};

const SCENE: MachineSceneV1 = {
  schemaVersion: 1,
  sourceTraceSchemaVersion: 1,
  profileId: 'kniterate-7gg-kcode',
  profileVersion: 1,
  dialect: 'knitout-vendor',
  rackCommands: [{
    index: 0,
    beforePassIndex: 0,
    fromRack: 0,
    toRack: 1,
    valueRaw: '1',
    sourceSpan: { start: { offset: 5, line: 2, column: 1 }, end: { offset: 11, line: 2, column: 7 } },
  }, {
    index: 1,
    beforePassIndex: 0,
    fromRack: 1,
    toRack: 0,
    valueRaw: '0',
    sourceSpan: { start: { offset: 12, line: 3, column: 1 }, end: { offset: 18, line: 3, column: 7 } },
  }],
  displayDomain: {
    kcodeCoordinate: { min: 30.5, max: 80.5 },
    traceCoordinate: { min: 39, max: 39 },
  },
  passes: [{
    passIndex: 0,
    direction: '>>',
    operation: 'Tr-Rl',
    carrier: '2',
    rack: 0,
    speed: { raw: '300', value: 300 },
    roller: { raw: '450', value: 450 },
    movement: {
      carriage: { fromStopCoordinate: 30.5, toStopCoordinate: 80.5 },
      carrierGuide: { carrier: '2', fromStopCoordinate: 34.5, toStopCoordinate: 76.5 },
    },
    beds: { front: [front], rear: [rear] },
    actionGlyphs: [{ geometry: 'edge', semantic: 'split', source: front, target: rear, carrier: '2' }],
  }, {
    passIndex: 1,
    direction: '<<',
    operation: 'Kn-Kn',
    carrier: '0',
    rack: 0,
    speed: { raw: '300', value: 300 },
    roller: { raw: '0', value: 0 },
    movement: {
      carriage: { fromStopCoordinate: 80.5, toStopCoordinate: 30.5 },
      carrierGuide: null,
    },
    beds: { front: [], rear: [] },
    actionGlyphs: [{
      geometry: 'travel',
      semantic: 'move',
      carrier: '0',
      movement: {
        carriage: { fromStopCoordinate: 80.5, toStopCoordinate: 30.5 },
        carrierGuide: null,
      },
    }],
  }],
};

const emptyMetrics = {
  occupiedNeedles: 0,
  totalLoops: 0,
  maxStack: 0,
} as const;

const emptyState = {
  ...emptyMetrics,
  stacks: {},
  front: [],
  rear: [],
} as const;

const VALIDATION: MachineValidationReportV1 = {
  ok: true,
  diagnostics: [],
  errorCount: 0,
  warningCount: 0,
  passStates: [{
    passIndex: 0,
    before: {
      occupiedNeedles: 1,
      totalLoops: 1,
      maxStack: 1,
    },
    after: {
      occupiedNeedles: 2,
      totalLoops: 2,
      maxStack: 1,
    },
    stackDeltas: [
      { bed: 'front', traceCoordinate: 39, beforeCount: 1, afterCount: 1 },
      { bed: 'rear', traceCoordinate: 39, beforeCount: 0, afterCount: 1 },
    ],
  }, {
    passIndex: 1,
    before: emptyMetrics,
    after: emptyMetrics,
    stackDeltas: [],
  }],
  finalState: emptyState,
  operationalAssurance: {
    status: 'not-established-by-software-validation',
    carrierLifecycle: 'not-encoded-in-kcode',
    initialLoopState: 'empty-bed-job-assumption',
    limitations: [{
      code: 'physical-needle-numbering-unverified',
      message: 'Trace coordinates are not physical needle labels.',
    }],
  },
};

describe('MachineMovementView', () => {
  it('renders synchronized movement, beds, split edge, commands, and loop state', () => {
    const markup = renderToStaticMarkup(<MachineMovementView
      scene={SCENE}
      validation={VALIDATION}
      selectedPass={0}
      onSelect={() => {}}
    />);

    expect(markup).toContain('Exact machine movement');
    expect(markup).toContain('P0001');
    expect(markup).toContain('Tr-Rl');
    expect(markup).toContain('Carriage stops');
    expect(markup).toContain('30.5');
    expect(markup).toContain('80.5');
    expect(markup).toContain('Rack command stream');
    expect(markup).toContain('before P0001');
    expect(markup).toContain('1→0');
    expect(markup).toContain('is-selected-boundary');
    expect(markup).toContain('mmv-action-split');
    expect(markup).toContain('front K40 / trace 39');
    expect(markup).toContain('1→1 loops');
    expect(markup).toContain('0→1 loops');
    expect(markup).toContain('aria-label="Loops: 1 before, 2 after"');
    expect(markup).toContain('No KCode replay findings on this pass');
    expect(markup).toContain('KCode coordinates; physical needle labels unverified.');
    expect(markup).toContain('canonical raster v1');
    expect(markup).not.toContain('>knitout-vendor<');
    expect(markup).toContain('<dl class="mmv-loop-state">');
    expect(markup).toContain('operational assurance not established');
    expect(markup).toContain('physical-needle-numbering-unverified');
  });

  it('keeps pass controls native and reports detached validation honestly', () => {
    const markup = renderToStaticMarkup(<MachineMovementView
      scene={SCENE}
      selectedPass={1}
      onSelect={() => {}}
    />);

    expect(markup).toContain('aria-label="Select previous pass"');
    expect(markup).toContain('aria-label="Select next pass"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('carrierless pass');
    expect(markup).toContain('KCode replay not attached');
    expect(markup).toContain('aria-label="Loops: validation state not attached"');
  });

  it('keeps whole-artifact status separate from selected-pass replay status', () => {
    const markup = renderToStaticMarkup(<MachineMovementView
      scene={SCENE}
      validation={VALIDATION}
      overallContext={{ status: 'blocked', label: 'Scheduled-pass differential mismatch outside this pass.' }}
      selectedPass={0}
      onSelect={() => {}}
    />);

    expect(markup).toContain('No KCode replay findings on this pass');
    expect(markup).toContain('Whole output');
    expect(markup).toContain('Scheduled-pass differential mismatch outside this pass.');
  });

  it('uses product-boundary informational severity without mutating raw validation', () => {
    const warningValidation: MachineValidationReportV1 = {
      ...VALIDATION,
      warningCount: 1,
      diagnostics: [{
        severity: 'warning',
        class: 'operational-advisory',
        rule: 'machine-trace.loop-stack-policy',
        message: 'front:40 reaches 3 modeled loops.',
        passIndex: 0,
        sourceSpan: null,
        line: null,
        column: null,
        endLine: null,
        endColumn: null,
      }],
    };
    const markup = renderToStaticMarkup(<MachineMovementView
      scene={SCENE}
      validation={warningValidation}
      displayDiagnostics={[{
        severity: 'info',
        passIndex: 0,
        rule: 'machine-trace.loop-stack-policy',
        message: 'front:40 reaches 3 modeled loops.',
      }]}
      selectedPass={0}
      onSelect={() => {}}
    />);

    expect(markup).toContain('1 informational KCode replay note on this pass');
    expect(markup).not.toContain('KCode replay warning');
  });

  it('renders transfer edges separately from split edges', () => {
    const firstPass = SCENE.passes[0]!;
    const transferScene: MachineSceneV1 = {
      ...SCENE,
      passes: [{
        ...firstPass,
        carrier: '0',
        movement: { ...firstPass.movement, carrierGuide: null },
        actionGlyphs: [{ geometry: 'edge', semantic: 'xfer', source: front, target: rear }],
      }],
    };
    const markup = renderToStaticMarkup(<MachineMovementView
      scene={transferScene}
      selectedPass={0}
      onSelect={() => {}}
    />);
    expect(markup).toContain('mmv-action-xfer');
    expect(markup).toContain('mmv-transfer-');
    expect(markup).toContain('transfer');
  });

  it('renders a directional empty state without inventing a coordinate domain', () => {
    const markup = renderToStaticMarkup(<MachineMovementView
      scene={{ ...SCENE, displayDomain: null, passes: [] }}
      selectedPass={null}
      onSelect={() => {}}
    />);
    expect(markup).toContain('No programmed passes');
    expect(markup).toContain('renders only projected MachineScene data');
  });

  it('windows an adversarial rack ledger around the selected pass boundary', () => {
    const sourceSpan = SCENE.rackCommands[0]!.sourceSpan;
    const rackCommands = Array.from({ length: 49_990 }, (_, index) => ({
      index,
      beforePassIndex: 0,
      fromRack: 0,
      toRack: 0,
      valueRaw: '0',
      sourceSpan,
    }));
    const markup = renderToStaticMarkup(<MachineMovementView
      scene={{ ...SCENE, rackCommands }}
      validation={VALIDATION}
      selectedPass={0}
      onSelect={() => {}}
    />);

    expect(markup).toContain('49,990');
    expect(markup).toContain('Showing commands #49890–#49990 of 49,990');
    expect(markup.match(/<i>#/g)).toHaveLength(101);
    expect(markup.length).toBeLessThan(100_000);
  });
});
