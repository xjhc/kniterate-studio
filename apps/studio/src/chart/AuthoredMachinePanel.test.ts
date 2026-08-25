import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { KCodeArtifact } from '../kcode/kcodeProtocol';
import { AuthoredMachinePanel, programRegionsForKCode } from './AuthoredMachinePanel';

function artifact(passes: Array<{ carrier: string; sourceRows?: number[] }>): KCodeArtifact {
  return {
    scene: { passes: passes.map((pass, passIndex) => ({ passIndex, carrier: pass.carrier })) },
    passProvenance: passes.map((pass, passIndex) => ({ passIndex, sourceRows: pass.sourceRows ?? [] })),
  } as unknown as KCodeArtifact;
}

describe('authored machine program regions', () => {
  it('uses compiler provenance and reserved frame carriers to split the full program', () => {
    const compiled = artifact([
      { carrier: '6' },
      { carrier: '1' },
      { carrier: '2', sourceRows: [0] },
      { carrier: '0', sourceRows: undefined },
      { carrier: '3', sourceRows: [1] },
      { carrier: '0' },
    ]);
    const regions = programRegionsForKCode(compiled);
    expect(regions).toEqual(['waste', 'draw', 'body', 'body', 'body', 'finish']);
    expect(programRegionsForKCode(compiled)).toBe(regions);
  });

  it('keeps a frame-only program inspectable', () => {
    const compiled = artifact([{ carrier: '6' }, { carrier: '1' }]);
    expect(programRegionsForKCode(compiled)).toEqual(['waste', 'draw']);
  });

  it('surfaces completed strict-parser failure instead of a clean or progress state', () => {
    const invalid = {
      scene: null,
      ok: false,
      messages: [{ severity: 'error', rule: 'kcode.invalid-raster-width', message: 'KCode 4:1: FRNT raster width is invalid.' }],
      validation: null,
      passProvenance: [],
      rowPasses: [],
    } as unknown as KCodeArtifact;
    const markup = renderToStaticMarkup(createElement(AuthoredMachinePanel, {
      artifact: null,
      kcode: invalid,
      outputStatus: 'ready',
      outputError: null,
      focusedRowId: null,
      selectedPass: null,
      region: 'body',
      onRegion: () => {},
      onPass: () => {},
      mobileActive: true,
    }));

    expect(markup).toContain('emitted KCode blocked');
    expect(markup).toContain('kcode.invalid-raster-width');
    expect(markup).not.toContain('Validating emitted KCode');
    expect(markup).not.toContain('No findings for this selection');
  });

  it('surfaces worker failure when no artifact was produced', () => {
    const markup = renderToStaticMarkup(createElement(AuthoredMachinePanel, {
      artifact: null,
      kcode: null,
      outputStatus: 'failed',
      outputError: 'Converter worker terminated.',
      focusedRowId: null,
      selectedPass: null,
      region: 'body',
      onRegion: () => {},
      onPass: () => {},
      mobileActive: true,
    }));

    expect(markup).toContain('KCode generation failed');
    expect(markup).toContain('Converter worker terminated.');
    expect(markup).not.toContain('spin-dot');
  });

  it('joins compiler diagnostics by stable row ID, never pre-lowering pass position', () => {
    const passes = Array.from({ length: 70 }, (_, passIndex) => ({
      passIndex,
      carrier: '2',
      direction: passIndex % 2 === 0 ? '>>' : '<<',
      operation: 'Kn-Kn',
      speed: { value: 300 },
    }));
    const passProvenance = passes.map(({ passIndex }) => ({
      passIndex,
      sourceRows: passIndex === 28 || passIndex === 29 ? [8] : [],
      rowIds: passIndex === 28 || passIndex === 29 ? ['row_0002'] : [],
      isAutoMove: false,
    }));
    const emitted = {
      scene: { passes },
      passProvenance,
      rowPasses: [
        { rowId: 'row_0001', passIndices: [30, 31] },
        { rowId: 'row_0002', passIndices: [28, 29] },
      ],
      validation: null,
      messages: [],
      ok: true,
    } as unknown as KCodeArtifact;
    const predicted = {
      stats: { designRows: 10 },
      rowProvenance: [
        { rowId: 'row_0001', displayRow: 10, passIndices: [28, 29] },
        { rowId: 'row_0002', displayRow: 9, passIndices: [26, 27] },
      ],
      diagnostics: [
        { severity: 'warning', rule: 'row-one-warning', message: 'Warning owned by row one.', rowId: 'row_0001', passIndices: [28, 29] },
        { severity: 'warning', rule: 'row-two-warning', message: 'Warning owned by row two.', rowId: 'row_0002', passIndices: [26, 27] },
      ],
    } as never;

    const markup = renderToStaticMarkup(createElement(AuthoredMachinePanel, {
      artifact: predicted,
      kcode: emitted,
      outputStatus: 'ready',
      outputError: null,
      focusedRowId: 'row_0002',
      selectedPass: 28,
      region: 'body',
      onRegion: () => {},
      onPass: () => {},
      mobileActive: true,
    }));

    expect(markup).toContain('row-two-warning');
    expect(markup).toContain('Warning owned by row two.');
    expect(markup).not.toContain('row-one-warning');
    expect(markup).not.toContain('Warning owned by row one.');
  });
});
