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
    expect(programRegionsForKCode(compiled)).toEqual(['waste', 'draw', 'body', 'body', 'body', 'finish']);
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
});
