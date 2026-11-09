/** Derive the small gathered DBJ trial from handoff 2 without changing its motif or yarn assignments.
 * node --import tsx scripts/prepare-straight-mini.ts <handoff-2 project.json> <output project.json>
 * Then: node --import tsx scripts/studio.ts package <output project.json> -o <package directory>
 */
import { readFile, writeFile } from 'node:fs/promises';
import { appendProjectOperation, materializeColorworkProject, parseColorworkProjectV1 } from '../packages/project-contract/src/index.js';
import { createBeanieProject } from '../apps/studio/src/beanie.js';

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Supply handoff-2 project and output project paths.');
const parsed = parseColorworkProjectV1(JSON.parse(await readFile(source, 'utf8')));
const { state } = materializeColorworkProject(parsed);
if (!state.gauge || !state.placements?.length) throw new Error('The source must include its gauge and bird placement.');
const main = state.chart.palette[0]!;
const accent = state.chart.palette[1]!;
const project = createBeanieProject({
  title: 'Run 3 — small straight double jacquard, gathered top',
  construction: 'straight-double-jacquard', headCircumferenceCm: 26, ease: -0.1,
  bodyCm: 10, bodyGauge: state.gauge, main, accent, backing: 'birdseye',
}, { id: 'run3-straight-dbj-v1', source: 'assistant', group: 'straight-dbj' });
const ready = appendProjectOperation(project, {
  group: 'straight-trial-settings', source: 'assistant', label: 'Keep enlarged bird, C3/C4, speed 100 and eight waste rows on each bed',
  edits: [
    ...state.placements.map(placement => ({ kind: 'set-placement' as const, placement })),
    ...state.machine.yarnAssignments.map(assignment => ({ kind: 'set-yarn-assignment' as const, assignment })),
    { kind: 'set-machine-setup', setup: { waste: { speed: 100 }, castOn: { speed: 100 }, body: { speed: 100 }, transfers: { speed: 100 }, topWasteRows: 8 } },
  ],
});
await writeFile(destination, JSON.stringify(ready, null, 2) + '\n');
console.log(destination);
