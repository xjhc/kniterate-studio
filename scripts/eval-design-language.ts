#!/usr/bin/env node
/**
 * Agent-legibility benchmark (DESIGN-LANGUAGE §11). Each case gives a fresh
 * headless Claude session only the repository, the knit-design skill, and the
 * Studio CLI, then checks the result independently: a reported "ready" is
 * re-verified with the same readiness policy, and a false ready claim fails
 * the run. Geometry is checked as predicted counts under the requested gauge,
 * never as a physical measurement.
 *
 *   pnpm eval:design [--cases id,id] [--model <model>] [--parallel N] [--dry]
 *
 * --dry prepares every case directory without calling Claude. Do not edit the
 * working tree during a run: any content change fails it as repoTouched.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  appendProjectEdit,
  createColorworkProjectV1,
  materializeColorworkProject,
  parseColorworkProjectV1Json,
  serializeColorworkProjectV1,
  type ColorworkProjectV1,
  type ProjectEdit,
} from '../packages/project-contract/src/index.ts';
import { runAuthoredPipeline } from '../apps/studio/src/authoredPipeline.ts';
import { planProject } from '../apps/studio/src/plan.ts';
import { collectFindings, resolveReadiness } from '../apps/studio/src/readiness.ts';
import { encodePng } from './lib/png.ts';

const root = resolve(import.meta.dirname, '..');
const OUTCOMES = ['ready', 'not-ready', 'needs-input', 'unsupported'] as const;
type Outcome = typeof OUTCOMES[number];

interface EvalCase {
  id: string;
  request: string;
  setup?: { kind: 'motif-png' | 'scarf-project' | 'misnamed-yarn-project' | 'long-float-project' };
  expect: {
    outcomes: Outcome[];
    stitches?: number;
    rows?: number;
    colors?: number;
    technique?: string;
    gauge?: [number, number];
    noCarrierInNames?: boolean;
    unchanged?: boolean;
  };
}

function withEdits(project: ColorworkProjectV1, edits: ProjectEdit[]): ColorworkProjectV1 {
  return edits.reduce((current, edit, index) => appendProjectEdit(current, { id: `setup-${index}`, source: 'system', edit }), project);
}

function stripes(width: number, height: number, colors: { id: string; name: string; hex: string }[], bandRows: number) {
  return {
    kind: 'knitlab-colorwork-chart', version: 1, title: 'Eval fixture', width, height, rowNumbering: 'bottom-up', palette: colors,
    cells: Array.from({ length: height }, (_, row) => Array<number>(width).fill(Math.floor((height - 1 - row) / bandRows) % colors.length)),
  };
}

/** Writes the case's starting files into `directory`; returns the bytes of project.json when one is prepared. */
function prepare(directory: string, setup: EvalCase['setup']): string | null {
  if (setup === undefined) return null;
  if (setup.kind === 'motif-png') {
    // 60 × 40 light image with a dark diamond.
    const width = 60; const height = 40;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inside = Math.abs(x - 30) / 26 + Math.abs(y - 20) / 18 <= 1;
        data.set(inside ? [25, 30, 45, 255] : [240, 236, 226, 255], (y * width + x) * 4);
      }
    }
    writeFileSync(resolve(directory, 'motif.png'), encodePng({ width, height, data }));
    return null;
  }
  const gauge: ProjectEdit = { kind: 'set-gauge', gauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' } };
  let project: ColorworkProjectV1;
  if (setup.kind === 'scarf-project') {
    project = withEdits(createColorworkProjectV1(stripes(65, 612, [
      { id: 'oat', name: 'Oat', hex: '#E8DFCF' }, { id: 'rust', name: 'Rust', hex: '#B5532E' }, { id: 'moss', name: 'Moss', hex: '#5E6B3A' },
    ], 17), { id: 'eval-scarf' }), [gauge, { kind: 'set-target', target: { widthCm: 25, heightCm: 180 } }]);
  } else if (setup.kind === 'misnamed-yarn-project') {
    project = withEdits(createColorworkProjectV1(stripes(40, 60, [
      { id: 'ground', name: 'Ground', hex: '#F1EDE3' }, { id: 'contrast', name: 'Contrast', hex: '#29445F' },
    ], 10), { id: 'eval-names' }), [{ kind: 'set-yarn-assignment', assignment: { paletteId: 'ground', carrier: '2', yarnName: 'Ground (C4)' } }]);
  } else {
    const chart = stripes(40, 40, [{ id: 'ground', name: 'Ground', hex: '#F1EDE3' }, { id: 'dots', name: 'Dots', hex: '#29445F' }], 40);
    chart.cells = chart.cells.map((row) => row.map((_, column) => (column % 10 === 0 ? 1 : 0)));
    project = createColorworkProjectV1(chart, { id: 'eval-floats' });
  }
  const text = serializeColorworkProjectV1(project);
  writeFileSync(resolve(directory, 'project.json'), text);
  return text;
}

function prompt(item: EvalCase, directory: string): string {
  return [
    `Work in the Kniterate Studio repository at ${root}. Use the knit-design skill (.claude/skills/knit-design/SKILL.md) and the Studio CLI.`,
    `Your working directory for any files you create or read is ${directory}; do not modify files in the repository.`,
    item.setup?.kind === 'motif-png' ? `The motif image is ${directory}/motif.png.` : '',
    item.setup !== undefined && item.setup.kind !== 'motif-png' ? `The existing project is ${directory}/project.json.` : '',
    `Request: ${item.request}`,
    'If you create or change a project, save it as project.json in the working directory.',
    `Finish with one line of JSON and nothing after it: {"outcome": "ready" | "not-ready" | "needs-input" | "unsupported", "project": "<absolute path or null>"}.`,
  ].filter(Boolean).join('\n');
}

/** Content fingerprint of the working tree: the diff against HEAD plus every untracked, non-ignored file. */
function repoStatus(): string {
  const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).stdout;
  const hash = createHash('sha256').update(git('diff', 'HEAD', '--binary'));
  for (const path of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean).sort()) {
    hash.update(path).update(readFileSync(resolve(root, path)));
  }
  return hash.digest('hex');
}

function runClaude(text: string, directory: string, model: string | null): Promise<{ result: string; turns: number | null; costUsd: number | null; seconds: number }> {
  const started = Date.now();
  const args = ['-p', text, '--output-format', 'json', '--no-session-persistence', '--add-dir', directory,
    '--allowedTools', 'Read', 'Glob', 'Grep', 'Skill', `Write(/${directory}/**)`, `Edit(/${directory}/**)`,
    'Bash(pnpm --silent studio:*)', 'Bash(pnpm studio:*)', 'Bash(python3:*)', 'Bash(jq:*)', 'Bash(cat:*)', 'Bash(ls:*)',
    ...(model ? ['--model', model] : [])];
  return new Promise((resolvePromise) => {
    const child = spawn('claude', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('close', () => {
      try {
        const parsed = JSON.parse(stdout) as { result?: string; num_turns?: number; total_cost_usd?: number };
        resolvePromise({ result: parsed.result ?? '', turns: parsed.num_turns ?? null, costUsd: parsed.total_cost_usd ?? null, seconds: (Date.now() - started) / 1000 });
      } catch {
        resolvePromise({ result: stdout, turns: null, costUsd: null, seconds: (Date.now() - started) / 1000 });
      }
    });
  });
}

function lastJsonLine(text: string): { outcome?: string; project?: string | null } | null {
  const lines = text.trim().split('\n').reverse();
  for (const line of lines) {
    const match = /\{.*"outcome".*\}/.exec(line);
    if (match) { try { return JSON.parse(match[0]); } catch { return null; } }
  }
  return null;
}

async function check(item: EvalCase, directory: string, reported: ReturnType<typeof lastJsonLine>, before: string | null) {
  const failures: string[] = [];
  const outcome = reported?.outcome as Outcome | undefined;
  if (outcome === undefined || !OUTCOMES.includes(outcome)) failures.push('no valid outcome line');
  else if (!item.expect.outcomes.includes(outcome)) failures.push(`outcome ${outcome} not in [${item.expect.outcomes.join(', ')}]`);
  let falseReady = false;
  const projectPath = reported?.project ?? resolve(directory, 'project.json');
  let project: ColorworkProjectV1 | null = null;
  try { project = parseColorworkProjectV1Json(readFileSync(projectPath, 'utf8')); } catch { /* no project */ }
  if (item.expect.unchanged && before !== null && readFileSync(resolve(directory, 'project.json'), 'utf8') !== before) failures.push('project changed although asked not to');
  if (outcome === 'ready') {
    if (project === null) { falseReady = true; failures.push('claimed ready without a readable project'); }
    else {
      const plan = planProject(materializeColorworkProject(project).state);
      const result = await runAuthoredPipeline(project);
      const readiness = resolveReadiness({ verdict: result.verdict, findings: collectFindings(plan, result) });
      if (!readiness.ready) { falseReady = true; failures.push(`FALSE READY CLAIM: ${readiness.blockers.map((blocker) => blocker.kind === 'finding' ? blocker.rule : blocker.kind).join(', ')}`); }
      const state = materializeColorworkProject(project).state;
      if (item.expect.stitches !== undefined && state.chart.width !== item.expect.stitches) failures.push(`stitches ${state.chart.width}, expected ${item.expect.stitches}`);
      if (item.expect.rows !== undefined && state.chart.height !== item.expect.rows) failures.push(`rows ${state.chart.height}, expected ${item.expect.rows}`);
      if (item.expect.colors !== undefined && new Set(state.chart.cells.flat()).size !== item.expect.colors) failures.push(`used colors ${new Set(state.chart.cells.flat()).size}, expected ${item.expect.colors}`);
      if (item.expect.technique !== undefined && state.strategy.technique !== item.expect.technique) failures.push(`technique ${state.strategy.technique}, expected ${item.expect.technique}`);
      if (item.expect.gauge !== undefined && (state.gauge?.stitchesPer10cm !== item.expect.gauge[0] || state.gauge?.rowsPer10cm !== item.expect.gauge[1] || state.gauge?.source !== 'measured')) failures.push('gauge not recorded as measured with the requested values');
      if (item.expect.noCarrierInNames && state.machine.yarnAssignments.some((assignment) => /\bC[1-6]\b/.test(assignment.yarnName))) failures.push('a yarn name still contains a carrier number');
    }
  }
  return { outcome: outcome ?? null, pass: failures.length === 0, falseReady, failures };
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const option = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] ?? null : null; };
  const file = JSON.parse(readFileSync(resolve(root, 'evals/design-language/cases.json'), 'utf8')) as { cases: EvalCase[] };
  const only = option('--cases')?.split(',') ?? null;
  const cases = file.cases.filter((item) => only === null || only.includes(item.id));
  const parallel = Number(option('--parallel') ?? 3);
  const dry = args.includes('--dry');
  const runDirectory = mkdtempSync(resolve(tmpdir(), 'kniterate-design-eval-'));
  const statusBefore = repoStatus();
  const results: unknown[] = [];
  let falseReadyClaims = 0;
  const queue = [...cases];
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      const directory = resolve(runDirectory, item.id);
      mkdirSync(directory);
      const before = prepare(directory, item.setup);
      if (dry) { results.push({ id: item.id, prepared: directory }); continue; }
      const run = await runClaude(prompt(item, directory), directory, option('--model'));
      const verdict = await check(item, directory, lastJsonLine(run.result), before);
      if (verdict.falseReady) falseReadyClaims += 1;
      results.push({ id: item.id, ...verdict, turns: run.turns, costUsd: run.costUsd, seconds: Math.round(run.seconds), directory });
      process.stderr.write(`${verdict.pass ? 'PASS' : 'FAIL'} ${item.id} ${verdict.outcome ?? ''} ${verdict.failures.join('; ')}\n`);
    }
  }));
  const repoTouched = repoStatus() !== statusBefore;
  const passed = results.filter((result) => (result as { pass?: boolean }).pass).length;
  const report = { kind: 'kniterate-design-language-eval-report', schemaVersion: 1, runDirectory, model: option('--model'), dry, cases: cases.length, passed, falseReadyClaims, repoTouched, results };
  mkdirSync(resolve(root, 'output/design-language-eval'), { recursive: true });
  writeFileSync(resolve(root, 'output/design-language-eval', `report-${Date.now()}.json`), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ...report, results: dry ? results : results.map(({ id, pass, outcome, failures, turns, costUsd, seconds }: any) => ({ id, pass, outcome, failures, turns, costUsd, seconds })) }, null, 2)}\n`);
  return dry ? 0 : falseReadyClaims > 0 || repoTouched ? 2 : passed === cases.length ? 0 : 1;
}

main().then((code) => { process.exitCode = code; }, (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 2;
});
