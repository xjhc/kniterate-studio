#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import {
  ProjectEditSchema,
  appendProjectEdit,
  createColorworkProjectV1,
  materializeColorworkProject,
  redoProjectEdit,
  serializeColorworkProjectV1,
  undoProjectEdit,
  type ColorworkProjectV1,
  type ProjectEdit,
} from '../packages/project-contract/src/index.ts';
import { runAuthoredPipeline, type AuthoredPipelineResult } from '../apps/studio/src/authoredPipeline.ts';
import { openStudioProjectJson } from '../apps/studio/src/chart/projectFile.ts';
import { explain } from '../apps/studio/src/explain.ts';
import { imageToChart, type ImageChartSize } from '../apps/studio/src/imageChart.ts';
import { planProject, type ProjectPlan } from '../apps/studio/src/plan.ts';
import { collectFindings, resolveReadiness, type Finding, type Readiness } from '../apps/studio/src/readiness.ts';
import { decodePng, encodePng } from './lib/png.ts';
import { RENDER_VIEWS, renderView, type RenderView } from './lib/render.ts';

const USAGE = `Usage: pnpm --silent studio -- <command> [args]

Every command prints JSON. Exit 0 = ok / export-ready, 1 = blocked, 2 = usage or read error.

  new <chart.json|project.json> -o <project.json> [--id <id>]
  new --width <st> --height <rows> [--palette "Name=#RRGGBB,..."] [--title <t>] -o <project.json>
      Start a project from a ColorworkChartV1 file, an existing project, or a blank chart.
  image <file.png> -o <chart.json> (--width-st N | --height-rows N | --width-cm X | --height-cm X)
        [--gauge <st>,<rows>] [--colors K] [--pooling mean|mode] [--title <t>]
      Convert an image to a ColorworkChartV1 chart. --gauge is stitches,rows per 10 cm; with it the
      row count follows the stitch aspect instead of one pixel per stitch. mean (default) keeps thin
      lines; mode keeps flat color regions crisp. Then run: new <chart.json>.
  show <project.json> [--cells]
      Materialized state: chart size, palette, row ids, yarns, strategy, gauge, target, overrides.
  plan <project.json>
      Derived sizing with provenance: counts, needle range, predicted cm, size checks, plan findings.
  describe <project.json>
      One-screen summary plus verdict, readiness, and operator checks (compiles the project).
  readiness <project.json>
      Compile and report readiness: ready only when nothing blocks. Exit 0 ready, 1 not ready.
  edit <project.json> <edit> [--source human|assistant] [-o <out.json>]
      Apply one typed edit or an array of edits. <edit> is inline JSON, a file path, or - for stdin.
      Writes back to <project.json> unless -o is given. Prints the plan before and after.
  undo <project.json> | redo <project.json>
  compile <project.json>
      Compile, convert, and validate exactly as Studio does; prints verdict, readiness, findings,
      compiled frame, and every carrier required by the emitted program.
  export <project.json> -o <file.kc>
      Write the validated .kc only when the verdict allows export (the Studio Export gate).
  render <project.json> --view ${RENDER_VIEWS.join('|')} -o <file.png>
      Draw the chart (gauge-true proportions), the projected back face, or a per-pass heat map.
  explain <term|rule>
      Plain-language meaning of a design term, plan rule, or validator rule.
  schema
      JSON Schema for <edit>.`;

const MAX_FINDINGS = 200;

class UsageError extends Error {}

const VALUE_OPTIONS = ['--view', '--width', '--height', '--palette', '--title', '--gauge', '--colors', '--pooling', '--width-st', '--height-rows', '--width-cm', '--height-cm'] as const;

interface Parsed {
  command: string | null;
  positionals: string[];
  out: string | null;
  id: string | null;
  source: 'human' | 'assistant';
  cells: boolean;
  options: Map<string, string>;
}

function parseArguments(args: readonly string[]): Parsed {
  const parsed: Parsed = { command: null, positionals: [], out: null, id: null, source: 'assistant', cells: false, options: new Map() };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    const value = (): string => {
      const next = args[index + 1];
      if (next === undefined) throw new UsageError(`${argument} requires a value.`);
      index += 1;
      return next;
    };
    if (argument === '--') continue;
    else if (argument === '-o' || argument === '--out') parsed.out = value();
    else if (argument === '--id') parsed.id = value();
    else if (argument === '--source') {
      const source = value();
      if (source !== 'human' && source !== 'assistant') throw new UsageError('--source must be human or assistant.');
      parsed.source = source;
    } else if (argument === '--cells') parsed.cells = true;
    else if ((VALUE_OPTIONS as readonly string[]).includes(argument)) parsed.options.set(argument, value());
    else if (argument === '--help' || argument === '-h') parsed.command = 'help';
    else if (argument.startsWith('-') && argument !== '-') throw new UsageError(`Unsupported option: ${argument}`);
    else if (parsed.command === null) parsed.command = argument;
    else parsed.positionals.push(argument);
  }
  return parsed;
}

function positional(parsed: Parsed, index: number, name: string): string {
  const value = parsed.positionals[index];
  if (value === undefined) throw new UsageError(`Missing ${name}.`);
  return value;
}

function numberOption(parsed: Parsed, name: string): number | null {
  const raw = parsed.options.get(name);
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new UsageError(`${name} must be a positive number.`);
  return value;
}

function integerOption(parsed: Parsed, name: string): number | null {
  const value = numberOption(parsed, name);
  if (value !== null && !Number.isInteger(value)) throw new UsageError(`${name} must be a whole number.`);
  return value;
}

function gaugeOption(parsed: Parsed): { stitchesPer10cm: number; rowsPer10cm: number } | null {
  const raw = parsed.options.get('--gauge');
  if (raw === undefined) return null;
  const [stitches, rows] = raw.split(',').map(Number);
  if (!(stitches! > 0) || !(rows! > 0)) throw new UsageError('--gauge must be <stitches>,<rows> per 10 cm, e.g. 26,34.');
  return { stitchesPer10cm: stitches!, rowsPer10cm: rows! };
}

const newId = (): string => randomUUID().replace(/-/g, '').slice(0, 12);

async function readProject(path: string): Promise<ColorworkProjectV1> {
  return openStudioProjectJson(await readFile(path, 'utf8'), newId).project;
}

async function writeProject(path: string, project: ColorworkProjectV1): Promise<void> {
  await writeFile(path, serializeColorworkProjectV1(project));
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function readEdits(argument: string): Promise<ProjectEdit[]> {
  const trimmed = argument.trimStart();
  const text = argument === '-' ? await readStdin()
    : trimmed.startsWith('{') || trimmed.startsWith('[') ? argument
    : await readFile(argument, 'utf8');
  const value = JSON.parse(text) as unknown;
  return (Array.isArray(value) ? value : [value]).map((edit) => ProjectEditSchema.parse(edit));
}

function describeProject(project: ColorworkProjectV1, includeCells: boolean) {
  const { state, overrides } = materializeColorworkProject(project);
  return {
    id: project.id,
    title: project.title,
    history: { cursor: project.history.cursor, entries: project.history.entries.length },
    chart: {
      width: state.chart.width,
      height: state.chart.height,
      rowNumbering: state.chart.rowNumbering,
      palette: state.chart.palette,
      rowIds: state.rowIds,
      ...(includeCells ? { cells: state.chart.cells } : {}),
    },
    machine: state.machine,
    strategy: state.strategy,
    gauge: state.gauge ?? null,
    target: state.target ?? null,
    overrides,
  };
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** The emitted trace owns which carriers are required; project intent names yarns. */
function carrierRequirements(project: ColorworkProjectV1, result: AuthoredPipelineResult) {
  const trace = result.kcode?.trace;
  if (trace === null || trace === undefined) return null;
  const { state } = materializeColorworkProject(project);
  const frame = result.compiled?.frame;
  return [...new Set(trace.passes.map((pass) => pass.carrier).filter((carrier) => carrier !== '0'))]
    .sort()
    .map((carrier) => {
      const assignment = state.machine.yarnAssignments.find((item) => item.carrier === carrier);
      const role = assignment !== undefined ? 'pattern'
        : carrier === frame?.wasteCarrier ? 'waste'
        : frame?.frameCarriers.includes(carrier) || carrier === frame?.drawCarrier ? 'frame'
        : 'unassigned';
      return { carrier, role, paletteId: assignment?.paletteId ?? null, yarnName: assignment?.yarnName ?? null };
    });
}

interface Evaluated {
  plan: ProjectPlan;
  result: AuthoredPipelineResult;
  findings: Finding[];
  readiness: Readiness;
}

async function evaluate(project: ColorworkProjectV1): Promise<Evaluated> {
  const plan = planProject(materializeColorworkProject(project).state);
  const result = await runAuthoredPipeline(project);
  const findings = collectFindings(plan, result);
  return { plan, result, findings, readiness: resolveReadiness({ verdict: result.verdict, findings }) };
}

/** The sizing facts an edit can change, for before/after comparison. */
function planSnapshot(plan: ProjectPlan) {
  return {
    stitches: plan.stitches.value,
    rows: plan.rows.value,
    needles: plan.needles,
    predictedCm: plan.predicted === null ? null : { width: plan.predicted.widthCm.value, height: plan.predicted.heightCm.value },
    sizeChecks: plan.sizeChecks.map(({ dimension, targetCm, required, actual, ok }) => ({ dimension, targetCm, required: required.value, actual, ok })),
    findings: plan.findings.map(({ rule, path }) => ({ rule, path })),
  };
}

function formatMinutes(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'unknown';
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

function summary(project: ColorworkProjectV1, evaluated: Evaluated): string[] {
  const { plan, result, readiness } = evaluated;
  const lines = [
    `Project "${project.title}" (${project.id}), edit ${project.history.cursor} of ${project.history.entries.length}`,
    `Panel: ${plan.stitches.value} st × ${plan.rows.value} rows on needles ${plan.needles.first}–${plan.needles.last}; backing ${plan.backing.technique} (float limit ${plan.backing.floatLimit})`,
    plan.gauge === null ? 'Gauge: none recorded (sizes in cm are unknown)'
      : `Gauge: ${plan.gauge.stitchesPer10cm} st / ${plan.gauge.rowsPer10cm} rows per 10 cm (${plan.gauge.source}) → predicted ${plan.predicted!.widthCm.value} × ${plan.predicted!.heightCm.value} cm`,
  ];
  if (plan.target !== null) {
    lines.push(`Target: ${plan.sizeChecks.length === 0 ? 'set, but not checkable without a gauge' : plan.sizeChecks.map((check) => `${check.dimension} ${check.targetCm} cm needs ${check.required.value}, has ${check.actual} ${check.ok ? '✓' : '✗'}`).join('; ')}`);
  }
  lines.push(`Yarns: ${plan.yarns.map((yarn) => `${yarn.paletteId} ${yarn.hex} "${yarn.yarnName ?? yarn.name}" → ${yarn.carrier === null ? 'UNASSIGNED' : `C${yarn.carrier}`}`).join('; ')}`);
  lines.push(`Verdict: ${result.verdict.label}${result.kcode ? `; ${result.kcode.passCount} passes` : ''}; estimated knit time ${formatMinutes(result.compiled?.stats.estimatedKnitTimeSeconds)}`);
  lines.push(readiness.ready ? 'Readiness: READY' : `Readiness: NOT READY — ${readiness.blockers.map((blocker) => blocker.kind === 'verdict-blocked' ? 'verdict Blocked' : blocker.kind === 'finding' ? `${blocker.rule} (${blocker.owner})` : `${blocker.kind}: ${blocker.rule}`).join('; ')}`);
  for (const check of readiness.operatorChecks) lines.push(`Operator check: ${check}`);
  return lines;
}

function blankChart(parsed: Parsed) {
  const width = integerOption(parsed, '--width');
  const height = integerOption(parsed, '--height');
  if (width === null || height === null) throw new UsageError('new needs a chart or project file, or --width and --height for a blank chart.');
  const palette = (parsed.options.get('--palette') ?? 'Natural=#F2EFE8,Navy=#2B4A6F').split(',').map((entry, index) => {
    const [name, hex] = entry.split('=').map((part) => part.trim());
    if (!name || !hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) throw new UsageError(`--palette entries must be Name=#RRGGBB; got "${entry}".`);
    return { id: `c${index + 1}`, name, hex: hex.toUpperCase() };
  });
  return {
    kind: 'knitlab-colorwork-chart', version: 1, title: parsed.options.get('--title') ?? 'Untitled', width, height,
    rowNumbering: 'bottom-up', palette, cells: Array.from({ length: height }, () => Array<number>(width).fill(0)),
  };
}

async function main(): Promise<number> {
  const parsed = parseArguments(process.argv.slice(2));
  switch (parsed.command) {
    case null:
      throw new UsageError('A command is required.');
    case 'help':
      print({ usage: USAGE });
      return 0;
    case 'schema':
      print(ProjectEditSchema.toJSONSchema());
      return 0;
    case 'explain':
      print(explain(positional(parsed, 0, 'term or rule')));
      return 0;
    case 'new': {
      if (parsed.out === null) throw new UsageError('new requires -o <project.json>.');
      let project = parsed.positionals.length > 0
        ? await readProject(positional(parsed, 0, 'chart or project file'))
        : createColorworkProjectV1(blankChart(parsed), { id: newId() });
      if (parsed.id !== null) project = { ...project, id: parsed.id };
      await writeProject(parsed.out, project);
      print(describeProject(project, false));
      return 0;
    }
    case 'image': {
      if (parsed.out === null) throw new UsageError('image requires -o <chart.json>.');
      const bytes = await readFile(positional(parsed, 0, 'PNG file'));
      const sizes: [string, (value: number) => ImageChartSize][] = [
        ['--width-st', (value) => ({ widthStitches: value })],
        ['--height-rows', (value) => ({ heightRows: value })],
        ['--width-cm', (value) => ({ widthCm: value })],
        ['--height-cm', (value) => ({ heightCm: value })],
      ];
      const chosen = sizes.filter(([name]) => parsed.options.has(name));
      if (chosen.length !== 1) throw new UsageError('image needs exactly one of --width-st, --height-rows, --width-cm, --height-cm.');
      const [sizeName, toSize] = chosen[0]!;
      const sizeValue = sizeName.endsWith('-cm') ? numberOption(parsed, sizeName)! : integerOption(parsed, sizeName)!;
      const pooling = parsed.options.get('--pooling') ?? 'mean';
      if (pooling !== 'mode' && pooling !== 'mean') throw new UsageError('--pooling must be mode or mean.');
      const converted = imageToChart(decodePng(bytes), {
        size: toSize(sizeValue),
        colors: integerOption(parsed, '--colors') ?? 2,
        gauge: gaugeOption(parsed),
        pooling,
        ...(parsed.options.has('--title') ? { title: parsed.options.get('--title')! } : {}),
      });
      await writeFile(parsed.out, `${JSON.stringify(converted.chart)}\n`);
      print({ chart: parsed.out, receipt: { ...converted.receipt, sourceSha256: createHash('sha256').update(bytes).digest('hex') }, palette: converted.chart.palette });
      return 0;
    }
    case 'show':
      print(describeProject(await readProject(positional(parsed, 0, 'project file')), parsed.cells));
      return 0;
    case 'plan':
      print(planProject(materializeColorworkProject(await readProject(positional(parsed, 0, 'project file'))).state));
      return 0;
    case 'describe':
    case 'readiness': {
      const project = await readProject(positional(parsed, 0, 'project file'));
      const evaluated = await evaluate(project);
      const findings = evaluated.findings.slice(0, MAX_FINDINGS);
      print(parsed.command === 'describe'
        ? { summary: summary(project, evaluated), verdict: evaluated.result.verdict, readiness: evaluated.readiness, findingCount: evaluated.findings.length, findings }
        : { verdict: evaluated.result.verdict, readiness: evaluated.readiness, findingCount: evaluated.findings.length, findings });
      return evaluated.readiness.ready ? 0 : 1;
    }
    case 'edit': {
      const path = positional(parsed, 0, 'project file');
      let project = await readProject(path);
      const before = planSnapshot(planProject(materializeColorworkProject(project).state));
      for (const edit of await readEdits(positional(parsed, 1, 'edit'))) {
        project = appendProjectEdit(project, { id: `cli-${randomUUID()}`, source: parsed.source, edit });
      }
      await writeProject(parsed.out ?? path, project);
      const after = planSnapshot(planProject(materializeColorworkProject(project).state));
      print({ ...describeProject(project, false), plan: { before, after } });
      return 0;
    }
    case 'undo':
    case 'redo': {
      const path = positional(parsed, 0, 'project file');
      const project = await readProject(path);
      const next = parsed.command === 'undo' ? undoProjectEdit(project) : redoProjectEdit(project);
      await writeProject(parsed.out ?? path, next);
      print(describeProject(next, false));
      return 0;
    }
    case 'render': {
      const view = parsed.options.get('--view') as RenderView | undefined;
      if (view === undefined || !(RENDER_VIEWS as readonly string[]).includes(view)) throw new UsageError(`render requires --view ${RENDER_VIEWS.join('|')}.`);
      if (parsed.out === null) throw new UsageError('render requires -o <file.png>.');
      const project = await readProject(positional(parsed, 0, 'project file'));
      const { state } = materializeColorworkProject(project);
      const rendered = renderView(view, state, view === 'chart' ? null : await runAuthoredPipeline(project));
      await writeFile(parsed.out, encodePng(rendered.image));
      print({ view, file: parsed.out, width: rendered.image.width, height: rendered.image.height, legend: rendered.legend });
      return 0;
    }
    case 'compile':
    case 'export': {
      const project = await readProject(positional(parsed, 0, 'project file'));
      if (parsed.command === 'export' && parsed.out === null) throw new UsageError('export requires -o <file.kc>.');
      const { result, findings, readiness } = await evaluate(project);
      const exported = parsed.command === 'export' && result.exportReady && result.kcode !== null;
      if (exported) await writeFile(parsed.out!, result.kcode!.kcText);
      print({
        project: { id: project.id, title: project.title, revision: result.compiled?.revision ?? null },
        verdict: result.verdict,
        exportReady: result.exportReady,
        readiness,
        ...(parsed.command === 'export' ? { exported: exported ? parsed.out : null } : {}),
        compileError: result.compileError,
        outputError: result.outputError,
        frame: result.compiled?.frame ?? null,
        carrierRequirements: carrierRequirements(project, result),
        stats: result.compiled ? { ...result.compiled.stats, emittedPasses: result.kcode?.passCount ?? null } : null,
        hashes: { compileInput: result.compiled?.inputHash ?? null, kcodeSha256: result.kcode?.kcHash ?? null },
        findingCount: findings.length,
        findings: findings.slice(0, MAX_FINDINGS),
      });
      return result.exportReady ? 0 : 1;
    }
    default:
      throw new UsageError(`Unknown command: ${parsed.command}`);
  }
}

main().then((code) => { process.exitCode = code; }, (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  print({
    kind: 'kniterate-studio-cli-error',
    schemaVersion: 1,
    error: { kind: error instanceof UsageError ? 'usage' : 'input-or-io', message },
    ...(error instanceof UsageError ? { usage: USAGE } : {}),
  });
  process.exitCode = 2;
});
