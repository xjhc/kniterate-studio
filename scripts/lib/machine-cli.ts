/**
 * Machine-file commands for the Studio CLI: read what a .kc does pass by
 * pass, audit every loop, compare a stretch of passes with another file
 * (usually one of Kniterate's own), list Kniterate's reference files, and
 * build-and-audit every construction Studio makes.
 *
 * Inputs, wherever a file is taken:
 *   ref:<name>         one of Kniterate's files in packages/machine-lib/reference (see `reference`)
 *   <file.kc>          a machine file; recognised as a reference by its SHA-256
 *   <file.k>           knitout, converted as Studio converts it
 *   <project.json>     a Studio project, compiled; sweaters give one file per piece
 *   <package dir>      a handoff package (program.kc with its project) or a folder of .kc files
 *
 * Passes are numbered from 1, as in run records and on the machine.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  KNITERATE_7GG_KCODE_PROFILE_V2,
  auditTraceV1,
  compareTraceRangesV1,
  parseKCodeDocument,
  projectKCodeMachineTrace,
  traceAutoSectionsV1,
  traceRowsV1,
  type MachineTraceV1,
  type TraceAuditV1,
  type TraceSectionV1,
  type TraceYarnRolesV1,
} from '../../packages/machine-lib/src/browser.js';
import { knitoutToKCode } from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject, type ColorworkProjectV1 } from '../../packages/project-contract/src/index.js';
import { runAuthoredPipeline } from '../../apps/studio/src/authoredPipeline.js';
import { createBeanieProject } from '../../apps/studio/src/beanie.js';
import { planProject } from '../../apps/studio/src/plan.js';
import { chartKnitFileCarriers, chartRibRows, readKnitFile, type KnitFile } from '../../apps/studio/src/sweater/knitFile.js';
import { createPanelProject } from '../../apps/studio/src/sweater/panel.js';
import { createSweaterProject } from '../../apps/studio/src/sweater/sweater.js';
import { runSweaterPipeline } from '../../apps/studio/src/sweater/sweaterPipeline.js';
import { summarizeSweaterRun } from '../../apps/studio/src/sweater/sweaterRun.js';

export class MachineUsageError extends Error {}

const REFERENCE_DIR = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../packages/machine-lib/reference');

interface AtlasEntry {
  name: string;
  file: string;
  sha256: string;
  dialect: 'app' | 'knitout-vendor';
  what: string;
  roles: { waste: string; draw: string | null };
  sections: TraceSectionV1[];
  notes: string;
}

function atlas(): AtlasEntry[] {
  return (JSON.parse(readFileSync(join(REFERENCE_DIR, 'atlas.json'), 'utf8')) as { references: AtlasEntry[] }).references;
}

/** One machine file with what we know about it. */
export interface MachinePiece {
  /** How it is named in output: the path, ref:<name>, or <project> · <piece>. */
  name: string;
  source: 'reference' | 'file' | 'project' | 'package';
  what?: string;
  kcHash: string;
  trace: MachineTraceV1;
  sections: TraceSectionV1[];
  sectionSource: 'reference atlas' | 'project' | 'automatic';
  roles: TraceYarnRolesV1;
  notes?: string;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function traceOf(kcText: string, dialect?: 'app' | 'knitout-vendor'): MachineTraceV1 {
  for (const candidate of dialect ? [dialect] : (['knitout-vendor', 'app'] as const)) {
    const parsed = parseKCodeDocument(kcText, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: candidate, strict: true });
    if (parsed.ok) return projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2);
  }
  throw new MachineUsageError('Not a strict Kniterate KCode file (it does not parse in either dialect).');
}

/** Sections from Studio's own reading of a compiled file (the names run records use), 1-based. */
function projectSections(file: KnitFile | null): TraceSectionV1[] | null {
  if (file === null) return null;
  return file.sections.map((section) => ({ name: section.kind, from: section.passes.from + 1, to: section.passes.to + 1 }));
}

function rolesFrom(options: Map<string, string>, fallback: TraceYarnRolesV1): TraceYarnRolesV1 {
  const waste = options.get('--waste') ?? fallback.waste;
  const drawOption = options.get('--draw');
  const draw = drawOption === undefined ? fallback.draw : drawOption === 'none' ? null : drawOption;
  return { waste, draw };
}

function fromReference(entry: AtlasEntry, name: string): MachinePiece {
  const text = readFileSync(join(REFERENCE_DIR, entry.file), 'utf8');
  return { name, source: 'reference', what: entry.what, kcHash: entry.sha256, trace: traceOf(text, entry.dialect), sections: entry.sections, sectionSource: 'reference atlas', roles: entry.roles, notes: entry.notes };
}

function fromKcText(name: string, text: string, options: Map<string, string>, source: MachinePiece['source'] = 'file'): MachinePiece {
  const hash = sha256(text);
  const known = atlas().find((entry) => entry.sha256 === hash);
  if (known) return { ...fromReference(known, name), source };
  const roles = rolesFrom(options, { waste: '6', draw: '1' });
  const trace = traceOf(text);
  return { name, source, kcHash: hash, trace, sections: traceAutoSectionsV1(trace, roles), sectionSource: 'automatic', roles };
}

async function fromProject(path: string, project: ColorworkProjectV1, label: string, source: MachinePiece['source']): Promise<MachinePiece[]> {
  const { state } = materializeColorworkProject(project);
  const kind = state.object?.kind;
  if (kind === 'sweater' || kind === 'panel') {
    const run = await runSweaterPipeline(project);
    const roles = { waste: run.plan.carriers.waste, draw: run.plan.carriers.draw };
    return summarizeSweaterRun(run).pieces.flatMap((piece) => {
      if (!piece.kcText) return [];
      const trace = traceOf(piece.kcText);
      const sections = projectSections(piece.file);
      return [{ name: `${label} · ${piece.id}`, source, kcHash: piece.kcHash!, trace, sections: sections ?? traceAutoSectionsV1(trace, roles), sectionSource: sections ? 'project' as const : 'automatic' as const, roles }];
    });
  }
  const result = await runAuthoredPipeline(project);
  if (result.kcode === null || !result.kcode.ok || result.compiled === null) throw new MachineUsageError(`${path}: the project has no exportable program (${result.verdict.state}).`);
  const plan = planProject(state, materializeColorworkProject(project).placements);
  const carriers = chartKnitFileCarriers(result.compiled.frame, state.machine.yarnAssignments, state.chart.palette);
  const ribRows = chartRibRows(state, plan);
  const file = carriers ? readKnitFile(result.kcode, { zoneOfRow: (row) => (row < ribRows ? 'rib' : 'body'), carriers, kind: kind === 'beanie' ? 'beanie' : 'panel' }) : null;
  const trace = result.kcode.trace!;
  const sections = projectSections(file);
  const roles = { waste: carriers?.waste ?? '6', draw: carriers?.draw ?? null };
  return [{ name: label, source, kcHash: result.kcode.kcHash, trace, sections: sections ?? traceAutoSectionsV1(trace, roles), sectionSource: sections ? 'project' : 'automatic', roles }];
}

/** Resolve a command-line input to one or more machine files. */
export async function loadMachineInput(input: string, options: Map<string, string>, readProject: (path: string) => Promise<ColorworkProjectV1>): Promise<MachinePiece[]> {
  if (input.startsWith('ref:')) {
    const wanted = input.slice(4).replace(/\.kc$/, '');
    const entry = atlas().find((item) => item.name === wanted);
    if (!entry) throw new MachineUsageError(`No reference called "${wanted}". Known: ${atlas().map((item) => item.name).join(', ')}.`);
    return [fromReference(entry, input)];
  }
  if (!existsSync(input)) throw new MachineUsageError(`${input}: no such file or folder.`);
  if (statSync(input).isDirectory()) {
    const program = join(input, 'program.kc');
    const projectPath = join(input, 'project.kniterate-studio.json');
    if (existsSync(program)) {
      const text = readFileSync(program, 'utf8');
      if (existsSync(projectPath)) {
        // Name the sections from the project when it re-makes these exact bytes.
        const pieces = await fromProject(projectPath, await readProject(projectPath), input, 'package').catch(() => []);
        const same = pieces.find((piece) => piece.kcHash === sha256(text));
        if (same) return [{ ...same, name: input }];
        return [{ ...fromKcText(input, text, options, 'package'), notes: 'The project no longer re-makes these bytes, so sections are automatic.' }];
      }
      return [fromKcText(input, text, options, 'package')];
    }
    const files = readdirSync(input).filter((file) => file.endsWith('.kc')).sort();
    if (files.length === 0) throw new MachineUsageError(`${input}: no program.kc or .kc files in this folder.`);
    return files.map((file) => fromKcText(join(input, file), readFileSync(join(input, file), 'utf8'), options));
  }
  if (input.endsWith('.kc')) return [fromKcText(input, readFileSync(input, 'utf8'), options)];
  if (input.endsWith('.k')) {
    const converted = knitoutToKCode(readFileSync(input, 'utf8'));
    if (!converted.ok || converted.kcode === undefined) throw new MachineUsageError(`${input}: the knitout does not convert to KCode (${converted.stderr.trim().split('\n')[0] ?? 'converter error'}).`);
    return [fromKcText(input, converted.kcode, options)];
  }
  if (input.endsWith('.json')) return fromProject(input, await readProject(input), basename(input), 'project');
  throw new MachineUsageError(`${input}: expected ref:<name>, a .kc or .k file, a project .json, or a package folder.`);
}

function pick(pieces: MachinePiece[], options: Map<string, string>, command: string): MachinePiece {
  const wanted = options.get('--piece');
  if (wanted !== undefined) {
    const found = pieces.find((piece) => piece.name.endsWith(` · ${wanted}`) || piece.name === wanted);
    if (!found) throw new MachineUsageError(`No piece "${wanted}". Pieces: ${pieces.map((piece) => piece.name).join(', ')}.`);
    return found;
  }
  if (pieces.length > 1) throw new MachineUsageError(`${command} needs one file; this input has ${pieces.length}. Add --piece <id> (${pieces.map((piece) => piece.name.split(' · ').at(-1)).join(', ')}).`);
  return pieces[0]!;
}

/** `<from>-<to>` or `<n>`, 1-based. */
function parseRange(text: string, passCount: number): { from: number; to: number } {
  const match = /^(\d+)(?:-(\d+))?$/.exec(text.trim());
  if (!match) throw new MachineUsageError(`"${text}" is not a pass range; write 100-120 or 106.`);
  const from = Number(match[1]);
  const to = match[2] === undefined ? from : Number(match[2]);
  if (from < 1 || to < from || from > passCount) throw new MachineUsageError(`Pass range ${text} is outside 1-${passCount}.`);
  return { from, to: Math.min(to, passCount) };
}

function sectionRange(piece: MachinePiece, name: string): { from: number; to: number } {
  const matches = piece.sections.filter((section) => section.name === name);
  if (matches.length === 0) throw new MachineUsageError(`${piece.name} has no "${name}" section. Its sections: ${[...new Set(piece.sections.map((section) => section.name))].join(', ')}.`);
  return { from: Math.min(...matches.map((section) => section.from)), to: Math.max(...matches.map((section) => section.to)) };
}

function header(piece: MachinePiece) {
  // Section source says which rule cut the file: the reference atlas, Studio's own run-record reading, or the automatic rule.
  return {
    file: piece.name,
    source: piece.source,
    ...(piece.what ? { what: piece.what } : {}),
    passCount: piece.trace.passes.length,
    kcodeSha256: piece.kcHash,
    yarnRoles: piece.roles,
    sections: piece.sections.map((section) => `${section.name} ${section.from}-${section.to}`),
    sectionSource: piece.sectionSource,
    ...(piece.notes ? { notes: piece.notes } : {}),
  };
}

/** passes <input> [<from>-<to>] [--section <name>] [--piece <id>] */
export function passesCommand(pieces: MachinePiece[], range: string | undefined, options: Map<string, string>, detail: boolean) {
  if (range === undefined && !options.has('--section')) {
    return { kind: 'kniterate-studio-passes', files: pieces.map(header), hint: 'Add a pass range (e.g. 100-120) or --section <name> to list passes.' };
  }
  const piece = pick(pieces, options, 'passes');
  const span = range !== undefined ? parseRange(range, piece.trace.passes.length) : sectionRange(piece, options.get('--section')!);
  const rows = traceRowsV1(piece.trace, piece.sections).slice(span.from - 1, span.to);
  return { kind: 'kniterate-studio-passes', ...header(piece), range: span, passes: detail ? rows : rows.map((row) => row.text) };
}

function auditSummary(audit: TraceAuditV1) {
  return audit.checks.map((check) => `${check.id} ${check.value}${check.limit !== null ? `/${check.limit}` : ''} ${check.ok ? 'ok' : check.severity === 'issue' ? 'ISSUE' : 'note'}`).join(', ');
}

/** audit <input> [--piece <id>] [--waste C] [--draw C|none] */
export function auditCommand(pieces: MachinePiece[], options: Map<string, string>) {
  const chosen = options.has('--piece') ? [pick(pieces, options, 'audit')] : pieces;
  const files = chosen.map((piece) => {
    const roles = options.has('--waste') || options.has('--draw') ? rolesFrom(options, piece.roles) : piece.roles;
    const audit = auditTraceV1(piece.trace, { roles, sections: piece.sections });
    return {
      ...header(piece),
      ok: audit.ok,
      summary: auditSummary(audit),
      checks: audit.checks,
      longestHolds: audit.longestHolds.map((hold) => `${hold.passes} passes on ${hold.needle}: made by c${hold.from.carrier} at pass ${hold.from.pass}${hold.section ? ` (${hold.section})` : ''}, knitted by c${hold.to.carrier} at ${hold.to.pass}`),
      emptyNeedleKnits: audit.emptyNeedleKnits,
    };
  });
  return { result: { kind: 'kniterate-studio-audit', ok: files.every((file) => file.ok), files }, ok: files.every((file) => file.ok) };
}

/** compare <a> <b> [--section <name> | --passes <a-range>[,<b-range>]] [--carriers 2=4,3=3] */
export function compareCommand(aInput: MachinePiece, bInput: MachinePiece, options: Map<string, string>) {
  // Both files are cut into sections by the same rule (traceAutoSectionsV1), so a Studio file and one of
  // Kniterate's line up section by section; run-record names stay with passes and audit.
  const aligned = (piece: MachinePiece): MachinePiece => ({ ...piece, sections: traceAutoSectionsV1(piece.trace, piece.roles), sectionSource: 'automatic' })
  const a = aligned(aInput)
  const b = aligned(bInput)
  const carrierMap: Record<string, string> = {};
  for (const pair of (options.get('--carriers') ?? '').split(',').filter(Boolean)) {
    const [from, to] = pair.split('=');
    if (!from || !to) throw new MachineUsageError(`--carriers takes pairs like 2=4,3=3; got "${pair}".`);
    carrierMap[from] = to;
  }
  const base = { kind: 'kniterate-studio-compare', a: header(a), b: header(b), ...(Object.keys(carrierMap).length ? { carrierMap } : {}) };
  if (options.has('--passes')) {
    const [aText, bText] = options.get('--passes')!.split(',');
    const comparison = compareTraceRangesV1(a.trace, parseRange(aText!, a.trace.passes.length), b.trace, parseRange(bText ?? aText!, b.trace.passes.length), { carrierMap });
    return { result: { ...base, comparison }, identical: comparison.identical === comparison.compared && comparison.unmatched.a + comparison.unmatched.b === 0 };
  }
  if (options.has('--section')) {
    const name = options.get('--section')!;
    const comparison = compareTraceRangesV1(a.trace, sectionRange(a, name), b.trace, sectionRange(b, name), { carrierMap });
    return { result: { ...base, section: name, comparison }, identical: comparison.identical === comparison.compared && comparison.unmatched.a + comparison.unmatched.b === 0 };
  }
  // Every section both files have, summarised; pick one with --section for the differences.
  const names = [...new Set(a.sections.map((section) => section.name))].filter((name) => b.sections.some((section) => section.name === name));
  const sections = names.map((name) => {
    const comparison = compareTraceRangesV1(a.trace, sectionRange(a, name), b.trace, sectionRange(b, name), { carrierMap, maxDifferences: 3 });
    return { section: name, a: comparison.a, b: comparison.b, compared: comparison.compared, identical: comparison.identical, unmatched: comparison.unmatched, firstDifferences: comparison.differences.map((difference) => `a ${difference.a} / b ${difference.b}: ${difference.fields.join(', ')}`) };
  });
  return { result: { ...base, sections, hint: 'Add --section <name> for every differing pass in one section, or --passes 106-112 for any range.' }, identical: sections.every((section) => section.identical === section.compared && section.unmatched.a + section.unmatched.b === 0) };
}

/** reference [name] */
export function referenceCommand(name: string | undefined) {
  const entries = atlas();
  if (name === undefined) {
    return {
      kind: 'kniterate-studio-references',
      about: "Kniterate's own machine files in packages/machine-lib/reference. Use them as ref:<name> with passes, audit and compare.",
      references: entries.map((entry) => ({ name: `ref:${entry.name}`, what: entry.what, sections: entry.sections.map((section) => `${section.name} ${section.from}-${section.to}`) })),
    };
  }
  const entry = entries.find((item) => item.name === name.replace(/^ref:/, '').replace(/\.kc$/, ''));
  if (!entry) throw new MachineUsageError(`No reference called "${name}". Known: ${entries.map((item) => item.name).join(', ')}.`);
  const piece = fromReference(entry, `ref:${entry.name}`);
  const audit = auditTraceV1(piece.trace, { roles: piece.roles, sections: piece.sections });
  return { kind: 'kniterate-studio-reference', ...header(piece), file: join('packages/machine-lib/reference', entry.file), dialect: entry.dialect, audit: auditSummary(audit) };
}

/** The constructions `matrix` builds: every product Studio offers, including the narrow and odd widths where the start fixes live. */
async function* constructions(quick: boolean): AsyncGenerator<{ name: string; pieces: () => Promise<{ name: string; piece: string | null; kcText: string | null; verdict: string; sections: TraceSectionV1[] | null }[]> }> {
  const options = (id: string) => ({ id, source: 'human' as const, group: 'create' });
  const gauge = { stitchesPer10cm: 20, rowsPer10cm: 28, source: 'assumed' as const };
  const ribGauge = { stitchesPer10cm: 22, rowsPer10cm: 30, source: 'assumed' as const };
  const yarn = { name: 'Oat', hex: '#D9CBB0' };
  const chartProject = (technique: 'fairisle' | 'birdseye', width: number) => {
    const height = 24;
    const cells = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (((x - width / 2) / (width / 4)) ** 2 + ((height / 2 - y) / 7) ** 2 < 1 || (x + y) % 7 === 0 ? 1 : 0)));
    const chart = { kind: 'knitlab-colorwork-chart', version: 1, title: `${technique} ${width}`, width, height, rowNumbering: 'bottom-up', palette: [{ id: 'natural', name: 'Natural', hex: '#F4F0E6' }, { id: 'red', name: 'Red', hex: '#C2413A' }], cells } as const;
    let project = createColorworkProjectV1(chart, { id: `chart-${technique}-${width}` });
    project = appendProjectEdit(project, { id: 'strategy', source: 'human', edit: { kind: 'set-strategy', strategy: { technique, floatLimit: 5 } } });
    return project;
  };
  const authored = async (project: ColorworkProjectV1) => {
    const result = await runAuthoredPipeline(project);
    const { state, placements } = materializeColorworkProject(project);
    let sections: TraceSectionV1[] | null = null;
    if (result.kcode?.ok && result.compiled) {
      const carriers = chartKnitFileCarriers(result.compiled.frame, state.machine.yarnAssignments, state.chart.palette);
      const ribRows = chartRibRows(state, planProject(state, placements));
      sections = carriers ? projectSections(readKnitFile(result.kcode, { zoneOfRow: (row) => (row < ribRows ? 'rib' : 'body'), carriers, kind: state.object?.kind === 'beanie' ? 'beanie' : 'panel' })) : null;
    }
    return [{ name: project.id, piece: null, kcText: result.exportReady ? result.kcode?.kcText ?? null : null, verdict: result.exportReady ? result.verdict.label : `${result.verdict.label} (not exportable)`, sections }];
  };
  const pieced = async (project: ColorworkProjectV1) => {
    const summary = summarizeSweaterRun(await runSweaterPipeline(project));
    return summary.pieces.map((piece) => ({ name: `${project.id}-${piece.id}`, piece: piece.id as string, kcText: piece.kcText, verdict: piece.verdict.label, sections: projectSections(piece.file) }));
  };
  for (const technique of ['fairisle', 'birdseye'] as const) {
    for (const width of quick ? [9, 60] : [9, 12, 19, 20, 21, 60]) yield { name: `chart ${technique} ${width} wide`, pieces: () => authored(chartProject(technique, width)) };
  }
  const hats = [
    createBeanieProject({ title: 'Toque', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: gauge, cuffCm: 7, ribGauge, fold: true, main: { name: 'Black', hex: '#111111' }, accent: { name: 'White', hex: '#F2F2F2' } }, options('beanie-toque')),
    createBeanieProject({ title: 'Rib hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: ribGauge, main: { name: 'Black', hex: '#111111' } }, options('beanie-rib')),
    createBeanieProject({ title: 'Birdseye toque', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: gauge, cuffCm: 7, ribGauge, fold: true, backing: 'birdseye', main: { name: 'Black', hex: '#111111' }, accent: { name: 'White', hex: '#F2F2F2' } }, options('beanie-birdseye')),
  ];
  for (const hat of quick ? hats.slice(0, 1) : hats) yield { name: hat.id, pieces: () => authored(hat) };
  const panels = [
    createPanelProject({ title: 'Narrow scarf', widthCm: 5, lengthCm: 10, textureId: 'stockinette', yarn }, options('panel-narrow')),
    createPanelProject({ title: 'Scarf', widthCm: 25, lengthCm: 30, textureId: 'seed', ends: { rib: 'kkpp', cm: 4 }, yarn }, options('panel-scarf')),
  ];
  for (const panel of panels) yield { name: panel.id, pieces: () => pieced(panel) };
  const sweaters = quick ? [['set-in', 'crew']] as const : [['set-in', 'crew'], ['set-in', 'v'], ['set-in', 'square'], ['set-in', 'boat'], ['drop-shoulder', 'crew'], ['j-sleeve', 'crew']] as const;
  for (const [silhouette, neckline] of sweaters) {
    const project = createSweaterProject({ title: 'Sweater', silhouette, neckline, size: 'M', fit: 'classic', textureId: 'stockinette', yarn }, options(`sweater-${silhouette}-${neckline}`));
    yield { name: project.id, pieces: () => pieced(project) };
  }
}

/** matrix -o <dir> [--quick] */
export async function matrixCommand(out: string | null, quick: boolean) {
  if (out !== null) await mkdir(out, { recursive: true });
  const rows: { construction: string; file: string; verdict: string; audit: string; ok: boolean; issues: string[] }[] = [];
  for await (const construction of constructions(quick)) {
    for (const piece of await construction.pieces()) {
      if (piece.kcText === null) { rows.push({ construction: piece.piece === null ? construction.name : `${construction.name} · ${piece.piece}`, file: piece.name, verdict: piece.verdict, audit: 'no machine file', ok: false, issues: [`no exportable program (${piece.verdict})`] }); continue; }
      if (out !== null) await writeFile(join(out, `${piece.name}.kc`), piece.kcText);
      const trace = traceOf(piece.kcText, 'knitout-vendor');
      const audit = auditTraceV1(trace, { sections: piece.sections ?? traceAutoSectionsV1(trace) });
      const issues = audit.checks.filter((check) => !check.ok && check.severity === 'issue').map((check) => `${check.id} ${check.value}${check.at?.[0] ? `: ${check.at[0]}` : ''}`);
      rows.push({ construction: piece.piece === null ? construction.name : `${construction.name} · ${piece.piece}`, file: out !== null ? join(out, `${piece.name}.kc`) : piece.name, verdict: piece.verdict, audit: auditSummary(audit), ok: issues.length === 0, issues });
    }
  }
  const ok = rows.every((row) => row.ok);
  return { result: { kind: 'kniterate-studio-matrix', quick, ok, files: rows.length, failing: rows.filter((row) => !row.ok).length, rows }, ok };
}
