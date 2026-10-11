import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';

import {
  appendProjectOperation,
  materializeColorworkProject,
  serializeColorworkProjectV1,
  sweaterObjectOf,
  type ColorworkProjectV1,
  type ProjectEdit,
  type SweaterObject,
} from '../../packages/project-contract/src/index.ts';
import { FITS, SIZES, defaultMeasurements, edgeProblem, type Fit, type Measurements, type ShapePoint, type Size } from '../../apps/studio/src/sweater/draft.ts';
import { SWEATER_CHOICES, createSweaterProject, planSweater, type SweaterIntent, type SweaterPlan } from '../../apps/studio/src/sweater/sweater.ts';
import { runSweaterPipeline } from '../../apps/studio/src/sweater/sweaterPipeline.ts';
import { pieceSteps, sweaterInstructions, sweaterPackageFiles } from '../../apps/studio/src/sweater/sweaterHandoff.ts';
import { summarizeSweaterRun } from '../../apps/studio/src/sweater/sweaterRun.ts';
import { sweaterSchematicSvg } from '../../apps/studio/src/sweater/schematic.ts';
import { RIBS, TEXTURES, textureById, textureMatching, textureProblem } from '../../apps/studio/src/sweater/textures.ts';

export const SWEATER_USAGE = `Sweaters (flat pieces, sewn): pnpm --silent studio -- sweater <command> [args]

  sweater choices
      Silhouettes, necklines, sizes, fits, stitches (textures) and ribs, with what each is for.
  sweater new -o <project.json> [--title T] [--silhouette set-in|j-sleeve|drop-shoulder] [--neck crew|boat]
        [--size XS|S|M|L|XL|XXL] [--fit fitted|classic|relaxed|oversized] [--stitch <id> | --texture "pk/kp"]
        [--yarn "Name=#RRGGBB"] [--gauge <st>,<rows>] [--rib-gauge <st>,<rows>] [--gauge-source measured|assumed]
        [--hem-rib kp|kkpp|kkkp|kkkpp] [--measure chest=112,length=66,...]
      A sweater from a standard size and fit; --measure overrides finished measurements (cm). Without
      --gauge the stitch's typical gauge is used and marked assumed (sizes are then a guess).
  sweater plan <project.json>
      Every piece: stitches, rows, size in cm and its shaping as pattern steps; each measurement wanted
      vs. as knitted; seam checks and findings. Pure: no machine compile.
  sweater set <project.json> [any option of new] [--top bind-off|waste] [--fashion 1|2|3]
        [--hem-cm X] [--cuff-cm X] [--neck-cm X] [--cuff-rib R] [--neck-rib R] [-o <out.json>]
      Change the design as one undoable operation; prints the knitted measurements before and after.
      --size/--fit replace every measurement with that size's; --measure changes just those named.
  sweater shape <project.json> [--body "<points>"] [--sleeve "<points>"] [--reset body|sleeve|all] [-o <out.json>]
      Shape the pieces by hand, like a garment-shaping knitting machine: each edge is key points from the
      bottom up, "width,height[,underarm][,concave|convex]" in cm, the width being the piece's full width
      at that height. The body edge (side seam, armhole, shoulder point) is shared by front and back; the
      sleeve edge runs from the cuff to the top's outer corner. Exactly one point is the underarm (where
      the armhole or sleeve cap starts); curves describe how the edge arrives at a point. "plan" prints
      the current points. The measurements that drew a hand-shaped edge no longer change it; --reset
      returns it to them.
  sweater check <project.json>
      Compile every piece to KCode and check it exactly as Studio does. Exit 0 when ready, 1 when not.
  sweater package <project.json> -o <directory>
      Write every piece's .kc and .k, instructions.md, schematic.svg, project.json and manifest.json.
      Exit 1 (nothing written) unless every piece exports.
  sweater pattern <project.json> [-o <file.md>]
      The written pattern: pieces in rows and stitches, and the assembly.
  sweater schematic <project.json> -o <file.svg>

Measurement keys: chest length sleeveLength upperArm cuff armholeDepth shoulderWidth neckWidth
frontNeckDepth backNeckDepth shoulderDrop. Textures are rows top first, separated by "/":
k knit, p purl, t/u tuck on the front/back bed, s slip.`;

export class SweaterUsageError extends Error {}

interface SweaterArgs { command: string | null; positionals: string[]; out: string | null; options: Map<string, string> }

const OPTIONS = ['--body', '--sleeve', '--reset', '--title', '--silhouette', '--neck', '--size', '--fit', '--stitch', '--texture', '--yarn', '--gauge', '--rib-gauge', '--gauge-source', '--hem-rib', '--cuff-rib', '--neck-rib', '--hem-cm', '--cuff-cm', '--neck-cm', '--measure', '--top', '--fashion', '--source'];

function parse(args: readonly string[]): SweaterArgs {
  const parsed: SweaterArgs = { command: null, positionals: [], out: null, options: new Map() };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    const value = () => {
      const next = args[index + 1];
      if (next === undefined) throw new SweaterUsageError(`${argument} requires a value.`);
      index++;
      return next;
    };
    if (argument === '--') continue;
    if (argument === '-o' || argument === '--out') parsed.out = value();
    else if (OPTIONS.includes(argument)) parsed.options.set(argument, value());
    else if (argument.startsWith('-')) throw new SweaterUsageError(`Unsupported sweater option: ${argument}`);
    else if (parsed.command === null) parsed.command = argument;
    else parsed.positionals.push(argument);
  }
  return parsed;
}

const MEASUREMENT_KEYS: readonly (keyof Measurements)[] = ['chest', 'length', 'sleeveLength', 'upperArm', 'cuff', 'armholeDepth', 'shoulderWidth', 'neckWidth', 'frontNeckDepth', 'backNeckDepth', 'shoulderDrop'];

function choice<T extends string>(parsed: SweaterArgs, name: string, values: readonly T[]): T | null {
  const raw = parsed.options.get(name);
  if (raw === undefined) return null;
  if (!(values as readonly string[]).includes(raw)) throw new SweaterUsageError(`${name} must be one of ${values.join(', ')}; got "${raw}".`);
  return raw as T;
}

function gauge(parsed: SweaterArgs, name: string): { stitchesPer10cm: number; rowsPer10cm: number } | null {
  const raw = parsed.options.get(name);
  if (raw === undefined) return null;
  const [stitches, rows] = raw.split(',').map(Number);
  if (!(stitches! > 0) || !(rows! > 0)) throw new SweaterUsageError(`${name} must be <stitches>,<rows> per 10 cm, e.g. 26,34.`);
  return { stitchesPer10cm: stitches!, rowsPer10cm: rows! };
}

function positiveNumber(parsed: SweaterArgs, name: string, min = 0): number | null {
  const raw = parsed.options.get(name);
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) throw new SweaterUsageError(`${name} must be a number of at least ${min}.`);
  return value;
}

function measurements(parsed: SweaterArgs): Partial<Measurements> {
  const raw = parsed.options.get('--measure');
  if (raw === undefined) return {};
  const out: Partial<Measurements> = {};
  for (const pair of raw.split(',')) {
    const [key, value] = pair.split('=').map((part) => part.trim());
    if (!MEASUREMENT_KEYS.includes(key as keyof Measurements)) throw new SweaterUsageError(`--measure key "${key}" is not one of ${MEASUREMENT_KEYS.join(', ')}.`);
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new SweaterUsageError(`--measure ${key} must be a number of cm.`);
    out[key as keyof Measurements] = number;
  }
  return out;
}

function texture(parsed: SweaterArgs): { name: string; rows: string[] } | null {
  const id = parsed.options.get('--stitch');
  const rows = parsed.options.get('--texture');
  if (id !== undefined && rows !== undefined) throw new SweaterUsageError('Give --stitch or --texture, not both.');
  if (id !== undefined) {
    const found = textureById(id);
    if (!found) throw new SweaterUsageError(`--stitch "${id}" is not one of ${TEXTURES.map((item) => item.id).join(', ')}.`);
    return { name: found.name, rows: [...found.rows] };
  }
  if (rows !== undefined) {
    const lines = rows.split('/').map((line) => line.trim());
    const problem = textureProblem(lines);
    if (problem) throw new SweaterUsageError(`--texture: ${problem}`);
    return { name: textureMatching(lines)?.name ?? 'Custom stitch', rows: lines };
  }
  return null;
}

function rib(parsed: SweaterArgs, name: string): string | null {
  const raw = parsed.options.get(name);
  if (raw === undefined) return null;
  if (!/^[kp]{2,12}$/.test(raw) || !raw.includes('k') || !raw.includes('p')) throw new SweaterUsageError(`${name} is a rib row of k and p, e.g. ${RIBS.map((item) => item.rib).join(', ')}.`);
  return raw;
}

function yarn(parsed: SweaterArgs): { name: string; hex: string } | null {
  const raw = parsed.options.get('--yarn');
  if (raw === undefined) return null;
  const [name, hex] = raw.split('=').map((part) => part.trim());
  if (!name || !hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) throw new SweaterUsageError('--yarn must be Name=#RRGGBB.');
  return { name, hex: hex.toUpperCase() };
}

function sourceOf(parsed: SweaterArgs): 'human' | 'assistant' {
  const raw = parsed.options.get('--source') ?? 'assistant';
  if (raw !== 'human' && raw !== 'assistant') throw new SweaterUsageError('--source must be human or assistant.');
  return raw;
}

/** An edge as the CLI writes it: full width and height in cm, then flags. */
function formatEdge(edge: readonly ShapePoint[]): string {
  return edge.map((point) => [Math.round(point.x * 20) / 10, Math.round(point.y * 10) / 10, ...(point.underarm ? ['underarm'] : []), ...(point.curve ? [point.curve] : [])].join(',')).join(' ');
}

function parseEdge(text: string, kind: 'body' | 'sleeve'): ShapePoint[] {
  const points = text.trim().split(/\s+/).map((token, index) => {
    const [width, height, ...flags] = token.split(',');
    const x = Number(width) / 2;
    const y = Number(height);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new SweaterUsageError(`--${kind} point ${index + 1} ("${token}") needs width,height in cm.`);
    const point: ShapePoint = { x, y };
    for (const flag of flags) {
      if (flag === 'underarm') point.underarm = true;
      else if (flag === 'concave' || flag === 'convex') point.curve = flag;
      else throw new SweaterUsageError(`--${kind} point ${index + 1}: "${flag}" is not underarm, concave or convex.`);
    }
    return point;
  });
  const problem = edgeProblem(points, kind);
  if (problem) throw new SweaterUsageError(`--${kind}: ${problem}`);
  return points;
}

/** The plan as an agent reads it: pieces, measurements, seams and findings. */
export function sweaterPlanJson(project: ColorworkProjectV1, plan: SweaterPlan) {
  const { state } = materializeColorworkProject(project);
  const object = plan.object;
  return {
    kind: 'kniterate-studio-sweater-plan',
    project: { id: project.id, title: project.title, edit: project.history.cursor },
    design: {
      silhouette: object.silhouette,
      neckline: object.neckline,
      size: object.size ?? 'custom',
      stitch: { name: object.body.name, texture: object.body.texture },
      trims: object.trims,
      top: object.top ?? 'bind-off',
      fashion: object.fashion ?? 1,
      yarn: { ...state.chart.palette[0], carrier: plan.carriers.main },
    },
    gauge: { body: plan.gauge, rib: plan.ribGauge },
    measurements: MEASUREMENT_KEYS.filter((key) => object.measurements[key] !== undefined).map((key) => ({ key, wantedCm: object.measurements[key], knittedCm: plan.knitted[key] ?? null, ...(plan.custom.body && ['chest', 'length', 'armholeDepth', 'shoulderWidth'].includes(key) || plan.custom.sleeve && ['sleeveLength', 'upperArm', 'cuff'].includes(key) ? { setBy: 'shape' } : {}) })),
    shapes: Object.fromEntries((['body', 'sleeve'] as const).map((kind) => [kind, { custom: plan.custom[kind], points: formatEdge(plan.draft.edges[kind]) }])),
    carriers: plan.carriers,
    pieces: plan.pieces.map((piece) => ({
      id: piece.id,
      name: piece.name,
      copies: piece.copies,
      castOnStitches: piece.raster?.realized.castOnStitches ?? null,
      widestStitches: piece.raster?.realized.widestStitches ?? null,
      rows: piece.raster?.rows.length ?? null,
      widthCm: piece.raster?.realized.widthCm ?? null,
      heightCm: piece.raster?.realized.heightCm ?? null,
      steps: pieceSteps(piece, plan),
      error: piece.error,
    })),
    seams: plan.realized,
    derived: plan.draft.derived,
    findings: plan.findings,
  };
}

function snapshot(plan: SweaterPlan) {
  return { knitted: plan.knitted, pieces: Object.fromEntries(plan.pieces.map((piece) => [piece.id, piece.raster ? `${piece.raster.realized.castOnStitches} st × ${piece.raster.rows.length} rows` : piece.error])), findings: plan.findings.map(({ rule, severity, piece }) => ({ rule, severity, piece })) };
}

export interface SweaterCliIo {
  print: (value: unknown) => void;
  readProject: (path: string) => Promise<ColorworkProjectV1>;
  writeProject: (path: string, project: ColorworkProjectV1) => Promise<void>;
  newId: () => string;
}

function planFor(project: ColorworkProjectV1): SweaterPlan {
  const { state } = materializeColorworkProject(project);
  if (sweaterObjectOf(state) === undefined) throw new SweaterUsageError('This project is not a sweater.');
  return planSweater(state);
}

async function check(project: ColorworkProjectV1, io: SweaterCliIo): Promise<number> {
  const result = await runSweaterPipeline(project);
  io.print({
    kind: 'kniterate-studio-sweater-check',
    project: { id: project.id, title: project.title, edit: project.history.cursor },
    verdict: result.verdict,
    exportReady: result.exportReady,
    readiness: result.readiness,
    pieces: result.pieces.map((piece) => ({ id: piece.id, name: piece.name, copies: piece.copies, verdict: piece.verdict.label, passes: piece.kcode?.passCount ?? null, kcodeSha256: piece.kcode?.ok ? piece.kcode.kcHash : null, error: piece.compileError ?? piece.outputError })),
    findings: result.findings,
  });
  return result.readiness.ready ? 0 : 1;
}

export async function sweaterCommand(args: readonly string[], io: SweaterCliIo): Promise<number> {
  const parsed = parse(args);
  const projectPath = () => {
    const path = parsed.positionals[0];
    if (path === undefined) throw new SweaterUsageError('Missing project file.');
    return path;
  };
  switch (parsed.command) {
    case null:
    case 'help':
      process.stdout.write(`${SWEATER_USAGE}\n`);
      return 0;
    case 'choices':
      io.print({
        silhouettes: SWEATER_CHOICES.silhouettes,
        necklines: SWEATER_CHOICES.necklines,
        sizes: SIZES,
        fits: FITS,
        stitches: TEXTURES.map(({ id, name, rows, note, gauge: typical }) => ({ id, name, texture: rows.join('/'), note, typicalGauge: typical })),
        ribs: RIBS,
      });
      return 0;
    case 'new': {
      if (parsed.out === null) throw new SweaterUsageError('sweater new requires -o <project.json>.');
      const stitch = texture(parsed);
      const body = gauge(parsed, '--gauge');
      const ribGauge = gauge(parsed, '--rib-gauge');
      const source = choice(parsed, '--gauge-source', ['measured', 'assumed'] as const) ?? 'assumed';
      const intent: SweaterIntent = {
        title: parsed.options.get('--title') ?? 'Sweater',
        silhouette: choice(parsed, '--silhouette', ['set-in', 'j-sleeve', 'drop-shoulder'] as const) ?? 'set-in',
        neckline: choice(parsed, '--neck', ['crew', 'boat'] as const) ?? 'crew',
        size: choice(parsed, '--size', SIZES) ?? 'M',
        fit: choice(parsed, '--fit', FITS) ?? 'classic',
        textureId: 'stockinette',
        yarn: yarn(parsed) ?? { name: 'Oatmeal', hex: '#D9CBB0' },
        ...(body ? { gauge: { ...body, source } } : {}),
        ...(ribGauge ? { ribGauge: { ...ribGauge, source } } : {}),
        ...(rib(parsed, '--hem-rib') ? { hemRib: rib(parsed, '--hem-rib')! } : {}),
        measurements: measurements(parsed),
      };
      let project = createSweaterProject(intent, { id: io.newId(), source: sourceOf(parsed), group: `create-${io.newId()}` });
      if (stitch) {
        const object = sweaterObjectOf(materializeColorworkProject(project).state)!;
        project = appendProjectOperation(project, { group: `stitch-${io.newId()}`, source: sourceOf(parsed), label: stitch.name, edits: [{ kind: 'set-object', object: { ...object, body: { name: stitch.name, texture: stitch.rows } } }, ...(body ? [] : [{ kind: 'set-gauge' as const, gauge: { ...(textureMatching(stitch.rows)?.gauge ?? TEXTURES[0]!.gauge), source: 'assumed' as const } }])] });
      }
      await io.writeProject(parsed.out, project);
      io.print({ created: parsed.out, ...sweaterPlanJson(project, planFor(project)) });
      return 0;
    }
    case 'plan': {
      const project = await io.readProject(projectPath());
      io.print(sweaterPlanJson(project, planFor(project)));
      return 0;
    }
    case 'set': {
      const path = projectPath();
      const project = await io.readProject(path);
      const before = planFor(project);
      const object: SweaterObject = structuredClone(before.object);
      const labels: string[] = [];
      const extra: ProjectEdit[] = [];
      const silhouette = choice(parsed, '--silhouette', ['set-in', 'j-sleeve', 'drop-shoulder'] as const);
      if (silhouette) { object.silhouette = silhouette; labels.push(silhouette); }
      const neck = choice(parsed, '--neck', ['crew', 'boat'] as const);
      if (neck) { object.neckline = neck; labels.push(`${neck} neck`); }
      const size = choice(parsed, '--size', SIZES);
      const fit = choice(parsed, '--fit', FITS);
      if (size || fit) {
        const [currentSize, currentFit] = (object.size ?? 'M classic').split(' ');
        const nextSize = (size ?? ((SIZES as readonly string[]).includes(currentSize ?? '') ? currentSize : 'M')) as Size;
        const nextFit = (fit ?? ((FITS as readonly string[]).includes(currentFit ?? '') ? currentFit : 'classic')) as Fit;
        object.size = `${nextSize} ${nextFit}`;
        object.measurements = defaultMeasurements(nextSize, nextFit, object.silhouette);
        labels.push(`size ${nextSize} ${nextFit}`);
      }
      const measured = measurements(parsed);
      if (Object.keys(measured).length > 0) { object.measurements = { ...object.measurements, ...measured }; labels.push(Object.entries(measured).map(([key, value]) => `${key} ${value} cm`).join(', ')); }
      const stitch = texture(parsed);
      if (stitch) {
        object.body = { name: stitch.name, texture: stitch.rows };
        labels.push(stitch.name);
        if (before.gauge.source === 'assumed' && !parsed.options.has('--gauge')) extra.push({ kind: 'set-gauge', gauge: { ...(textureMatching(stitch.rows)?.gauge ?? before.gauge), source: 'assumed' } });
      }
      for (const [option, key] of [['--hem-rib', 'hem'], ['--cuff-rib', 'cuff'], ['--neck-rib', 'neck']] as const) {
        const value = rib(parsed, option);
        if (value) { object.trims[key] = { ...object.trims[key], rib: value }; labels.push(`${key} rib ${value}`); }
      }
      for (const [option, key] of [['--hem-cm', 'hem'], ['--cuff-cm', 'cuff'], ['--neck-cm', 'neck']] as const) {
        const value = positiveNumber(parsed, option);
        if (value !== null) { object.trims[key] = { ...object.trims[key], cm: value }; labels.push(`${key} ${value} cm`); }
      }
      const top = choice(parsed, '--top', ['bind-off', 'waste'] as const);
      if (top) { object.top = top; labels.push(`top ${top}`); }
      const fashion = choice(parsed, '--fashion', ['1', '2', '3'] as const);
      if (fashion) { object.fashion = Number(fashion); labels.push(`fashion ${fashion}`); }
      const yarnValue = yarn(parsed);
      const source = choice(parsed, '--gauge-source', ['measured', 'assumed'] as const);
      const body = gauge(parsed, '--gauge');
      if (body || (source && !parsed.options.has('--rib-gauge'))) { extra.push({ kind: 'set-gauge', gauge: { ...(body ?? before.gauge), source: source ?? before.gauge.source } }); labels.push(`body gauge ${(body ?? before.gauge).stitchesPer10cm}/${(body ?? before.gauge).rowsPer10cm}`); }
      const ribGauge = gauge(parsed, '--rib-gauge');
      if (ribGauge || (source && parsed.options.has('--rib-gauge'))) { object.ribGauge = { ...(ribGauge ?? before.ribGauge), source: source ?? before.ribGauge.source }; labels.push('rib gauge'); }
      // A new style or size redraws the shapes: hand-shaped edges reset, as in the browser.
      if ((silhouette || size || fit) && object.shapes) { delete object.shapes; labels.push('your shapes reset'); }
      const edits: ProjectEdit[] = [];
      if (JSON.stringify(object) !== JSON.stringify(before.object)) edits.push({ kind: 'set-object', object });
      edits.push(...extra);
      if (yarnValue) {
        const { state } = materializeColorworkProject(project);
        edits.push({ kind: 'set-palette-entry', paletteId: state.chart.palette[0]!.id, name: yarnValue.name, hex: yarnValue.hex });
        edits.push({ kind: 'set-yarn-assignment', assignment: { paletteId: state.chart.palette[0]!.id, carrier: before.carriers.main as '2' | '3' | '4' | '5', yarnName: yarnValue.name } });
        labels.push(`yarn ${yarnValue.name}`);
      }
      if (edits.length === 0) throw new SweaterUsageError('sweater set changes nothing; give at least one option.');
      const label = labels.join(', ');
      const next = appendProjectOperation(project, { group: `set-${io.newId()}`, source: sourceOf(parsed), label: label[0]!.toUpperCase() + label.slice(1), edits });
      await io.writeProject(parsed.out ?? path, next);
      io.print({ changed: label, before: snapshot(before), after: snapshot(planFor(next)) });
      return 0;
    }
    case 'shape': {
      const path = projectPath();
      const project = await io.readProject(path);
      const before = planFor(project);
      const object: SweaterObject = structuredClone(before.object);
      const shapes = { ...object.shapes };
      const labels: string[] = [];
      const reset = choice(parsed, '--reset', ['body', 'sleeve', 'all'] as const);
      if (reset === 'body' || reset === 'all') { delete shapes.body; labels.push('body shape from the measurements'); }
      if (reset === 'sleeve' || reset === 'all') { delete shapes.sleeve; labels.push('sleeve shape from the measurements'); }
      for (const kind of ['body', 'sleeve'] as const) {
        const text = parsed.options.get(`--${kind}`);
        if (text !== undefined) { shapes[kind] = parseEdge(text, kind); labels.push(`${kind} shaped by hand`); }
      }
      if (labels.length === 0) throw new SweaterUsageError('sweater shape needs --body, --sleeve or --reset.');
      if (Object.keys(shapes).length > 0) object.shapes = shapes; else delete object.shapes;
      const label = labels.join(', ');
      const next = appendProjectOperation(project, { group: `shape-${io.newId()}`, source: sourceOf(parsed), label: label[0]!.toUpperCase() + label.slice(1), edits: [{ kind: 'set-object', object }] });
      await io.writeProject(parsed.out ?? path, next);
      const after = planFor(next);
      io.print({ changed: label, shapes: Object.fromEntries((['body', 'sleeve'] as const).map((kind) => [kind, { custom: after.custom[kind], points: formatEdge(after.draft.edges[kind]) }])), before: snapshot(before), after: snapshot(after) });
      return 0;
    }
    case 'check':
      return check(await io.readProject(projectPath()), io);
    case 'package': {
      const project = await io.readProject(projectPath());
      if (parsed.out === null) throw new SweaterUsageError('sweater package requires -o <directory>.');
      const result = await runSweaterPipeline(project);
      if (!result.exportReady) {
        io.print({ packaged: null, verdict: result.verdict, readiness: result.readiness, pieces: result.pieces.map((piece) => ({ id: piece.id, verdict: piece.verdict.label, error: piece.compileError ?? piece.outputError })), findings: result.findings });
        return 1;
      }
      const files = await sweaterPackageFiles({ project, serializedProject: serializeColorworkProjectV1(project), plan: result.plan, summary: summarizeSweaterRun(result), sha256: async (bytes) => createHash('sha256').update(bytes).digest('hex') });
      await mkdir(parsed.out, { recursive: true });
      for (const [name, bytes] of Object.entries(files)) await writeFile(resolvePath(parsed.out, name), bytes);
      io.print({ packaged: parsed.out, files: Object.keys(files), pieces: result.pieces.map((piece) => ({ id: piece.id, copies: piece.copies, passes: piece.kcode?.passCount, kcodeSha256: piece.kcode?.kcHash })), readiness: { ready: result.readiness.ready, blockers: result.readiness.blockers } });
      return 0;
    }
    case 'pattern': {
      const project = await io.readProject(projectPath());
      const result = await runSweaterPipeline(project);
      const markdown = sweaterInstructions(project, result.plan, summarizeSweaterRun(result));
      if (parsed.out) { await writeFile(parsed.out, markdown); io.print({ written: parsed.out }); }
      else process.stdout.write(markdown);
      return 0;
    }
    case 'schematic': {
      const project = await io.readProject(projectPath());
      if (parsed.out === null) throw new SweaterUsageError('sweater schematic requires -o <file.svg>.');
      const plan = planFor(project);
      await writeFile(parsed.out, sweaterSchematicSvg(plan, materializeColorworkProject(project).state.chart.palette[0]!.hex));
      io.print({ written: parsed.out });
      return 0;
    }
    default:
      throw new SweaterUsageError(`Unknown sweater command: ${parsed.command}`);
  }
}

/** Whether a project file is a sweater, for routing the generic commands. */
export function isSweaterProject(project: ColorworkProjectV1): boolean {
  return sweaterObjectOf(materializeColorworkProject(project).state) !== undefined;
}

export { check as sweaterCheck };
