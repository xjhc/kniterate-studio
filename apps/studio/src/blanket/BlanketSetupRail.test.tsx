import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createColorworkProjectV1, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { BlanketSetupRail, parseWasteRowsInputV1 } from './BlanketSetupRail';
import { compileColorworkProject } from './compileProject';

describe('BlanketSetupRail physical verdict', () => {
  it('filters invalid waste-row blur values before they reach project history', () => {
    expect(parseWasteRowsInputV1('')).toBeNull();
    expect(parseWasteRowsInputV1('NaN')).toBeNull();
    expect(parseWasteRowsInputV1('1')).toBeNull();
    expect(parseWasteRowsInputV1('3')).toBeNull();
    expect(parseWasteRowsInputV1('4')).toBe(4);
    expect(parseWasteRowsInputV1('200')).toBe(200);
    expect(parseWasteRowsInputV1('201')).toBeNull();
  });

  it('shows Knit-proven only when an exact registry entry is supplied', () => {
    const project = createColorworkProjectV1({
      kind: 'knitlab-colorwork-chart', version: 1, title: 'proof', width: 12, height: 8,
      rowNumbering: 'bottom-up',
      palette: [{ id: 'natural', name: 'Natural', hex: '#f1ede3' }],
      cells: Array.from({ length: 8 }, () => Array(12).fill(0)),
    }, { id: 'physical-proof', title: 'proof' });
    const state = materializeColorworkProject(project).state;
    const artifact = compileColorworkProject(project);
    const markup = renderToStaticMarkup(<BlanketSetupRail
      state={state}
      compile={{ status: 'ready', artifact, error: null, comparisons: [] }}
      outputStatus="ready"
      outputError={null}
      authoredVerdict={{
        state: 'knit',
        label: 'Knit-proven',
        annotation: 'Exact compiled artifact match.',
        evidenceId: '2026-07-12-proof',
      }}
      onWidth={() => {}}
      onHeight={() => {}}
      onNeedleOffset={() => {}}
      onStrategy={() => {}}
      onBirdseyeMode={() => {}}
      onFloatLimit={() => {}}
      onAssignment={() => {}}
      onFrame={() => {}}
    />);
    expect(markup).toContain('Knit-proven');
    expect(markup).toContain('Exact physical match');
    expect(markup).toContain('aria-label="Waste rows" type="number" min="4"');
  });
});
