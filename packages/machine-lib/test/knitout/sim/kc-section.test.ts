import { describe, expect, it } from 'vitest';

import {
  extractKcSection,
  KcSectionNotFoundError,
} from '../../../src/knitout/sim/kc-section.js';

const FIXTURE = [
  'HOME',
  'RACK:0',
  '// command.kc',
  '//',
  '// row: 0',
  'FRNT:....abc',
  '>> Kn-Kn 2 100 440',
  '//',
  '// rows: 1-2',
  'FRNT:....def',
  '<< Kn-Kn 2 700 0',
  '//',
  '// row: 348',
  'FRNT:....xyz',
  '>> Tu-Tu 1 300 0',
  '',
].join('\n');

describe('extractKcSection', () => {
  it('extracts a bounded section by start + end pattern', () => {
    const section = extractKcSection(FIXTURE, {
      startPattern: /^\/\/ row: 0$/,
      endPattern: /^\/\/ rows: 1-2$/,
    });
    expect(section.lineStart).toBe(5);
    expect(section.lineEndExclusive).toBe(9);
    expect(section.text).toContain('// row: 0');
    expect(section.text).not.toContain('// rows: 1-2');
    expect(section.passes).toHaveLength(1);
    expect(section.passes[0]).toMatchObject({
      direction: '>>',
      type: 'Kn-Kn',
      carrier: '2',
    });
  });

  it('extracts to EOF when endPattern is "EOF"', () => {
    const section = extractKcSection(FIXTURE, {
      startPattern: /^\/\/ row: 348$/,
      endPattern: 'EOF',
    });
    expect(section.lineStart).toBe(13);
    expect(section.text).toContain('// row: 348');
    expect(section.passes).toHaveLength(1);
    expect(section.passes[0]?.type).toBe('Tu-Tu');
  });

  it('throws KcSectionNotFoundError when startPattern does not match', () => {
    expect(() =>
      extractKcSection(FIXTURE, {
        startPattern: /^\/\/ row: 9999$/,
        endPattern: 'EOF',
      }),
    ).toThrow(KcSectionNotFoundError);
  });

  it('throws KcSectionNotFoundError when endPattern does not match', () => {
    expect(() =>
      extractKcSection(FIXTURE, {
        startPattern: /^\/\/ row: 0$/,
        endPattern: /^\/\/ row: 9999$/,
      }),
    ).toThrow(KcSectionNotFoundError);
  });
});
