import { resolveValidatorMessage } from '@kniterate-studio/machine-lib/browser';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RunSheet } from './App';
import type { MachineDiagnostic, MachineDocument } from './engine';
import { groupForeignRunSheetFindings } from './foreignRunSheetFindings';

function diagnostic(input: {
  readonly id: string;
  readonly rule: string;
  readonly message: string;
  readonly passIndex: number | null;
  readonly line: number | null;
  readonly severity?: 'error' | 'warning' | 'info';
  readonly occurrences?: number;
}): MachineDiagnostic {
  return {
    ...resolveValidatorMessage({
      severity: input.severity ?? 'warning',
      rule: input.rule,
      message: input.message,
    }),
    id: input.id,
    passIndex: input.passIndex,
    actionIndex: null,
    line: input.line,
    sourceSpan: null,
    classification: input.rule === 'machine-trace.drop-empty' ? 'semantic' : 'operational-advisory',
    occurrences: input.occurrences ?? 1,
  };
}

describe('foreign run-sheet findings', () => {
  it('catalogs the machine-trace warning rules without offering a V1 waiver', () => {
    const loopStack = diagnostic({
      id: 'loop',
      rule: 'machine-trace.loop-stack-policy',
      message: 'front:40 reaches 3 modeled loops.',
      passIndex: 6,
      line: 70,
    });
    const emptyDrop = diagnostic({
      id: 'drop',
      rule: 'machine-trace.drop-empty',
      message: 'Drop targets empty front:83.',
      passIndex: 20,
      line: 210,
    });

    expect(loopStack).toMatchObject({
      catalogHit: true,
      title: 'Modeled loop stack exceeds the software threshold',
      fixActions: [],
    });
    expect(emptyDrop).toMatchObject({
      catalogHit: true,
      title: 'Drop targets an empty modeled needle',
      fixActions: [],
    });
  });

  it('groups repeated warnings, totals occurrences, and bounds representative anchors', () => {
    const diagnostics = [
      diagnostic({ id: 'loop-1', rule: 'machine-trace.loop-stack-policy', message: 'front:40 reaches 3 modeled loops.', passIndex: 6, line: 70, occurrences: 2 }),
      diagnostic({ id: 'loop-1-same-anchor', rule: 'machine-trace.loop-stack-policy', message: 'front:41 reaches 3 modeled loops.', passIndex: 6, line: 70 }),
      diagnostic({ id: 'loop-2', rule: 'machine-trace.loop-stack-policy', message: 'front:41 reaches 3 modeled loops.', passIndex: 8, line: 90 }),
      diagnostic({ id: 'loop-3', rule: 'machine-trace.loop-stack-policy', message: 'front:42 reaches 3 modeled loops.', passIndex: 10, line: 110 }),
      diagnostic({ id: 'loop-4', rule: 'machine-trace.loop-stack-policy', message: 'front:43 reaches 3 modeled loops.', passIndex: 12, line: 130 }),
    ];

    const groups = groupForeignRunSheetFindings(diagnostics);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      rule: 'machine-trace.loop-stack-policy',
      occurrences: 6,
    });
    expect(groups[0]?.representatives).toHaveLength(3);
    expect(groups[0]?.representatives.map((item) => item.passIndex)).toEqual([6, 8, 10]);
  });

  it('retains informational observations and their pass anchors for operator handoff', () => {
    const groups = groupForeignRunSheetFindings([
      diagnostic({
        id: 'loop-info',
        rule: 'machine-trace.loop-stack-policy',
        severity: 'info',
        message: 'front:40 reaches 3 modeled loops.',
        passIndex: 6,
        line: 70,
      }),
    ]);

    expect(groups).toEqual([expect.objectContaining({
      severity: 'info',
      rule: 'machine-trace.loop-stack-policy',
      occurrences: 1,
      representatives: [expect.objectContaining({ passIndex: 6, line: 70 })],
    })]);
  });

  it('prints grouped reasons, exact counts, and representative pass/source anchors', () => {
    const diagnostics = [
      diagnostic({ id: 'loop-1', rule: 'machine-trace.loop-stack-policy', message: 'front:40 reaches 3 modeled loops.', passIndex: 6, line: 70, occurrences: 2 }),
      diagnostic({ id: 'loop-2', rule: 'machine-trace.loop-stack-policy', message: 'front:41 reaches 3 modeled loops.', passIndex: 8, line: 90 }),
      diagnostic({ id: 'loop-3', rule: 'machine-trace.loop-stack-policy', message: 'front:42 reaches 3 modeled loops.', passIndex: 10, line: 110 }),
      diagnostic({ id: 'loop-4', rule: 'machine-trace.loop-stack-policy', message: 'front:43 reaches 3 modeled loops.', passIndex: 12, line: 130 }),
      diagnostic({ id: 'drop', rule: 'machine-trace.drop-empty', message: 'Drop targets empty front:83.', passIndex: 20, line: 210 }),
    ];
    const document: MachineDocument = {
      filename: 'warning-reference.kc',
      format: 'kc',
      source: '',
      kcode: null,
      passes: [],
      diagnostics,
      verdict: {
        state: 'blocked',
        label: 'Blocked',
        annotation: 'Imported warnings remain unresolved, so this foreign file is blocked under the conservative V1 policy.',
      },
      sourceDisclosure: {
        carrierLifecycle: 'not-encoded-by-kcode',
        summary: 'KCode bytes do not encode Knitout carrier in/out lifecycle.',
      },
      stats: {
        passCount: 21,
        loopFormingPassCount: 12,
        authoredRowCount: null,
        passMetricProvenance: 'strict-kcode-trace',
        authoredRowProvenance: 'unavailable-for-foreign-machine-file',
        programmedMotion: null,
        carriers: [],
        needleSpan: 'K-code 0-252',
        rackRange: '0',
        infoCount: 0,
        warningCount: 6,
        errorCount: 0,
      },
    };

    const html = renderToStaticMarkup(<RunSheet document={document} onClose={() => undefined} />);

    expect(html).toContain('Modeled loop stack exceeds the software threshold');
    expect(html).toContain('5 occurrences');
    expect(html).toContain('pass 7 / source line 70');
    expect(html).toContain('pass 9 / source line 90');
    expect(html).toContain('pass 11 / source line 110');
    expect(html).not.toContain('pass 13 / source line 130');
    expect(html).toContain('front:40 reaches 3 modeled loops.');
    expect(html).toContain('Programmed passes');
    expect(html).toContain('Loop-forming passes');
    expect(html).toContain('Authored design rows');
    expect(html).toContain('foreign file has no row provenance');
    expect(html).toContain('Drop targets an empty modeled needle');
    expect(html).toContain('KCode bytes do not encode Knitout carrier in/out lifecycle.');
    expect(html).toContain('editor/profile checks are not physical safety approval');
    expect(html).toContain('1 occurrence');
    expect(html).not.toContain('Compiler reported an issue');
  });
});
