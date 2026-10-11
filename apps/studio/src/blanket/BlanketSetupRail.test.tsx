import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createColorworkProjectV1, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { AuthoredVerdictBadge } from '../App';
import { BlanketSetupRail } from './BlanketSetupRail';
import { compileColorworkProject } from './compileProject';

describe('authored verdict badge', () => {
  it('shows Knit-proven with its exact physical match', () => {
    const markup = renderToStaticMarkup(<AuthoredVerdictBadge
      verdict={{ state: 'knit', label: 'Knit-proven', annotation: 'Exact compiled artifact match.', evidenceId: '2026-07-12-proof' }}
      pending="checking"
      onClick={() => {}}
    />);
    expect(markup).toContain('Knit-proven');
    expect(markup).toContain('Exact physical match');
  });

  it('reports lowering progress while no verdict exists', () => {
    expect(renderToStaticMarkup(<AuthoredVerdictBadge verdict={null} pending="compiling" onClick={() => {}} />)).toContain('Compiling');
    const checking = renderToStaticMarkup(<AuthoredVerdictBadge verdict={null} pending="checking" onClick={() => {}} />);
    expect(checking).toContain('Checking KCode');
    expect(checking).not.toContain('proven');
  });
});

describe('BlanketSetupRail', () => {
  it('shows size, colours and backing in plain words, without a second verdict or the machine frame', () => {
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
      outputError={null}
      onWidth={() => {}}
      onHeight={() => {}}
      onNeedleOffset={() => {}}
      onStrategy={() => {}}
      onFloatLimit={() => {}}
      onAssignment={() => {}}
    />);
    expect(markup).not.toContain('proven');
    expect(markup).toMatch(/<h2>Size<\/h2>[^]*<h2>Colours<\/h2>[^]*<h2>Backing<\/h2>/);
    expect(markup).toContain(`${Math.ceil(artifact.stats.estimatedKnitTimeSeconds! / 60)} min`);
    // The machine frame (waste yarn, draw thread) is read in the Machine file view, not set here.
    expect(markup).not.toContain('Customist');
    expect(markup).not.toContain('passes');
    expect(markup).not.toContain('aria-label="Waste rows"');
    expect(markup).not.toContain('Complement');
  });
});
