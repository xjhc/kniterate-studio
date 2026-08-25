import { describe, expect, it } from 'vitest';
import { rowPassEvidenceLabel } from './ChartWorkspace';

describe('chart row pass evidence label', () => {
  it('distinguishes pre-lowering predictions from exact emitted KCode passes', () => {
    expect(rowPassEvidenceLabel(7, 4, null)).toBe('Row 7 / 4 predicted passes');
    expect(rowPassEvidenceLabel(7, 4, 6)).toBe('Row 7 / 6 emitted KCode passes');
  });
});
