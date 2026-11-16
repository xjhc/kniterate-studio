import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkTraceAgainstKnitsV1 } from '@kniterate-studio/machine-lib/browser';
import { evidenceFrom, knittedReport, readKnitLog } from '../../../scripts/lib/knit-log';
import { REPOSITORY_ROOT, traceOf } from '../../../scripts/lib/machine-files';

/**
 * The knit log against the real files it lists. `readKnitLog` refuses a file whose bytes are not the
 * ones recorded, a pass outside its file, or a section the file does not have, so loading it is the
 * first check. The rest pin how reports are joined to passes, on knits that will not change.
 */
const { knits } = readKnitLog();
const knit = (id: string) => knits.find((found) => found.entry.id === id)!;
const upTo = (id: string) => knits.slice(0, knits.findIndex((found) => found.entry.id === id) + 1);
const file = (path: string) => traceOf(readFileSync(join(REPOSITORY_ROOT, path), 'latin1'));
const ROLES = { waste: '6', draw: '1' };
const passesWith = (statuses: readonly string[], status: string) => statuses.flatMap((found, index) => (found === status ? [index + 1] : []));

describe('knit log', () => {
  it('lists every knit oldest first, each pointing at the exact file that was knitted', () => {
    expect(knits.length).toBeGreaterThanOrEqual(13);
    const dates = knits.map((found) => found.entry.date);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(knits.map((found) => found.entry.sha256)).size).toBe(knits.length);
  });

  it('finds nothing new in a file that has itself been knitted', () => {
    const evidence = evidenceFrom(knits);
    for (const found of knits) {
      const { statuses } = checkTraceAgainstKnitsV1(found.trace, evidence, found.roles);
      const ran = statuses.slice(0, found.knittedThrough ?? statuses.length);
      expect(passesWith(ran, 'new'), found.entry.id).toEqual([]);
    }
  });

  it('places the dropped waste stitches on the passes that bring the yarns in, not on the waste rows around them', () => {
    // The report: waste stitches dropped twice while orange and grey were first brought in (passes 80-93).
    const paisley = knit('2026-11-14-split-paisley');
    const { statuses } = checkTraceAgainstKnitsV1(paisley.trace, evidenceFrom(upTo('2026-11-14-split-paisley')), paisley.roles);
    expect(passesWith(statuses, 'faulted')).toEqual([81, 82, 83, 85, 89, 90, 91]);
    // The waste rows between them knitted forty times more in the same piece with nothing reported.
    expect(statuses[79]).toBe('knitted');
    expect(statuses[91]).toBe('knitted');
  });

  it('does not let a fault on the same-colour increase spread to the increases that had already knitted', () => {
    // The 234-pass strip's report points at its two increases. Its first transfers and its splits are
    // passes the 514-pass paisley had knitted; only what was new in that strip carries the fault.
    const paisley = knit('2026-11-14-split-paisley');
    const { statuses } = checkTraceAgainstKnitsV1(paisley.trace, evidenceFrom(upTo('2026-11-14-colour-preserving-increase')), paisley.roles);
    expect(passesWith(statuses, 'faulted').every((pass) => pass >= 80 && pass <= 93)).toBe(true);
    const strip = knit('2026-11-14-colour-preserving-increase');
    const own = passesWith(checkTraceAgainstKnitsV1(strip.trace, evidenceFrom(upTo('2026-11-14-colour-preserving-increase')), strip.roles).statuses, 'faulted').filter((pass) => pass > 114);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((pass) => (pass >= 132 && pass <= 143) || (pass >= 160 && pass <= 171))).toBe(true);
  });

  it('carries a note to the files that contain the same pass, and only to them', () => {
    // Orange showed on the grey face at the increases orange made. The tip swatch has two such
    // increases; the paisley where grey makes every increase has none.
    const evidence = evidenceFrom(upTo('2026-11-14-split-paisley'));
    const noted = (path: string) => knittedReport(file(path), ROLES, [], evidence).notes.filter((group) => group.notes.some((note) => note.what.startsWith('Orange shows')));
    expect(noted('docs/physical-trials/2026-11-14/paisley-grey-split-candidate/program.kc')).toEqual([]);
    expect(noted('docs/physical-trials/2026-11-15/tip-start-candidate/program.kc').map((group) => group.passes)).toEqual(['231, 236, 261, 266']);
  });

  it('tells a file with new passes from one made of knitted passes', () => {
    const evidence = evidenceFrom(upTo('2026-11-14-colour-preserving-increase'));
    const grey = knittedReport(file('docs/physical-trials/2026-11-14/paisley-grey-split-candidate/program.kc'), ROLES, [], evidence);
    expect(grey.counts.new).toBe(0);
    const tip = knittedReport(file('docs/physical-trials/2026-11-15/tip-start-candidate/program.kc'), ROLES, [], evidence);
    // The draw thread's round at the neck and the cast-on over it, on four needles.
    const fresh = tip.new.map((group) => group.passes).join(', ');
    for (const pass of [169, 170, 172, 173, 174]) expect(fresh.split(', ').some((range) => { const [from, to] = range.split('-').map(Number); return pass >= from! && pass <= (to ?? from!); }), `pass ${pass}`).toBe(true);
    expect(tip.new.every((group) => group.closest !== undefined)).toBe(true);
  });
});
