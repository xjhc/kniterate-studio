import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createColorworkProjectV1, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { AuthoredVerdictBadge } from '../App';
import { BlanketSetupRail } from './BlanketSetupRail';
import { ChartSizeSection } from '../chart/ChartSizeSection';
import { compileColorworkProject } from './compileProject';
import { createBeanieProject } from '../beanie';

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
    expect(renderToStaticMarkup(<AuthoredVerdictBadge verdict={null} pending="compiling" onClick={() => {}} />)).toContain('Writing');
    const checking = renderToStaticMarkup(<AuthoredVerdictBadge verdict={null} pending="checking" onClick={() => {}} />);
    expect(checking).toContain('Checking');
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
      size={<ChartSizeSection state={state} onSize={() => {}} onGauge={() => {}} onNeedles={() => {}} onRows={() => {}} onNeedleOffset={() => {}} />}
      onStrategy={() => {}}
      onFloatLimit={() => {}}
      onAssignment={() => {}}
    />);
    expect(markup).not.toContain('proven');
    expect(markup).toMatch(/<span>Size<\/span>[^]*<span>Colours<\/span>[^]*<span>Backing<\/span>/);
    expect(markup).toContain(`${Math.ceil(artifact.stats.estimatedKnitTimeSeconds! / 60)} min`);
    // The machine frame (waste yarn, draw thread) is read in the Machine file view, not set here.
    expect(markup).not.toContain('Customist');
    expect(markup).not.toContain('passes');
    expect(markup).not.toContain('aria-label="Waste rows"');
    expect(markup).not.toContain('Complement');
  });

  it('with one colour there is no backing to choose: a chart knits plain, a beanie body is one layer or two', () => {
    const rail = (project: Parameters<typeof compileColorworkProject>[0]) => {
      const state = materializeColorworkProject(project).state;
      return renderToStaticMarkup(<BlanketSetupRail state={state} compile={{ status: 'ready', artifact: null, error: null, comparisons: [] }} outputError={null} size={null} onStrategy={() => {}} onFloatLimit={() => {}} onAssignment={() => {}} />);
    };
    const plain = rail(createColorworkProjectV1({
      kind: 'knitlab-colorwork-chart', version: 1, title: 'plain', width: 12, height: 8, rowNumbering: 'bottom-up',
      palette: [{ id: 'natural', name: 'Natural', hex: '#f1ede3' }, { id: 'navy', name: 'Navy', hex: '#29445f' }],
      cells: Array.from({ length: 8 }, () => Array(12).fill(0)),
    }, { id: 'plain', title: 'plain' }));
    expect(plain).toContain('One colour knits plain, with no backing.');
    expect(plain).not.toContain('Fairisle');
    expect(plain).not.toContain('Longest float');

    const gauge = { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'assumed' as const };
    const hat = rail(createBeanieProject({ title: 'Hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: gauge, cuffCm: 7, ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'assumed' }, fold: true, backing: 'birdseye', main: { name: 'Black', hex: '#111111' } }, { id: 'hat', source: 'human', group: 'create' }));
    expect(hat).toContain('Double layer');
    expect(hat).toContain('Single layer');
    expect(hat).not.toContain('Birdseye');

    const ribHat = rail(createBeanieProject({ title: 'Rib hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: gauge, main: { name: 'Black', hex: '#111111' } }, { id: 'rib-hat', source: 'human', group: 'create' }));
    expect(ribHat).not.toContain('<span>Backing</span>');
  });
});
