#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';

import {
  ProjectEditSchema,
  appendProjectEdit,
  appendProjectOperation,
  createColorworkProjectV1,
  materializeColorworkProject,
  redoProjectEdit,
  serializeColorworkProjectV1,
  undoProjectEdit,
  type ColorworkProjectV1,
  type ProjectEdit,
  type ProjectPlacement,
} from '../packages/project-contract/src/index.ts';
import type { ColorworkChartV1 } from '../packages/chart-contract/src/index.ts';
import { runAuthoredPipeline, type AuthoredPipelineResult } from '../apps/studio/src/authoredPipeline.ts';
import { openStudioProjectJson } from '../apps/studio/src/chart/projectFile.ts';
import { explain } from '../apps/studio/src/explain.ts';
import { imageToChart, type ImageChartSize } from '../apps/studio/src/imageChart.ts';
import { convertPlacementImage, defaultPlacementColors, nextPlacementId, refreshedPlacement } from '../apps/studio/src/placements.ts';
import { planProject, type ProjectPlan } from '../apps/studio/src/plan.ts';
import { carrierRequirements, constructionLine, handoffFiles, instructionsMarkdown, readinessStory, type MeasurementRecord } from '../apps/studio/src/handoff.ts';
import { parseMeasurementRecord, trialRevision } from '../apps/studio/src/trials.ts';
import { beanieFitEdits, createBeanieProject, fitChangeLabel, type BeanieFitChange } from '../apps/studio/src/beanie.ts';
import { collectFindings, resolveReadiness, type Finding, type Readiness } from '../apps/studio/src/readiness.ts';
import { decodePng, encodePng } from './lib/png.ts';
import { RENDER_VIEWS, renderView, type RenderView } from './lib/render.ts';

const USAGE = `Usage: pnpm --silent studio -- <command> [args]

Every command prints JSON. Exit 0 = ok / export-ready, 1 = blocked, 2 = usage or read error.

  new <chart.json|project.json> -o <project.json> [--id <id>]
  new --width <st> --height <rows> [--palette "Name=#RRGGBB,..."] [--title <t>] -o <project.json>
      Start a project from a ColorworkChartV1 file, an existing project, or a blank chart.
  new --object beanie [--head-cm X [--ease E]] [--body-cm X] [--gauge <st>,<rows>] [--color "Name=#RRGGBB"]
      [--cuff-cm X --rib-gauge <st>,<rows> [--fold] [--accent "Name=#RRGGBB"] [--backing fairisle|birdseye]] -o <project.json>
      Flat beanie, seamed afterwards (Customist's construction). Without --cuff-cm it is all 2x2 rib:
      the chart is the rib body (width = needles, height = rib rows) and --gauge is the rib gauge; with
      no sizing it is Kniterate's reference hat (194 x 102, Customist's own crown). With --cuff-cm it is a
      rib cuff (rows from --rib-gauge, doubled with --fold) under a jersey colorwork body: --gauge is the
      body's colorwork gauge, the chart's bottom rows are the cuff, and --accent adds a second yarn on C4.
      --head-cm sets the finished circumference target (head x (1 + ease), ease default -0.10) and
      --body-cm the body length; the plan's own fixes then size the chart. Widths 60-244 needles.
  fit <project.json> [--head-cm X] [--ease E] [--body-cm X] [--cuff-cm X] [--fold|--no-fold]
        [--gauge <st>,<rows>] [--rib-gauge <st>,<rows>] [--gauge-source measured|assumed] [--backing fairisle|birdseye]
      Change a beanie's fit, cuff, body height, gauges or backing as one undoable operation. The plan's
      own fixes set the needle and row counts; motifs stay centred above the cuff.
  package <project.json> -o <directory>
      Write the handoff package: the editable project, program.k and program.kc, instructions.md (with
      readiness and unresolved checks), schematic.svg, chart.png, measurement-form.md, measurements.json
      and manifest.json (every file's SHA-256). Exit 1 when no program can be exported.
  measure <project.json> <measurements.json>
      Record measurements returned from knitting one exact candidate (the package's measurements.json,
      filled in; set "synthetic": true for made-up test values). The gauges become measured, the plan
      re-sizes the project in one undoable operation, and the measured candidate's files are untouched.
  place <project.json> (<motif.json> | --image <png> --height-cm X [--colors K]) [--id <id>]
        [--x center|<stitches from left>] [--above-cuff <rows>] [--map "1=accent,..."]
  place <project.json> --refresh <id>
      Place a motif as intent: it stays centred (or at its column) and its rows above the cuff when the
      piece is resized, and a motif that no longer fits is a conflict, not a clipped motif. With
      --image the PNG is converted at the project's body gauge and stored in the project; --refresh
      re-converts it after the gauge changes. Motif color 0 is transparent; color k paints palette
      entry k unless --map names another.
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
      Write the validated .kc only when the verdict allows export (the Studio Export gate), plus
      <file>-instructions.md with the finishing steps.
  render <project.json> --view ${RENDER_VIEWS.join('|')} -o <file.png>
      Draw the chart (gauge-true proportions), the projected back face, or a per-pass heat map.
  explain <term|rule>
      Plain-language meaning of a design term, plan rule, or validator rule.
  schema
      JSON Schema for <edit>.`;

const MAX_FINDINGS = 200;

class UsageError extends Error {}

const VALUE_OPTIONS = ['--gauge-source', '--backing', '--image', '--refresh', '--object', '--color', '--accent', '--cuff-cm', '--rib-gauge', '--x', '--above-cuff', '--map', '--body-cm', '--head-cm', '--ease', '--view', '--width', '--height', '--palette', '--title', '--gauge', '--colors', '--pooling', '--width-st', '--height-rows', '--width-cm', '--height-cm'] as const;

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
    else if (argument === '--fold') parsed.options.set('--fold', 'true');
    else if (argument === '--no-fold') parsed.options.set('--fold', 'false');
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

function gaugeOption(parsed: Parsed, name = '--gauge'): { stitchesPer10cm: number; rowsPer10cm: number } | null {
  const raw = parsed.options.get(name);
  if (raw === undefined) return null;
  const [stitches, rows] = raw.split(',').map(Number);
  if (!(stitches! > 0) || !(rows! > 0)) throw new UsageError(`${name} must be <stitches>,<rows> per 10 cm, e.g. 26,34.`);
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
/** The plan for a project at its cursor, including how its placements resolved. */
function planOf(project: ColorworkProjectV1): ProjectPlan {
  const { state, placements } = materializeColorworkProject(project);
  return planProject(state, placements);
}

interface Evaluated {
  plan: ProjectPlan;
  result: AuthoredPipelineResult;
  findings: Finding[];
  readiness: Readiness;
}

async function evaluate(project: ColorworkProjectV1): Promise<Evaluated> {
  const plan = planOf(project);
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
    plan.piece === 'beanie'
      ? `Beanie: ${constructionLine(plan)}; frame ${result.compiled?.frame?.preset ?? 'not compiled'}`
      : `Panel: ${plan.stitches.value} st × ${plan.rows.value} rows on needles ${plan.needles.first}–${plan.needles.last}; backing ${plan.backing.technique} (float limit ${plan.backing.floatLimit})`,
    plan.gauge === null ? 'Gauge: none recorded (sizes in cm are unknown)'
      : `Gauge: ${plan.gauge.stitchesPer10cm} st / ${plan.gauge.rowsPer10cm} rows per 10 cm (${plan.gauge.source}) → predicted ${plan.piece === 'beanie' ? 'finished circumference ' : ''}${plan.predicted!.widthCm.value} × ${plan.piece === 'beanie' ? 'body ' : ''}${plan.predicted!.heightCm.value} cm`,
  ];
  if (plan.target !== null) {
    lines.push(`Target: ${plan.sizeChecks.length === 0 ? 'set, but not checkable without a gauge' : plan.sizeChecks.map((check) => `${check.dimension} ${check.targetCm} cm needs ${check.required.value}, has ${check.actual} ${check.ok ? '✓' : '✗'}`).join('; ')}`);
  }
  lines.push(`Yarns: ${plan.yarns.map((yarn) => `${yarn.paletteId} ${yarn.hex} "${yarn.yarnName ?? yarn.name}" → ${yarn.carrier === null ? 'UNASSIGNED' : `C${yarn.carrier}`}`).join('; ')}`);
  lines.push(`Verdict: ${result.verdict.label}${result.kcode ? `; ${result.kcode.passCount} passes` : ''}; estimated knit time ${formatMinutes(result.compiled?.stats.estimatedKnitTimeSeconds)}`);
  const story = readinessStory(plan, evaluated.findings, readiness, result.verdict, materializeColorworkProject(project).state.trials ?? []);
  lines.push(`Status: ${story.headline}. ${story.detail}`, `Evidence: ${story.evidence}`);
  for (const item of story.items) lines.push(`  ${item.part}: ${item.consequence} Next: ${item.action}`);
  for (const notice of story.notices) lines.push(`Notice: ${notice}`);
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

function colorOption(raw: string, flag: string): { name: string; hex: string } {
  const [name, hex] = raw.split('=').map((part) => part.trim());
  if (!name || !hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) throw new UsageError(`${flag} must be Name=#RRGGBB.`);
  return { name, hex: hex.toUpperCase() };
}

/** A beanie project: reference size, then the plan's own resize fixes for any requested size. */
function newBeanie(parsed: Parsed): ColorworkProjectV1 {
  const gauge = gaugeOption(parsed);
  const ribGauge = gaugeOption(parsed, '--rib-gauge');
  const headCm = numberOption(parsed, '--head-cm');
  const bodyCm = numberOption(parsed, '--body-cm');
  const cuffCm = numberOption(parsed, '--cuff-cm');
  const fold = parsed.options.has('--fold');
  if ((headCm !== null || bodyCm !== null) && gauge === null) throw new UsageError('--head-cm and --body-cm need --gauge <st>,<rows>.');
  if (cuffCm !== null && ribGauge === null) throw new UsageError('--cuff-cm needs --rib-gauge <st>,<rows> measured on 2x2 rib.');
  if (fold && cuffCm === null) throw new UsageError('--fold needs --cuff-cm.');
  const easeRaw = parsed.options.get('--ease');
  const ease = easeRaw === undefined ? -0.1 : Number(easeRaw);
  if (!Number.isFinite(ease) || ease <= -0.5 || ease >= 0.5) throw new UsageError('--ease must be a fraction between -0.5 and 0.5, e.g. -0.1.');
  const main = colorOption(parsed.options.get('--color') ?? 'Main=#2B2B2B', '--color');
  const accent = parsed.options.has('--accent') ? colorOption(parsed.options.get('--accent')!, '--accent') : null;
  if (accent !== null && cuffCm === null) throw new UsageError('--accent needs a colorwork body: add --cuff-cm (the all-rib beanie knits one yarn).');
  const backing = parsed.options.get('--backing') ?? 'fairisle';
  if (backing !== 'fairisle' && backing !== 'birdseye') throw new UsageError('--backing must be fairisle or birdseye.');
  try {
    return createBeanieProject({
      title: parsed.options.get('--title') ?? 'Beanie',
      ...(headCm !== null ? { headCircumferenceCm: headCm, ease } : {}),
      ...(bodyCm !== null ? { bodyCm } : {}),
      ...(gauge !== null ? { bodyGauge: { ...gauge, source: 'measured' as const } } : {}),
      ...(cuffCm !== null ? { cuffCm, ribGauge: { ...ribGauge!, source: 'measured' as const }, fold } : {}),
      main,
      ...(accent ? { accent } : {}),
      backing,
    }, { id: newId(), source: parsed.source, group: `new-${randomUUID()}` });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

/** Reads the motif for `place`: a ColorworkChartV1 file, or a PNG converted at the project's body gauge (kept as the placement's source). */
async function placementMotif(parsed: Parsed, gauge: { stitchesPer10cm: number; rowsPer10cm: number } | null): Promise<{ motif: ColorworkChartV1; source?: ProjectPlacement['source'] }> {
  const image = parsed.options.get('--image');
  if (image === undefined) return { motif: JSON.parse(await readFile(positional(parsed, 1, 'motif chart or --image <png>'), 'utf8')) as ColorworkChartV1 };
  if (gauge === null) throw new UsageError('--image needs the project to have a gauge (set-gauge) to size the motif in cm.');
  const heightCm = numberOption(parsed, '--height-cm');
  if (heightCm === null) throw new UsageError('--image needs --height-cm.');
  const bytes = await readFile(image);
  const pooling = parsed.options.get('--pooling') ?? 'mean';
  if (pooling !== 'mean' && pooling !== 'mode') throw new UsageError('--pooling must be mean or mode.');
  const colors = integerOption(parsed, '--colors') ?? 2;
  return convertPlacementImage({ pixels: decodePng(bytes), bytesBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') }, { heightCm, colors, pooling }, gauge);
}

/** A placement edit: a motif anchored centred (or at a column) a number of rows above the cuff. */
async function placementEdit(parsed: Parsed, project: ColorworkProjectV1): Promise<ProjectEdit> {
  const { state } = materializeColorworkProject(project);
  const refresh = parsed.options.get('--refresh');
  if (refresh !== undefined) {
    // Re-convert a placement from its stored image at the current gauge; its anchor and colors stay.
    const existing = (state.placements ?? []).find((item) => item.id === refresh);
    if (existing === undefined) throw new UsageError(`no placement "${refresh}".`);
    if (existing.source === undefined) throw new UsageError(`placement "${refresh}" has no stored image to re-convert.`);
    if (!state.gauge) throw new UsageError('--refresh needs the project gauge.');
    return { kind: 'set-placement', placement: refreshedPlacement(existing, decodePng(Buffer.from(existing.source.bytesBase64, 'base64')), state.gauge) };
  }
  const { motif, source } = await placementMotif(parsed, state.gauge ?? null);
  const xRaw = parsed.options.get('--x') ?? 'center';
  const x = xRaw === 'center' ? 'center' as const : Number(xRaw);
  if (x !== 'center' && (!Number.isInteger(x) || x < 0)) throw new UsageError('--x must be center or a whole number of stitches from the left.');
  const above = parsed.options.has('--above-cuff') ? Number(parsed.options.get('--above-cuff')) : 2;
  if (!Number.isInteger(above) || above < 0) throw new UsageError('--above-cuff must be a whole number of rows.');
  const colors = defaultPlacementColors(state, motif);
  for (const pair of (parsed.options.get('--map') ?? '').split(',').filter(Boolean)) {
    const [from, to] = pair.split('=');
    if (!state.chart.palette.some((entry) => entry.id === to)) throw new UsageError(`--map target "${to}" is not a palette id (${state.chart.palette.map((entry) => entry.id).join(', ')}).`);
    colors[String(Number(from))] = to!;
  }
  const id = parsed.id ?? nextPlacementId(state);
  return { kind: 'set-placement', placement: { id, motif, x, rowsAboveCuff: above, colors, ...(source ? { source } : {}) } };
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
      let project = parsed.options.get('--object') === 'beanie'
        ? newBeanie(parsed)
        : parsed.options.has('--object') ? (() => { throw new UsageError('--object supports only beanie.'); })()
        : parsed.positionals.length > 0
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
      print(planOf(await readProject(positional(parsed, 0, 'project file'))));
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
      const before = planSnapshot(planOf(project));
      for (const edit of await readEdits(positional(parsed, 1, 'edit'))) {
        project = appendProjectEdit(project, { id: `cli-${randomUUID()}`, source: parsed.source, edit });
      }
      await writeProject(parsed.out ?? path, project);
      const after = planSnapshot(planOf(project));
      print({ ...describeProject(project, false), plan: { before, after } });
      return 0;
    }
    case 'fit': {
      const path = positional(parsed, 0, 'project file');
      let project = await readProject(path);
      const source = parsed.options.get('--gauge-source') ?? 'measured';
      if (source !== 'measured' && source !== 'assumed') throw new UsageError('--gauge-source must be measured or assumed.');
      const gauge = gaugeOption(parsed);
      const ribGauge = gaugeOption(parsed, '--rib-gauge');
      const easeRaw = parsed.options.get('--ease');
      const ease = easeRaw === undefined ? undefined : Number(easeRaw);
      if (ease !== undefined && (!Number.isFinite(ease) || ease <= -0.5 || ease >= 0.5)) throw new UsageError('--ease must be a fraction between -0.5 and 0.5, e.g. -0.1.');
      const backing = parsed.options.get('--backing');
      if (backing !== undefined && backing !== 'fairisle' && backing !== 'birdseye') throw new UsageError('--backing must be fairisle or birdseye.');
      const change: BeanieFitChange = {
        ...(numberOption(parsed, '--head-cm') !== null ? { headCircumferenceCm: numberOption(parsed, '--head-cm')! } : {}),
        ...(ease !== undefined ? { ease } : {}),
        ...(numberOption(parsed, '--body-cm') !== null ? { bodyCm: numberOption(parsed, '--body-cm')! } : {}),
        ...(numberOption(parsed, '--cuff-cm') !== null ? { cuffCm: numberOption(parsed, '--cuff-cm')! } : {}),
        ...(parsed.options.has('--fold') ? { fold: parsed.options.get('--fold') === 'true' } : {}),
        ...(gauge !== null ? { bodyGauge: { ...gauge, source } } : {}),
        ...(ribGauge !== null ? { ribGauge: { ...ribGauge, source } } : {}),
        ...(backing !== undefined ? { backing } : {}),
      };
      let edits: ProjectEdit[];
      try { edits = beanieFitEdits(project, change); } catch (error) { throw new UsageError(error instanceof Error ? error.message : String(error)); }
      const before = planSnapshot(planOf(project));
      if (edits.length > 0) project = appendProjectOperation(project, { group: `fit-${randomUUID()}`, source: parsed.source, label: fitChangeLabel(change), edits });
      await writeProject(parsed.out ?? path, project);
      print({ changed: Object.keys(change), edits: edits.length, before, after: planSnapshot(planOf(project)) });
      return 0;
    }
    case 'place': {
      const path = positional(parsed, 0, 'project file');
      let project = await readProject(path);
      const edit = await placementEdit(parsed, project);
      project = appendProjectEdit(project, { id: `cli-${randomUUID()}`, source: parsed.source, edit });
      await writeProject(parsed.out ?? path, project);
      const resolved = materializeColorworkProject(project).placements.find((item) => edit.kind === 'set-placement' && item.placement.id === edit.placement.id)!;
      print({
        placement: { id: resolved.placement.id, status: resolved.status, at: resolved.at, reason: resolved.reason ?? null, width: resolved.placement.motif.width, height: resolved.placement.motif.height, x: resolved.placement.x, rowsAboveCuff: resolved.placement.rowsAboveCuff, colors: resolved.placement.colors },
        plan: planSnapshot(planOf(project)),
      });
      return resolved.status === 'placed' ? 0 : 1;
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
    case 'package': {
      const project = await readProject(positional(parsed, 0, 'project file'));
      if (parsed.out === null) throw new UsageError('package requires -o <directory>.');
      const { plan, result, findings, readiness } = await evaluate(project);
      if (!result.exportReady) {
        print({ packaged: null, verdict: result.verdict, readiness, findings: findings.slice(0, MAX_FINDINGS) });
        return 1;
      }
      const { state } = materializeColorworkProject(project);
      const files = await handoffFiles({
        project, serializedProject: serializeColorworkProjectV1(project), plan, result, findings, readiness,
        extra: { 'chart.png': encodePng(renderView('chart', state, null).image) },
        sha256: async (bytes) => createHash('sha256').update(bytes).digest('hex'),
      });
      await mkdir(parsed.out, { recursive: true });
      for (const [name, bytes] of Object.entries(files)) await writeFile(resolvePath(parsed.out, name), bytes);
      print({ packaged: parsed.out, files: Object.keys(files), kcodeSha256: result.kcode!.kcHash, readiness: { ready: readiness.ready, headline: readinessStory(plan, findings, readiness, result.verdict, state.trials ?? []).headline } });
      return 0;
    }
    case 'measure': {
      const path = positional(parsed, 0, 'project file');
      let project = await readProject(path);
      let record: MeasurementRecord;
      try { record = parseMeasurementRecord(JSON.parse(await readFile(positional(parsed, 1, 'measurements.json'), 'utf8'))); } catch (error) { throw new UsageError(error instanceof Error ? error.message : String(error)); }
      const pixels = new Map((materializeColorworkProject(project).state.placements ?? []).flatMap((placement) => placement.source ? [[placement.id, decodePng(Buffer.from(placement.source.bytesBase64, 'base64'))] as const] : []));
      const revision = trialRevision(project, record, { id: `trial-${randomUUID().slice(0, 8)}`, recordedAt: new Date().toISOString(), pixels });
      const before = planSnapshot(planOf(project));
      project = appendProjectOperation(project, { group: `measure-${randomUUID()}`, source: parsed.source, label: `Record ${record.synthetic ? 'SYNTHETIC ' : ''}measurements of candidate ${record.candidate.kcodeSha256.slice(0, 12)} and revise`, edits: revision.edits });
      await writeProject(parsed.out ?? path, project);
      print({ trial: revision.trial.id, synthetic: record.synthetic, candidate: record.candidate.kcodeSha256, comparisonBasis: revision.comparisonBasis, comparisons: revision.comparisons, changes: revision.changes, before, after: planSnapshot(planOf(project)) });
      return 0;
    }
    case 'compile':
    case 'export': {
      const project = await readProject(positional(parsed, 0, 'project file'));
      if (parsed.command === 'export' && parsed.out === null) throw new UsageError('export requires -o <file.kc>.');
      const { result, findings, readiness } = await evaluate(project);
      const exported = parsed.command === 'export' && result.exportReady && result.kcode !== null;
      if (exported) {
        await writeFile(parsed.out!, result.kcode!.kcText);
        await writeFile(parsed.out!.replace(/\.kc$/, '') + '-instructions.md', instructionsMarkdown(project, planOf(project), result, findings, readiness));
      }
      print({
        project: { id: project.id, title: project.title, revision: result.compiled?.revision ?? null },
        verdict: result.verdict,
        exportReady: result.exportReady,
        readiness,
        ...(parsed.command === 'export' ? { exported: exported ? parsed.out : null } : {}),
        compileError: result.compileError,
        outputError: result.outputError,
        frame: result.compiled?.frame ?? null,
        carrierRequirements: carrierRequirements(materializeColorworkProject(project).state, result),
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
