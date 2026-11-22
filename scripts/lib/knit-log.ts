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
import { REPOSITORY_ROOT, atlas, readReferenceBytes, traceOf } from './machine-files.js';

export const KNIT_LOG_PATH = 'packages/machine-lib/registry/knit-log.json';

type PassSpan = [number, number];

interface KnitLogEventJson {
  kind: 'fault' | 'note';
  /** One stretch of passes, or several. */
  passes?: PassSpan | PassSpan[];
  /** A section of the file instead of pass numbers (waste, draw, cast-on, body, bind-off, top). */
  section?: string;
  /** Every pass after the cast-on that only moves one of these carriers ("it stopped while the waste feeder was being moved"). */
  carrierMoves?: string[];
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
  /** Exact last pass knitted, or an uncertain stop within a section (only the preceding prefix is confirmed). */
  knittedThrough?: number | { section: string };
  /** The operator observed the run end during this pass. Only earlier passes completed. */
  stoppedDuringPass?: number;
  /** The operator said how the run went: what went wrong, or that it went well. Only such a knit clears an earlier fault. */
  operatorSaidHowItRan?: boolean;
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
  stopWithin: PassSpan | null;
  events: KnitRunEventV1[];
}

export class KnitLogError extends Error {}

const ENTRY_KEYS = new Set(['id', 'date', 'what', 'file', 'sha256', 'roles', 'yarns', 'knittedThrough', 'stoppedDuringPass', 'operatorSaidHowItRan', 'report', 'source', 'record', 'caveat', 'events']);
const EVENT_KEYS = new Set(['kind', 'passes', 'section', 'carrierMoves', 'approximate', 'what']);
const START_SECTIONS = new Set(['waste', 'draw', 'cast-on']);
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSpan = (value: unknown): value is PassSpan => Array.isArray(value) && value.length === 2 && value.every((n) => Number.isInteger(n));
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/**
 * Read and check the log. It is refused, with the entry named, when a file is missing or is not the
 * bytes recorded, a pass or section is not in its file, an event sits after the pass the run stopped
 * at, a key is misspelt, or the knits are not oldest first (the order decides which knits come after
 * a fault).
 */
export function readKnitLog(root = REPOSITORY_ROOT): { yarns: Record<string, string>; knits: LoggedKnit[] } {
  const log = JSON.parse(readFileSync(join(root, KNIT_LOG_PATH), 'utf8')) as KnitLogFile;
  if (!isRecord(log) || log.kind !== 'kniterate-knit-log' || log.schemaVersion !== 1) throw new KnitLogError(`${KNIT_LOG_PATH}: not a version 1 knit log.`);
  if (!isRecord(log.yarns) || !Array.isArray(log.knits)) throw new KnitLogError(`${KNIT_LOG_PATH}: needs \`yarns\` and a \`knits\` list.`);
  const seen = new Set<string>();
  let previousDate = '';
  const knits = log.knits.map((entry, position): LoggedKnit => {
    const name = isRecord(entry) && typeof entry.id === 'string' ? `knit "${entry.id}"` : `knit number ${position + 1}`;
    const fail = (message: string): never => { throw new KnitLogError(`${KNIT_LOG_PATH}, ${name}: ${message}`); };
    if (!isRecord(entry)) fail('an entry is an object.');
    for (const key of Object.keys(entry)) if (!ENTRY_KEYS.has(key)) fail(`"${key}" is not a field of a knit. Fields: ${[...ENTRY_KEYS].join(', ')}.`);
    if (typeof entry.id !== 'string' || !/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(entry.id)) fail('the id is a date and a short name, like 2026-11-14-split-paisley.');
    if (seen.has(entry.id)) fail('the id is used twice.');
    seen.add(entry.id);
    if (!isDate(entry.date)) fail(`the date "${String(entry.date)}" is not a real YYYY-MM-DD date.`);
    if (!entry.id.startsWith(entry.date)) fail(`the id does not start with its date ${entry.date}.`);
    if (entry.date < previousDate) fail(`it is dated ${entry.date} but comes after a knit dated ${previousDate}. List knits oldest first, and same-day knits in the order they were knitted.`);
    previousDate = entry.date;
    if (typeof entry.what !== 'string' || entry.what === '') fail('say what the piece is in `what`.');
    for (const key of ['report', 'source', 'record', 'caveat'] as const) if (entry[key] !== undefined && typeof entry[key] !== 'string') fail(`\`${key}\` is text.`);
    if (entry.operatorSaidHowItRan !== undefined && typeof entry.operatorSaidHowItRan !== 'boolean') fail('`operatorSaidHowItRan` is true or false.');
    if (typeof entry.file !== 'string' || entry.file.startsWith('/') || entry.file.split('/').includes('..')) fail('`file` is a path inside the repository.');
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) fail('`sha256` is 64 hex digits.');
    const path = join(root, entry.file);
    if (!existsSync(path)) fail(`${entry.file} does not exist.`);
    const bytes = readFileSync(path);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== entry.sha256) fail(`${entry.file} has SHA-256 ${hash}, not the recorded ${entry.sha256}. The log must point at the exact file that was knitted.`);
    if (!isRecord(entry.yarns)) fail('`yarns` maps each carrier to a yarn.');
    for (const [carrier, yarn] of Object.entries(entry.yarns)) if (typeof yarn !== 'string' || !(yarn in log.yarns)) fail(`carrier ${carrier} names the yarn "${String(yarn)}", which is not in the log's yarns.`);
    if (entry.roles !== undefined && (!isRecord(entry.roles) || typeof entry.roles.waste !== 'string' || (entry.roles.draw !== null && typeof entry.roles.draw !== 'string'))) fail('`roles` is { "waste": carrier, "draw": carrier or null }.');
    const roles = entry.roles ?? DEFAULT_TRACE_YARN_ROLES_V1;
    const trace = traceOf(bytes.toString('latin1'));
    const sections = traceAutoSectionsV1(trace, roles);
    const count = trace.passes.length;
    const sectionSpan = (section: unknown): PassSpan => {
      const found = sections.filter((candidate) => candidate.name === section);
      if (found.length === 0) return fail(`the file has no "${String(section)}" section. Its sections: ${[...new Set(sections.map((candidate) => candidate.name))].join(', ')}.`);
      return [Math.min(...found.map((candidate) => candidate.from)), Math.max(...found.map((candidate) => candidate.to))];
    };
    const inFile = (span: PassSpan): PassSpan => (span[0] >= 1 && span[0] <= span[1] && span[1] <= count ? span : fail(`passes ${span[0]}-${span[1]} are outside the file's 1-${count}.`));
    const through: unknown = entry.knittedThrough;
    let knittedThrough: number | null = null;
    let stopWithin: PassSpan | null = null;
    if (entry.stoppedDuringPass !== undefined) {
      const during = entry.stoppedDuringPass;
      if (typeof during !== 'number' || !Number.isInteger(during)) return fail('`stoppedDuringPass` is a whole pass number.');
      stopWithin = inFile([during, during]);
      knittedThrough = during - 1;
      if (through !== undefined && through !== knittedThrough) fail(`Stopping during pass ${during} confirms completion through pass ${knittedThrough}.`);
    } else if (through !== undefined) {
      if (Number.isInteger(through)) knittedThrough = inFile([through as number, through as number])[1];
      else if (isRecord(through) && Object.keys(through).join() === 'section') {
        stopWithin = sectionSpan(through.section);
        // Knowing the section reached proves the prefix before it, not that every pass of it ran.
        knittedThrough = stopWithin[0] - 1;
      } else fail('`knittedThrough` is a pass number or { "section": name }; leave it out when the run finished.');
    }
    if (!Array.isArray(entry.events)) fail('`events` is a list; write [] when nothing was reported.');
    const startEnd = Math.max(0, ...sections.filter((section) => START_SECTIONS.has(section.name)).map((section) => section.to));
    const events = entry.events.map((event: unknown): KnitRunEventV1 => {
      if (!isRecord(event)) return fail('an event is an object.');
      for (const key of Object.keys(event)) if (!EVENT_KEYS.has(key)) fail(`"${key}" is not a field of an event. Fields: ${[...EVENT_KEYS].join(', ')}.`);
      const kind = event.kind === 'fault' || event.kind === 'note' ? event.kind : fail(`an event is a "fault" or a "note", not "${String(event.kind)}".`);
      const what = typeof event.what === 'string' && event.what !== '' ? event.what : fail('every event says what was seen in `what`.');
      if (event.approximate !== undefined && typeof event.approximate !== 'boolean') fail('`approximate` is true or false.');
      if ([event.passes, event.section, event.carrierMoves].filter((value) => value !== undefined).length > 1) fail('an event gives one of `passes`, `section` or `carrierMoves`.');
      let spans: PassSpan[] | null = null;
      let approximate = event.approximate === true;
      if (event.section !== undefined) { spans = [sectionSpan(event.section)]; approximate = true; }
      else if (event.carrierMoves !== undefined) {
        const carriers = Array.isArray(event.carrierMoves) && event.carrierMoves.length > 0 && event.carrierMoves.every((carrier) => typeof carrier === 'string') ? event.carrierMoves as string[] : fail('`carrierMoves` is a list of carriers, like ["1", "6"].');
        spans = trace.passes.flatMap((pass, index): PassSpan[] => (index + 1 > startEnd && carriers.includes(pass.carrier) && pass.actions.length > 0 && pass.actions.every((action) => action.kind === 'move') ? [[index + 1, index + 1]] : []));
        if (spans.length === 0) fail(`no pass after the cast-on only moves carrier ${carriers.join(' or ')}.`);
        approximate = true;
      } else if (event.passes !== undefined) {
        const given = isSpan(event.passes) ? [event.passes] : event.passes;
        if (!Array.isArray(given) || given.length === 0 || !given.every(isSpan)) fail('`passes` is [from, to] or a list of such pairs.');
        spans = (given as PassSpan[]).map(inFile);
      }
      const latestPossible = stopWithin?.[1] ?? knittedThrough;
      if (spans !== null && latestPossible !== null && spans.some(([from, to]) => (approximate ? from : to) > latestPossible)) fail(`an event is placed after pass ${latestPossible}, ${stopWithin ? 'the latest possible stop' : 'the last pass knitted'}.`);
      return { kind, passes: spans, ...(approximate ? { approximate: true } : {}), what };
    });
    return { entry: entry as unknown as KnitLogEntry, trace, roles, sections, knittedThrough, stopWithin, events };
  });
  return { yarns: log.yarns, knits };
}

let cached: { evidence: KnitEvidenceV1; knits: LoggedKnit[]; yarns: Record<string, string> } | null = null;

/** The log joined to its files and to Kniterate's own reference files. Read once per process. */
export function loadKnitEvidence(): { evidence: KnitEvidenceV1; knits: LoggedKnit[]; yarns: Record<string, string> } {
  if (cached) return cached;
  const { knits, yarns } = readKnitLog();
  const references = atlas().map((entry) => ({ name: entry.name, trace: traceOf(readReferenceBytes(entry).toString('latin1'), entry.dialect), roles: entry.roles }));
  cached = { evidence: evidenceFrom(knits, references), knits, yarns };
  return cached;
}

export function evidenceFrom(knits: readonly LoggedKnit[], references: Parameters<typeof buildKnitEvidenceV1>[1] = []): KnitEvidenceV1 {
  return buildKnitEvidenceV1(knits.map((knit) => ({ id: knit.entry.id, trace: knit.trace, roles: knit.roles, knittedThrough: knit.knittedThrough, stopWithin: knit.stopWithin, clears: knit.entry.operatorSaidHowItRan === true, events: knit.events })), references);
}

/** Length of the identical executable start, including every rack command before each pass. */
export function commonPassPrefix(a: MachineTraceV1, b: MachineTraceV1): number {
  if (a.dialect !== b.dialect || a.profileId !== b.profileId || a.profileVersion !== b.profileVersion) return 0;
  let rack = 0;
  const length = Math.min(a.passes.length, b.passes.length);
  for (let index = 0; index < length; index++) {
    while (a.rackCommands[rack]?.beforePassIndex === index || b.rackCommands[rack]?.beforePassIndex === index) {
      const left = a.rackCommands[rack], right = b.rackCommands[rack];
      if (left?.beforePassIndex !== index || right?.beforePassIndex !== index || left.valueRaw !== right.valueRaw) return index;
      rack++;
    }
    const left = a.passes[index]!.raw, right = b.passes[index]!.raw;
    if (left.FRNT !== right.FRNT || left.STIF !== right.STIF || left.REAR !== right.REAR || left.STIR !== right.STIR || left.footer !== right.footer) return index;
  }
  return length;
}

/** Direct run records. An interval crossing the first difference retains its original uncertainty. */
export function matchingRunRecords(trace: MachineTraceV1, sha256: string, knits: readonly LoggedKnit[] = loadKnitEvidence().knits) {
  return knits.flatMap(({ entry, trace: earlier, knittedThrough, stopWithin, events }) => {
    const exactFile = entry.sha256 === sha256;
    const sameThrough = exactFile ? earlier.passes.length : commonPassPrefix(trace, earlier);
    if (!exactFile && sameThrough === 0) return [];
    const confirmed = knittedThrough ?? earlier.passes.length;
    const possible = stopWithin?.[1] ?? confirmed;
    const directEvents = events.flatMap((event) => {
      const sharedRanges = event.passes?.filter(([from]) => from <= Math.min(sameThrough, possible))
        .map(([from, to]) => [from, Math.min(to, sameThrough, possible)] as const) ?? [];
      if (!exactFile && event.passes !== null && sharedRanges.length === 0) return [];
      return [{ ...event, sharedRanges, fullyWithinSharedStart: event.passes !== null && event.passes.every(([, to]) => to <= Math.min(sameThrough, possible)) }];
    });
    return [{ knit: entry.id, exactFile, sha256: entry.sha256, sameThrough, confirmedSharedThrough: Math.min(sameThrough, confirmed),
      sourceStopWithin: stopWithin, ...(entry.stoppedDuringPass !== undefined ? { sourceStoppedDuringPass: entry.stoppedDuringPass } : {}),
      operatorSaidHowItRan: entry.operatorSaidHowItRan === true, events: directEvents,
      ...(entry.caveat ? { caveat: entry.caveat } : {}), ...(exactFile && entry.report ? { report: entry.report } : {}) }];
  });
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
  'between-widths': 'between knitted widths',
  'other-width': 'narrower or wider than any knit of these passes',
  faulted: 'with a fault on record and not yet two clean knits since',
  unclear: 'only in knits whose faults could not be ruled out for these passes',
  new: 'without confirmed execution on this machine',
};

const fault = (event: KnitEventRefV1) => ({
  knit: event.knit,
  executionConfirmed: event.executionConfirmed,
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
  const warned = new Set(check.faulted.flatMap((group) => group.passes));
  const unconfirmedWarnings = [...warned].filter((pass) => check.statuses[pass - 1] === 'new').length;
  const widths = (groups: KnittedCheckV1['otherWidth']) => grouped(groups, (found) => found.knittedAt.join(','), (found) => found.passes).map(({ first, passes }) => {
    const current = passes.map((pass) => check.descriptions[pass - 1]!.width);
    const [min, max] = [Math.min(...current), Math.max(...current)];
    return { passes: passRanges(passes), count: passes.length, columnsHere: min === max ? `${min}` : `${min}-${max}`, knittedOnColumns: passRanges(first.knittedAt) };
  });
  return {
    summary: `${check.passCount} passes: ${parts.join(', ')}.${unconfirmedWarnings ? ` ${unconfirmedWarnings} fault warnings overlap passes without confirmed execution.` : ''}`,
    counts,
    sections: sections.map((section) => {
      const inSection = check.statuses.slice(section.from - 1, section.to);
      const tally = (status: KnittedStatusV1) => inSection.filter((found) => found === status).length;
      const faulted = [...warned].filter((pass) => pass >= section.from && pass <= section.to).length;
      return { section: `${section.name} ${section.from}-${section.to}`, knitted: tally('knitted'), betweenWidths: tally('between-widths'), otherWidth: tally('other-width'), faulted, unclear: tally('unclear'), new: tally('new') };
    }),
    new: check.fresh.map((found) => ({
      passes: passRanges(found.passes),
      count: found.passes.length,
      pass: rows[found.passes[0]! - 1]!.text,
      ...(found.kniterate.length > 0 ? { inKniteratesFiles: found.kniterate } : {}),
      ...(found.closest ? {
        closest: {
          knits: found.closest.knits,
          ...(found.closest.standing !== 'knitted' ? { standingThere: found.closest.standing === 'faulted' ? 'a fault is on record for it' : 'only ran in knits whose faults could not be ruled out for it' } : {}),
          differs: found.closest.differences.map((difference) => `${difference.facet}: ${difference.known ?? 'nothing'} there, ${difference.here ?? 'nothing'} here`),
        },
      } : {}),
    })),
    betweenWidths: widths(check.betweenWidths),
    otherWidth: widths(check.otherWidth),
    faulted: grouped(check.faulted, (found) => JSON.stringify([found.faults, found.knitted, found.knittedSinceFault, found.clearance]), (found) => found.passes).map(({ first, passes }) => ({
      passes: passRanges(passes),
      count: passes.length,
      faults: first.faults.map(fault),
      knittedWithNoFaultSince: first.knittedSinceFault,
      clearanceByWidth: first.clearance,
    })),
    earlierFaultsSinceCleared: grouped(check.cleared, (found) => JSON.stringify([found.faults, found.knittedSinceFault, found.clearance]), (found) => found.passes).map(({ first, passes }) => ({
      passes: passRanges(passes),
      count: passes.length,
      faults: first.faults.map(fault),
      knittedWithNoFaultSince: first.knittedSinceFault,
      clearanceByWidth: first.clearance,
    })),
    unclear: grouped(check.unclear, (found) => JSON.stringify([found.faults, found.knits]), (found) => found.passes).map(({ first, passes }) => ({ passes: passRanges(passes), count: passes.length, knits: first.knits, unresolvedFaults: first.faults.map(fault) })),
    possibleFaultHistory: grouped(check.possibleFaultHistory, (found) => JSON.stringify(found.faults), (found) => found.passes).map(({ first, passes }) => ({ passes: passRanges(passes), possibleFaults: first.faults.map(fault) })),
    notes: grouped(check.notes, (found) => JSON.stringify(found.notes), (found) => found.passes).map(({ first, passes }) => ({ passes: passRanges(passes), count: passes.length, notes: first.notes.map(fault) })),
    placement: {
      needles: here ? `${here[0]}-${here[1]}` : 'none',
      earlierKnitsCovered: covered ? `${covered[0]}-${covered[1]}` : 'none',
      outsideEarlierKnits: Boolean(here && covered && (here[0] < covered[0] || here[1] > covered[1])),
    },
  };
}

/** The log itself: each knit with everything reported about it. */
export function knitLogSummary() {
  const { knits, yarns } = loadKnitEvidence();
  return knits.map((knit) => ({
    id: knit.entry.id,
    what: knit.entry.what,
    file: knit.entry.file,
    passes: knit.trace.passes.length,
    ...(knit.knittedThrough !== null ? { knittedThrough: knit.knittedThrough } : {}),
    ...(knit.stopWithin !== null ? { stopWithin: knit.stopWithin } : {}),
    ...(knit.entry.stoppedDuringPass !== undefined ? { stoppedDuringPass: knit.entry.stoppedDuringPass } : {}),
    operatorSaidHowItRan: knit.entry.operatorSaidHowItRan === true,
    events: knit.events.map((event) => ({
      kind: event.kind,
      where: event.passes === null ? 'not placed' : `passes ${passRanges(event.passes.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, offset) => from + offset)))}${event.approximate ? ' (where the report points)' : ''}`,
      what: event.what,
    })),
    yarns: Object.fromEntries(Object.entries(knit.entry.yarns).map(([carrier, yarn]) => [`C${carrier}`, yarns[yarn]])),
    ...(knit.entry.report ? { report: knit.entry.report } : {}),
    ...(knit.entry.caveat ? { caveat: knit.entry.caveat } : {}),
  }));
}
