import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SourceDock, readMachineFile } from './App';
import { MAX_MACHINE_SOURCE_BYTES_V1, openMachineDocument } from './engine';
import { indexSourceLines, sourceWindow } from './sourceWindow';

describe('bounded source inspection', () => {
  it('renders a resource-limited high-record import without rematerializing every line', () => {
    const source = 'x\n'.repeat(250_001);
    const document = openMachineDocument('too-many-lines.k', source);
    const html = renderToStaticMarkup(
      <SourceDock document={document} selected={0} preferredLine={null} />,
    );

    expect(document.source).toBe(source);
    expect(document.diagnostics).toContainEqual(expect.objectContaining({ rule: 'knitout-resource-limit' }));
    expect(html).toContain('lines 1-9 of 250,002');
    expect(html).toContain('Preview bounded for safe inspection');
    expect(html.match(/class="source-line/g)).toHaveLength(9);
    expect(html.length).toBeLessThan(20_000);
  });

  it('caps one huge display line while retaining the exact source string', () => {
    const source = 'Z'.repeat(1024 * 1024);
    const document = openMachineDocument('huge-line.k', source);
    const window = sourceWindow(document.source, 1);
    const html = renderToStaticMarkup(
      <SourceDock document={document} selected={0} preferredLine={1} />,
    );

    expect(document.source).toBe(source);
    expect(window.lines).toHaveLength(1);
    expect(window.lines[0]).toMatchObject({ originalCodeUnits: source.length, truncated: true });
    expect(html).toContain('1,048,576 code units total');
    expect(html.length).toBeLessThan(20_000);
  });

  it('uses a sparse index to seek a late window without retaining every line', () => {
    const source = Array.from({ length: 100_000 }, (_, index) => `line-${index + 1}`).join('\r\n');
    const index = indexSourceLines(source, 1_000);
    const window = sourceWindow(source, 99_990, 2, 64, index);

    expect(index.checkpoints).toHaveLength(100);
    expect(window).toMatchObject({
      from: 99_988,
      to: 99_992,
      totalLines: 100_000,
    });
    expect(window.lines.map((line) => line.text)).toEqual([
      'line-99988',
      'line-99989',
      'line-99990',
      'line-99991',
      'line-99992',
    ]);
  });

  it('rejects an oversized local file before requesting its ArrayBuffer', async () => {
    let read = false;
    const file = {
      name: 'too-large.kc',
      size: MAX_MACHINE_SOURCE_BYTES_V1 + 1,
      arrayBuffer: async () => {
        read = true;
        return new ArrayBuffer(0);
      },
    } as File;

    const document = await readMachineFile(file);
    expect(read).toBe(false);
    expect(document.source).toBe('');
    expect(document.verdict.state).toBe('blocked');
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'machine-source-resource-limit',
      rawMessage: expect.stringContaining('file was not read or copied'),
    }));
  });

  it('surfaces a local file read failure as a blocked document', async () => {
    const file = {
      name: 'unreadable.k',
      size: 42,
      arrayBuffer: async () => { throw new Error('read denied'); },
    } as unknown as File;

    const document = await readMachineFile(file);
    expect(document.verdict.state).toBe('blocked');
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'machine-source-read',
      rawMessage: expect.stringContaining('read denied'),
    }));
  });
});
