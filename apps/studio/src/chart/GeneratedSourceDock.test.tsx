import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { assessAuthoredCapacityV1, createColorworkProjectV1 } from '@kniterate-studio/project-contract';

import type { BlanketCompileArtifact } from '../blanket/compileProject';
import { GeneratedSourceDock } from './GeneratedSourceDock';

const capacity = assessAuthoredCapacityV1(createColorworkProjectV1({
  kind: 'knitlab-colorwork-chart', version: 1, width: 1, height: 1,
  rowNumbering: 'bottom-up', palette: [{ id: 'ink', name: 'Ink', hex: '#111111' }], cells: [[0]],
}, { id: 'generated-source-capacity' }));

function artifactWithSource(knitoutText: string): BlanketCompileArtifact {
  return {
    revision: 'bounded-source-test',
    technique: 'birdseye',
    ok: true,
    compileVerdict: 'surface',
    capacity,
    inputHash: 'hash',
    messages: [],
    knitoutText,
    passes: [],
    programOpSourceRows: [],
    rowProvenance: [],
    backFace: null,
    frame: null,
    diagnostics: [],
    stats: {
      designRows: 1,
      needles: 1,
      patternColors: 1,
      passCount: 0,
      opCount: 500_000,
      estimatedKnitTimeSeconds: null,
    },
  };
}

describe('GeneratedSourceDock', () => {
  it('renders a bounded window for very high-record compiler output', () => {
    const source = 'knit + f1 2\n'.repeat(500_000);
    const html = renderToStaticMarkup(
      <GeneratedSourceDock
        artifact={artifactWithSource(source)}
        kcode={null}
        selectedPass={null}
        format="knitout"
        collapsed={false}
        onFormat={() => {}}
        onCollapsed={() => {}}
      />,
    );

    expect(html.match(/class="generated-source-line/g)).toHaveLength(60);
    expect(html).toContain('<i>1</i>');
    expect(html).toContain('<i>60</i>');
    expect(html).not.toContain('<i>61</i>');
    expect(html.length).toBeLessThan(30_000);
  });

  it('caps a single generated line without changing the retained source', () => {
    const source = 'Z'.repeat(1024 * 1024);
    const artifact = artifactWithSource(source);
    const html = renderToStaticMarkup(
      <GeneratedSourceDock
        artifact={artifact}
        kcode={null}
        selectedPass={null}
        format="knitout"
        collapsed={false}
        onFormat={() => {}}
        onCollapsed={() => {}}
      />,
    );

    expect(artifact.knitoutText).toBe(source);
    expect(html).toContain('1,048,576 code units total');
    expect(html.length).toBeLessThan(30_000);
  });
});
