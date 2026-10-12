import { describe, expect, it } from 'vitest';
import { downloadFileName, machineFileName, onePieceName } from './fileNames';

describe('machine file names', () => {
  it('names a file for its piece, and a download for the project and the piece', () => {
    expect(['Back', 'Sleeve', 'Scarf', onePieceName(true), onePieceName(false)].map(machineFileName)).toEqual(['back.kc', 'sleeve.kc', 'scarf.kc', 'beanie.kc', 'colour-chart.kc']);
    expect(downloadFileName('ring-toque-1d791146', 'Beanie')).toBe('ring-toque-1d791146-beanie.kc');
  });
});
