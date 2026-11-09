/** Generate a short, same-width Run 2 derivative and a Run 4 derivative.
 * The only setting adjustment is first cast-on roller 450 -> 300.
 * node --import tsx scripts/prepare-caston-bindoff-trials.ts <handoff-2 directory> <output directory>
 * Package the generated project files with studio.ts package. Never edit KC.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { appendProjectOperation, materializeColorworkProject, parseColorworkProjectV1, type ProjectEdit } from '../packages/project-contract/src/index.js';
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Supply the handoff-2 directory and output directory.');
await mkdir(destination, { recursive: true });
for (const [inputName, name, title, rows] of [
  ['2-studio-fairisle', '2a-cast-on-300-v1', 'Run 2A — short cast-on trial, roller 300', 16],
  ['4-bindoff-strip', '4b-bindoff-cast-on-300-v1', 'Run 4B — original bind-off, cast-on roller 300', null],
] as const) {
  const original = parseColorworkProjectV1(JSON.parse(await readFile(resolve(source, inputName, 'project.kniterate-studio.json'), 'utf8')));
  const { state } = materializeColorworkProject(original);
  const edits: ProjectEdit[] = [
    ...(rows === null ? [] : [{ kind: 'delete-rows' as const, rowIds: state.rowIds.slice(0, state.chart.height - rows) }]),
    { kind: 'set-machine-setup', setup: { ...state.setup, castOn: { roller: 300 } } },
    ...state.machine.yarnAssignments.filter(a => /\bC[1-6]\b/.test(a.yarnName)).map(a => ({ kind: 'set-yarn-assignment' as const, assignment: { ...a, yarnName: a.yarnName.replace(/\s*\(C[1-6]\)/g, '') } })),
  ];
  const project = appendProjectOperation({ ...original, id: name, title }, { group: name, source: 'assistant', label: rows === null ? 'Test bind-off with cast-on roller 300; all bind-off passes unchanged' : 'Keep first 16 design rows at original width; test cast-on roller 300', edits });
  const path = resolve(destination, `${name}.json`);
  await writeFile(path, JSON.stringify(project, null, 2) + '\n');
  console.log(path);
}
