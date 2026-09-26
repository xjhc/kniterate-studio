import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createColorworkProjectV1, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { BlanketSetupRail } from './BlanketSetupRail';
import { compileColorworkProject } from './compileProject';

describe('BlanketSetupRail physical verdict', () => {
  it('shows Knit-proven only when an exact registry entry is supplied', () => {
    const project = createColorworkProjectV1({
      kind: 'knitlab-colorwork-chart', version: 1, title: 'proof', width: 12, height: 8,
      rowNumbering: 'bottom-up',
      palette: [{ id: 'natural', name: 'Natural', hex: '#f1ede3' }, { id: 'navy', name: 'Navy', hex: '#29445f' }],
      cells: Array.from({ length: 8 }, (_, row) => Array.from({ length: 12 }, (_, column) => (row + column) % 2)),
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
      onFloatLimit={() => {}}
      onAssignment={() => {}}
    />);
    expect(markup).toContain('Knit-proven');
    expect(markup).toContain('Exact physical match');
    // The frame is fixed by the matched Customist program, not editable.
    expect(markup).toContain('Customist fairisle.kc');
    // The matched fairisle program brings in C1 as a frame yarn; the operator must load it.
    expect(markup).toContain('<dt>Frame yarns</dt><dd>C1</dd>');
    expect(markup).not.toContain('aria-label="Waste rows"');
    expect(markup).not.toContain('Complement');
  });
});
