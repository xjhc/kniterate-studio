/**
 * The knit log and what a machine file looks like against it.
 *
 * `packages/machine-lib/registry/knit-log.json` lists every file that has been
 * on the machine, what the operator reported, and the passes a fault or a note
 * belongs to. `knittedReport` reads any machine file against those knits and
 * against Kniterate's own files: which passes have knitted with no fault
 * reported, which have a fault on record, and which are new on the machine.
 *
 * The evidence is an operator's report, not a measurement, and a pass is
 * matched by what it does at the fabric's edges (see
 * packages/machine-lib/src/knitout/kcode/knit-evidence.ts). A match is not
 * proof that the pass will knit.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_TRACE_YARN_ROLES_V1,
  buildKnitEvidenceV1,
  checkTraceAgainstKnitsV1,
  traceAutoSectionsV1,
  traceRowsV1,
  type KnitEventRefV1,
  type KnitEvidenceV1,
  type KnitRunEventV1,
  type KnittedCheckV1,
  type KnittedStatusV1,
  type MachineTraceV1,
  type TraceSectionV1,
  type TraceYarnRolesV1,
} from '../../packages/machine-lib/src/browser.js';
import { REFERENCE_DIR, REPOSITORY_ROOT, atlas, traceOf } from './machine-files.js';

export const KNIT_LOG_PATH = 'packages/machine-lib/registry/knit-log.json';

type PassSpan = [number, number];

interface KnitLogEventJson {
  kind: 'fault' | 'note';
  /** One stretch of passes, or several. Leave out, with `section`, when the report does not say where. */
  passes?: PassSpan | PassSpan[];
  /** A section of the file instead of pass numbers (waste, draw, cast-on, body, bind-off, top). */
  section?: string;
  approximate?: boolean;
  what: string;
}

export interface KnitLogEntry {
  id: string;
  date: string;
  what: string;
  /** Repository-relative path of the exact file that was knitted. */
  file: string;
  sha256: string;
  roles?: TraceYarnRolesV1;
  /** Carrier to a key of the log's `yarns`. */
  yarns: Record<string, string>;
  /** The last pass knitted, or the section it stopped in, when the run did not finish. */
  knittedThrough?: number | { section: string };
  report?: string;
  source?: string;
  record?: string;
  caveat?: string;
  events: KnitLogEventJson[];
}

interface KnitLogFile {
  kind: 'kniterate-knit-log';
  schemaVersion: 1;
  yarns: Record<string, string>;
  knits: KnitLogEntry[];
}

export interface LoggedKnit {
  entry: KnitLogEntry;
  trace: MachineTraceV1;
  roles: TraceYarnRolesV1;
  sections: TraceSectionV1[];
  knittedThrough: number | null;
  events: KnitRunEventV1[];
}

export class KnitLogError extends Error {}

const isSpan = (value: unknown): value is PassSpan => Array.isArray(value) && value.length === 2 && value.every((n) => Number.isInteger(n));

/** Read and check the log: every file present with its recorded hash, every pass and section inside its file. */
export function readKnitLog(root = REPOSITORY_ROOT): { yarns: Record<string, string>; knits: LoggedKnit[] } {
  const log = JSON.parse(readFileSync(join(root, KNIT_LOG_PATH), 'utf8')) as KnitLogFile;
  if (log.kind !== 'kniterate-knit-log' || log.schemaVersion !== 1) throw new KnitLogError(`${KNIT_LOG_PATH}: not a version 1 knit log.`);
  const seen = new Set<string>();
  const knits = log.knits.map((entry): LoggedKnit => {
    const fail = (message: string): never => { throw new KnitLogError(`${KNIT_LOG_PATH}, knit "${entry.id}": ${message}`); };
    if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(entry.id ?? '')) fail('the id is a date and a short name, like 2026-11-14-split-paisley.');
    if (seen.has(entry.id)) fail('the id is used twice.');
    seen.add(entry.id);
    if (!entry.id.startsWith(entry.date)) fail(`the id does not start with its date ${entry.date}.`);
    if (!entry.what) fail('say what the piece is in `what`.');
    const path = join(root, entry.file);
    if (!existsSync(path)) fail(`${entry.file} does not exist.`);
    const bytes = readFileSync(path);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== entry.sha256) fail(`${entry.file} has SHA-256 ${hash}, not the recorded ${entry.sha256}. The log must point at the exact file that was knitted.`);
    for (const [carrier, yarn] of Object.entries(entry.yarns ?? {})) if (!(yarn in log.yarns)) fail(`carrier ${carrier} names the yarn "${yarn}", which is not in the log's yarns.`);
    const roles = entry.roles ?? DEFAULT_TRACE_YARN_ROLES_V1;
    const trace = traceOf(bytes.toString('latin1'));
    const sections = traceAutoSectionsV1(trace, roles);
    const count = trace.passes.length;
    const sectionSpan = (name: string): PassSpan => {
      const found = sections.filter((section) => section.name === name);
      if (found.length === 0) return fail(`the file has no "${name}" section. Its sections: ${[...new Set(sections.map((section) => section.name))].join(', ')}.`);
      return [Math.min(...found.map((section) => section.from)), Math.max(...found.map((section) => section.to))];
    };
    const inFile = (span: PassSpan): PassSpan => (span[0] >= 1 && span[0] <= span[1] && span[1] <= count ? span : fail(`passes ${span[0]}-${span[1]} are outside the file's 1-${count}.`));
    const through = entry.knittedThrough;
    const knittedThrough = through === undefined ? null : typeof through === 'number' ? inFile([through, through])[1] : sectionSpan(through.section)[1];
    const events = (entry.events ?? []).flatMap((event): KnitRunEventV1[] => {
      if (event.kind !== 'fault' && event.kind !== 'note') fail(`an event is a "fault" or a "note", not "${String(event.kind)}".`);
      if (!event.what) fail('every event says what was seen in `what`.');
      if (event.passes !== undefined && event.section !== undefined) fail('an event gives passes or a section, not both.');
      if (event.section !== undefined) return [{ kind: event.kind, passes: [sectionSpan(event.section)], approximate: true, what: event.what }];
      if (event.passes === undefined) return [{ kind: event.kind, passes: null, what: event.what }];
      const spans = isSpan(event.passes) ? [event.passes] : event.passes;
      if (!Array.isArray(spans) || spans.length === 0 || !spans.every(isSpan)) fail('`passes` is [from, to] or a list of such pairs.');
      return [{ kind: event.kind, passes: spans.map(inFile), ...(event.approximate ? { approximate: true } : {}), what: event.what }];
    });
    return { entry, trace, roles, sections, knittedThrough, events };
  });
  // Oldest first: a fault stops counting once later knits have run the same pass cleanly.
  return { yarns: log.yarns, knits: knits.map((knit, index) => ({ knit, index })).sort((a, b) => a.knit.entry.date.localeCompare(b.knit.entry.date) || a.index - b.index).map(({ knit }) => knit) };
}

let cached: { evidence: KnitEvidenceV1; knits: LoggedKnit[]; yarns: Record<string, string> } | null = null;

/** The log joined to its files and to Kniterate's own reference files. Read once per process. */
export function loadKnitEvidence(): { evidence: KnitEvidenceV1; knits: LoggedKnit[]; yarns: Record<string, string> } {
  if (cached) return cached;
  const { knits, yarns } = readKnitLog();
  const references = atlas().map((entry) => ({ name: entry.name, trace: traceOf(readFileSync(join(REFERENCE_DIR, entry.file), 'latin1'), entry.dialect), roles: entry.roles }));
  cached = { evidence: evidenceFrom(knits, references), knits, yarns };
  return cached;
}

export function evidenceFrom(knits: readonly LoggedKnit[], references: Parameters<typeof buildKnitEvidenceV1>[1] = []): KnitEvidenceV1 {
  return buildKnitEvidenceV1(knits.map((knit) => ({ id: knit.entry.id, trace: knit.trace, roles: knit.roles, knittedThrough: knit.knittedThrough, events: knit.events })), references);
}

/** `3, 5-7, 12` for a list of pass numbers. */
export function passRanges(passes: readonly number[]): string {
  const sorted = [...passes].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | null = null;
  let previous = 0;
  for (const pass of sorted) {
    if (start !== null && pass === previous + 1) { previous = pass; continue; }
    if (start !== null) parts.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = pass;
    previous = pass;
  }
  if (start !== null) parts.push(start === previous ? `${start}` : `${start}-${previous}`);
  return parts.join(', ');
}

const STATUS_WORDS: Record<KnittedStatusV1, string> = {
  knitted: 'knitted with no fault reported',
  'other-width': 'knitted, but only on a wider or narrower fabric',
  faulted: 'with a fault on record and not yet two clean knits since',
  unclear: 'only in knits whose fault has no place',
  new: 'new on the machine',
};

const fault = (event: KnitEventRefV1) => ({
  knit: event.knit,
  ...(event.passes ? { passes: `${event.passes.map(([from, to]) => (from === to ? `${from}` : `${from}-${to}`)).join(', ')}${event.approximate ? ' (where the report points, not a pass read off the machine)' : ''}` } : {}),
  what: event.what,
});

function grouped<T>(items: readonly T[], key: (item: T) => string, passes: (item: T) => readonly number[]): { first: T; passes: number[] }[] {
  const groups = new Map<string, { first: T; passes: number[] }>();
  for (const item of items) {
    const found = groups.get(key(item)) ?? { first: item, passes: [] };
    found.passes.push(...passes(item));
    groups.set(key(item), found);
  }
  return [...groups.values()];
}

/** How many passes of a file are in each state, without the detail. */
export function knittedCounts(trace: MachineTraceV1, roles: TraceYarnRolesV1 = DEFAULT_TRACE_YARN_ROLES_V1): KnittedCheckV1['counts'] {
  return checkTraceAgainstKnitsV1(trace, loadKnitEvidence().evidence, roles).counts;
}

/** One file read against the knit log, in the words and pass numbers a person checks at the machine. */
export function knittedReport(trace: MachineTraceV1, roles: TraceYarnRolesV1, sections: readonly TraceSectionV1[], evidence: KnitEvidenceV1 = loadKnitEvidence().evidence) {
  const check = checkTraceAgainstKnitsV1(trace, evidence, roles);
  const rows = traceRowsV1(trace, sections);
  const { counts } = check;
  const parts = (Object.keys(STATUS_WORDS) as KnittedStatusV1[]).filter((status) => counts[status] > 0).map((status) => `${counts[status]} ${STATUS_WORDS[status]}`);
  const here = check.placement.here;
  const covered = check.placement.knitted;
  return {
    summary: `${check.passCount} passes: ${parts.join(', ')}.`,
    counts,
    sections: sections.map((section) => {
      const inSection = check.statuses.slice(section.from - 1, section.to);
      const tally = (status: KnittedStatusV1) => inSection.filter((found) => found === status).length;
      return { section: `${section.name} ${section.from}-${section.to}`, knitted: tally('knitted'), otherWidth: tally('other-width'), faulted: tally('faulted'), unclear: tally('unclear'), new: tally('new') };
    }),
    new: check.fresh.map((found) => ({
      passes: passRanges(found.passes),
      count: found.passes.length,
      pass: rows[found.passes[0]! - 1]!.text,
      ...(found.kniterate.length > 0 ? { inKniteratesFiles: found.kniterate } : {}),
      ...(found.closest ? {
        closest: {
          knits: found.closest.knits,
          ...(found.closest.faulted ? { faultedThere: true } : {}),
          differs: found.closest.differences.map((difference) => `${difference.facet}: ${difference.known ?? 'nothing'} there, ${difference.here ?? 'nothing'} here`),
        },
      } : {}),
    })),
    otherWidth: grouped(check.otherWidth, (found) => `${found.knittedAt[0]}-${found.knittedAt[1]}`, (found) => found.passes).map(({ first, passes }) => {
      const widths = passes.map((pass) => check.descriptions[pass - 1]!.width);
      const [min, max] = [Math.min(...widths), Math.max(...widths)];
      return { passes: passRanges(passes), count: passes.length, columnsHere: min === max ? `${min}` : `${min}-${max}`, knittedOnColumns: `${first.knittedAt[0]}-${first.knittedAt[1]}` };
    }),
    faulted: grouped(check.faulted, (found) => JSON.stringify([found.faults, found.knitted]), (found) => found.passes).map(({ first, passes }) => ({
      passes: passRanges(passes),
      count: passes.length,
      faults: first.faults.map(fault),
      knittedWithNoFaultSince: first.knittedSinceFault,
    })),
    earlierFaultsSinceCleared: grouped(check.cleared, (found) => JSON.stringify(found.faults), (found) => found.passes).map(({ first, passes }) => ({
      passes: passRanges(passes),
      count: passes.length,
      faults: first.faults.map(fault),
      knittedWithNoFaultSince: first.knittedSinceFault,
    })),
    unclear: grouped(check.unclear, (found) => found.knits.join(','), (found) => found.passes).map(({ first, passes }) => ({ passes: passRanges(passes), count: passes.length, knits: first.knits })),
    notes: grouped(check.notes, (found) => JSON.stringify(found.notes), (found) => found.passes).map(({ first, passes }) => ({ passes: passRanges(passes), count: passes.length, notes: first.notes.map(fault) })),
    placement: {
      needles: here ? `${here[0]}-${here[1]}` : 'none',
      earlierKnitsCovered: covered ? `${covered[0]}-${covered[1]}` : 'none',
      outsideEarlierKnits: Boolean(here && covered && (here[0] < covered[0] || here[1] > covered[1])),
    },
  };
}

/** The log itself: one line per knit. */
export function knitLogSummary() {
  const { knits, yarns } = loadKnitEvidence();
  return knits.map((knit) => ({
    id: knit.entry.id,
    what: knit.entry.what,
    file: knit.entry.file,
    passes: knit.trace.passes.length,
    ...(knit.knittedThrough !== null ? { knittedThrough: knit.knittedThrough } : {}),
    faults: knit.events.filter((event) => event.kind === 'fault').length,
    notes: knit.events.filter((event) => event.kind === 'note').length,
    yarns: Object.fromEntries(Object.entries(knit.entry.yarns).map(([carrier, yarn]) => [`C${carrier}`, yarns[yarn]])),
    ...(knit.entry.report ? { report: knit.entry.report } : {}),
    ...(knit.entry.caveat ? { caveat: knit.entry.caveat } : {}),
  }));
}
