import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkTraceAgainstKnitsV1 } from '@kniterate-studio/machine-lib/browser';
import { KNIT_LOG_PATH, evidenceFrom, knittedReport, readKnitLog } from '../../../scripts/lib/knit-log';
import { REPOSITORY_ROOT, traceOf } from '../../../scripts/lib/machine-files';

/**
 * The knit log against the real files it lists, and what the loader refuses. Evidence is built from
 * the knits up to a named one, so these stay true as later knits are logged.
 */
const { knits } = readKnitLog();
const knit = (id: string) => knits.find((found) => found.entry.id === id)!;
const upTo = (id: string) => knits.slice(0, knits.findIndex((found) => found.entry.id === id) + 1);
const file = (path: string) => traceOf(readFileSync(join(REPOSITORY_ROOT, path), 'latin1'));
const ROLES = { waste: '6', draw: '1' };
const passesWith = (statuses: readonly string[], status: string) => statuses.flatMap((found, index) => (found === status ? [index + 1] : []));
const statusesOf = (id: string, through: string) => checkTraceAgainstKnitsV1(knit(id).trace, evidenceFrom(upTo(through)), knit(id).roles).statuses;

describe('knit log', () => {
  it('holds the knits whose files are in the repository', () => {
    expect(knits.length).toBeGreaterThanOrEqual(18);
    expect(knits.every((found) => found.entry.events.length === found.events.length)).toBe(true);
  });

  it('places the dropped waste stitches between the first yarn brought in and the release of the rear loops', () => {
    // The report: waste stitches dropped twice while orange and grey were first brought in, before the release at pass 105.
    const paisley = knit('2026-11-14-split-paisley');
    const check = checkTraceAgainstKnitsV1(paisley.trace, evidenceFrom(upTo('2026-11-14-split-paisley')), paisley.roles);
    const own = check.faulted.filter((group) => group.faults.some((fault) => fault.knit === '2026-11-14-split-paisley')).flatMap((group) => group.passes);
    expect(own.every((pass) => pass >= 81 && pass <= 104)).toBe(true);
    for (const pass of [81, 89, 95]) expect(own, `the yarn brought in at pass ${pass}`).toContain(pass);
    // The waste rows before any yarn was brought in had knitted in earlier pieces and are left alone.
    expect(check.statuses.slice(9, 79).every((status) => status !== 'faulted')).toBe(true);
    // Nothing in the body is touched by a fault at the start.
    expect(check.statuses.slice(114).every((status) => status !== 'faulted')).toBe(true);
  });

  it('puts the fault on the same-colour strip on what was new in it, not on the increases that had knitted', () => {
    // The strip changed the increase and the edge join together, so its report covers its whole body.
    const paisley = statusesOf('2026-11-14-split-paisley', '2026-11-14-colour-preserving-increase');
    expect(passesWith(paisley, 'faulted').every((pass) => pass <= 104)).toBe(true);
    const strip = statusesOf('2026-11-14-colour-preserving-increase', '2026-11-14-colour-preserving-increase');
    const own = passesWith(strip, 'faulted').filter((pass) => pass > 110);
    // Its tucked edge joins (116, 123, 126, 144) and grey's splits (133, 161) were new; they do not read as knitted.
    for (const pass of [116, 123, 126, 133, 144, 161]) expect(own, `pass ${pass}`).toContain(pass);
    // Orange's splits (138, 166) are passes the 514-pass paisley had knitted.
    for (const pass of [138, 166]) expect(own, `pass ${pass}`).not.toContain(pass);
    expect(passesWith(strip, 'knitted').length).toBeGreaterThan(100);
  });

  it('places stops reported while the waste and draw feeders were moved on those moves', () => {
    const diamond = knit('2026-11-11-reversible-diamond');
    const statuses = statusesOf('2026-11-11-reversible-diamond', '2026-11-11-reversible-diamond');
    const faulted = passesWith(statuses, 'faulted');
    expect(faulted.length).toBeGreaterThan(100);
    const idleMove = (pass: number) => { const found = diamond.trace.passes[pass - 1]!; return (found.carrier === '1' || found.carrier === '6') && found.actions.every((action) => action.kind === 'move'); };
    expect(faulted.filter((pass) => pass > 120).every(idleMove)).toBe(true);
    // The rest of the diamond still counts: its fault has a place, so the knit is not unclear.
    expect(passesWith(statuses, 'unclear')).toEqual([]);
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
    const tip = checkTraceAgainstKnitsV1(file('docs/physical-trials/2026-11-15/tip-start-candidate/program.kc'), evidence, ROLES);
    // The draw thread's round at the neck and the cast-on over it, on four needles.
    const fresh = tip.fresh.flatMap((group) => group.passes);
    for (const pass of [169, 170, 172, 173, 174]) expect(fresh, `pass ${pass}`).toContain(pass);
    expect(tip.fresh.every((group) => group.closest !== null)).toBe(true);
  });
});

describe('knit log loader', () => {
  const KNITTED = 'docs/physical-trials/2026-11-12/edge-full-caston-success/program.kc';
  const SHA = '2c5ef66ef99610d933f9fbdf7998d6dad242e67402ad06ba61201684ee72a8ac';
  const entry = (extra: Record<string, unknown> = {}) => ({ id: '2026-11-12-swatch', date: '2026-11-12', what: 'A swatch', file: KNITTED, sha256: SHA, yarns: { '3': 'wool' }, events: [], ...extra });
  /** A repository holding one knitted file and the given log. */
  function load(knitEntries: unknown[]) {
    const root = mkdtempSync(join(tmpdir(), 'knit-log-'));
    for (const path of [KNITTED, KNIT_LOG_PATH]) mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(REPOSITORY_ROOT, KNITTED), join(root, KNITTED));
    writeFileSync(join(root, KNIT_LOG_PATH), JSON.stringify({ kind: 'kniterate-knit-log', schemaVersion: 1, yarns: { wool: 'Wool' }, knits: knitEntries }));
    return readKnitLog(root);
  }

  it('reads a knit with a fault on a pass, a note on a section and an early stop', () => {
    const { knits: loaded } = load([entry({ knittedThrough: 200, operatorSaidHowItRan: true, events: [{ kind: 'fault', passes: [150, 150], what: 'dropped' }, { kind: 'note', section: 'cast-on', what: 'loose' }, { kind: 'fault', what: 'somewhere' }] })]);
    expect(loaded[0]!.knittedThrough).toBe(200);
    expect(loaded[0]!.events).toEqual([
      { kind: 'fault', passes: [[150, 150]], what: 'dropped' },
      { kind: 'note', passes: [[105, 110]], approximate: true, what: 'loose' },
      { kind: 'fault', passes: null, what: 'somewhere' },
    ]);
  });

  it.each([
    ['a file that is not the bytes recorded', entry({ sha256: 'a'.repeat(64) }), /not the recorded/],
    ['a misspelt field', entry({ knittedThru: 90 }), /"knittedThru" is not a field/],
    ['a misspelt event field', entry({ events: [{ kind: 'fault', pass: [3, 3], what: 'x' }] }), /"pass" is not a field/],
    ['no events list', (() => { const { events: _events, ...rest } = entry(); return rest; })(), /`events` is a list/],
    ['a date that is not a day', entry({ date: '2026-11' }), /not a real YYYY-MM-DD date/],
    ['a day that does not exist', entry({ id: '2026-02-30-swatch', date: '2026-02-30' }), /not a real YYYY-MM-DD date/],
    ['a file outside the repository', entry({ file: '../elsewhere/program.kc' }), /inside the repository/],
    ['a pass outside the file', entry({ events: [{ kind: 'fault', passes: [300, 301], what: 'x' }] }), /outside the file's 1-268/],
    ['a section the file does not have', entry({ events: [{ kind: 'fault', section: 'rib', what: 'x' }] }), /no "rib" section/],
    ['a stop that is not a whole pass', entry({ knittedThrough: 90.5 }), /`knittedThrough` is a pass number/],
    ['a stop written as null', entry({ knittedThrough: null }), /`knittedThrough` is a pass number/],
    ['a fault after the pass the run stopped at', entry({ knittedThrough: 90, events: [{ kind: 'fault', passes: [91, 91], what: 'x' }] }), /after pass 90, the last pass knitted/],
    ['approximate written as text', entry({ events: [{ kind: 'fault', passes: [3, 3], approximate: 'false', what: 'x' }] }), /`approximate` is true or false/],
    ['an unknown yarn', entry({ yarns: { '3': 'silk' } }), /not in the log's yarns/],
    ['carrier moves the file does not have', entry({ events: [{ kind: 'fault', carrierMoves: ['5'], what: 'x' }] }), /no pass after the cast-on only moves carrier 5/],
    ['an event that is neither a fault nor a note', entry({ events: [{ kind: 'stop', what: 'x' }] }), /a "fault" or a "note"/],
  ])('refuses %s', (_name, bad, message) => {
    expect(() => load([bad])).toThrow(message);
  });

  it('refuses knits that are not oldest first, and an id used twice', () => {
    expect(() => load([entry({ id: '2026-11-14-later', date: '2026-11-14' }), entry()])).toThrow(/comes after a knit dated 2026-11-14/);
    expect(() => load([entry(), entry()])).toThrow(/used twice/);
    // The same file knitted again on a later day is a second knit, and is welcome.
    expect(load([entry(), entry({ id: '2026-11-13-again', date: '2026-11-13' })]).knits).toHaveLength(2);
  });
});
