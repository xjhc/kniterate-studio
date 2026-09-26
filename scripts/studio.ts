#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import {
  ProjectEditSchema,
  appendProjectEdit,
  materializeColorworkProject,
  redoProjectEdit,
  serializeColorworkProjectV1,
  undoProjectEdit,
  type ColorworkProjectV1,
  type ProjectEdit,
} from '../packages/project-contract/src/index.ts';
import { runAuthoredPipeline, type AuthoredPipelineResult } from '../apps/studio/src/authoredPipeline.ts';
import { openStudioProjectJson } from '../apps/studio/src/chart/projectFile.ts';

const USAGE = `Usage: pnpm --silent studio -- <command> [args]

Every command prints JSON. Exit 0 = ok / export-ready, 1 = blocked, 2 = usage or read error.

  new <chart.json|project.json> -o <project.json> [--id <id>]
      Start a project from a ColorworkChartV1 file (or normalize an existing project).
  show <project.json> [--cells]
      Materialized state: chart size, palette, row ids, yarns, strategy, overrides.
  edit <project.json> <edit> [--source human|assistant] [-o <out.json>]
      Apply one typed edit or an array of edits. <edit> is inline JSON, a file path, or - for stdin.
      Writes back to <project.json> unless -o is given.
  undo <project.json> | redo <project.json>
  compile <project.json>
      Compile, convert, and validate exactly as Studio does; prints verdict, findings,
      compiled frame, and every carrier required by the emitted program.
  export <project.json> -o <file.kc>
      Write the validated .kc only when the verdict allows export.
  schema
      JSON Schema for <edit>.`;

const MAX_FINDINGS = 200;

class UsageError extends Error {}

interface Parsed {
  command: string | null;
  positionals: string[];
  out: string | null;
  id: string | null;
  source: 'human' | 'assistant';
  cells: boolean;
}

function parseArguments(args: readonly string[]): Parsed {
  const parsed: Parsed = { command: null, positionals: [], out: null, id: null, source: 'assistant', cells: false };
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

async function readProject(path: string): Promise<ColorworkProjectV1> {
  return openStudioProjectJson(await readFile(path, 'utf8'), () => randomUUID().replace(/-/g, '').slice(0, 12)).project;
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
    case 'new': {
      if (parsed.out === null) throw new UsageError('new requires -o <project.json>.');
      let project = await readProject(positional(parsed, 0, 'chart or project file'));
      if (parsed.id !== null) project = { ...project, id: parsed.id };
      await writeProject(parsed.out, project);
      print(describeProject(project, false));
      return 0;
    }
    case 'show':
      print(describeProject(await readProject(positional(parsed, 0, 'project file')), parsed.cells));
      return 0;
    case 'edit': {
      const path = positional(parsed, 0, 'project file');
      let project = await readProject(path);
      for (const edit of await readEdits(positional(parsed, 1, 'edit'))) {
        project = appendProjectEdit(project, { id: `cli-${randomUUID()}`, source: parsed.source, edit });
      }
      await writeProject(parsed.out ?? path, project);
      print(describeProject(project, false));
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
    case 'compile':
    case 'export': {
      const project = await readProject(positional(parsed, 0, 'project file'));
      if (parsed.command === 'export' && parsed.out === null) throw new UsageError('export requires -o <file.kc>.');
      const result = await runAuthoredPipeline(project);
      const findings = [
        ...(result.compiled?.diagnostics ?? []).map(({ severity, rule, message, rowId, passIndices }) => ({ stage: 'compile', severity, rule, message, rowId, passIndices })),
        ...(result.kcode?.messages ?? []).map(({ severity, rule, message }) => ({ stage: 'kcode', severity, rule, message })),
      ];
      const exported = parsed.command === 'export' && result.exportReady && result.kcode !== null;
      if (exported) await writeFile(parsed.out!, result.kcode!.kcText);
      print({
        project: { id: project.id, title: project.title, revision: result.compiled?.revision ?? null },
        verdict: result.verdict,
        exportReady: result.exportReady,
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
