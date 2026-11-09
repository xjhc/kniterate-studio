import { describe, expect, it } from 'vitest';
import { matrixCommand } from '../../../scripts/lib/machine-cli';

/**
 * Every construction Studio makes, built and audited loop by loop: fairisle and
 * birdseye charts (including the narrow and odd widths where the yarn catch
 * reaches the right edge), every beanie, scarves, and every sweater silhouette
 * and neck. The same run as `pnpm studio -- matrix`. A held start loop, waste
 * knitting through doubled body loops, unheld drops or loops left on the
 * needles fail here before a file reaches the machine.
 */
describe('engine matrix', () => {
  it('builds every construction and each file passes the loop audit', { timeout: 600_000 }, async () => {
    const { result } = await matrixCommand(null, false);
    expect(result.rows.filter((row) => !row.ok).map((row) => `${row.construction}: ${row.issues.join('; ')}`)).toEqual([]);
    expect(result.files).toBeGreaterThanOrEqual(40);
  });
});
