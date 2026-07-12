import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createColorworkProjectV1 } from '../packages/project-contract/src/index.js';
import type { ColorworkChartV1 } from '../packages/chart-contract/src/index.js';
import { compileColorworkProject } from '../apps/studio/src/blanket/compileProject.js';
import { inspectKcDocument } from '../packages/machine-lib/src/knitout/kc-document.js';
import { kcToKnitout } from '../packages/machine-lib/src/knitout/kc-to-knitout.js';
import { knitoutToKCode } from '../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import { validateKnitoutProgram } from '../packages/machine-lib/src/validators/knitout-program.js';
import { computeCompilerFingerprint } from '../packages/machine-lib/scripts/registry-support.js';

const destination = resolve('out/v1-knit-trial');
const palette = [
  { id: 'natural', name: 'Natural worsted', hex: '#F1EDE3' },
  { id: 'red', name: 'Red worsted', hex: '#B4423A' },
  { id: 'gold', name: 'Gold worsted', hex: '#C99A35' },
  { id: 'navy', name: 'Navy worsted', hex: '#29445F' },
];
const width = 120;
const height = 160;
const chart: ColorworkChartV1 = {
  kind: 'knitlab-colorwork-chart', version: 1, title: 'V1 four-color blanket trial', width, height,
  rowNumbering: 'bottom-up', palette,
  cells: Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, column) => {
    const border = row < 6 || row >= height - 6 || column < 6 || column >= width - 6;
    if (border) return (Math.floor(row / 2) + Math.floor(column / 2)) % 2;
    return (Math.floor((row - 6) / 8) + Math.floor((column - 6) / 8) + (column % 7 === 0 ? 1 : 0)) % 4;
  })),
};
const project = createColorworkProjectV1(chart, { id: 'v1-four-color-blanket-trial', title: chart.title });
const compiled = compileColorworkProject(project);
if (!compiled.ok || !compiled.knitoutText || !compiled.inputHash) throw new Error(compiled.messages.map((message) => `${message.severity}: ${message.message}`).join('\n'));
const converted = knitoutToKCode(compiled.knitoutText);
if (!converted.ok || !converted.kcode) throw new Error(converted.stderr || converted.stdout || 'k-code conversion failed');
const reconstructed = kcToKnitout(converted.kcode);
const validation = validateKnitoutProgram(reconstructed.program);
const errors = validation.messages.filter((message) => message.severity === 'error');
if (errors.length > 0 || Object.keys(reconstructed.stats.unrecognizedTypes).length > 0) throw new Error(`generated k-code failed revalidation: ${errors.map((message) => message.message).join('; ')}`);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const firstSetting = (name: string): number => {
  const value = new RegExp(`^${name} ([0-9.]+)$`, 'm').exec(compiled.knitoutText!)?.[1];
  if (value === undefined) throw new Error(`generated knitout is missing ${name}`);
  return Number(value);
};
const manifest = {
  kind: 'kniterate-studio-v1-physical-trial', schemaVersion: 1,
  title: project.title, profile: project.base.machine.profile,
  chart: { width, height, colors: palette.length, rowNumbering: chart.rowNumbering, palette },
  machine: {
    needleStart: project.base.machine.needleOffset,
    needleEnd: project.base.machine.needleOffset + width - 1,
    settings: {
      gauge: 7,
      stitchNumber: firstSetting('x-stitch-number'),
      xferStitchNumber: firstSetting('x-xfer-stitch-number'),
      speedNumber: firstSetting('x-speed-number'),
      rollerAdvance: firstSetting('x-roller-advance'),
    },
  },
  carriers: [
    { carrier: '1', role: 'draw-thread' },
    ...project.base.machine.yarnAssignments.map((assignment) => ({ carrier: assignment.carrier, role: 'pattern', paletteId: assignment.paletteId, yarnName: assignment.yarnName })),
    { carrier: '6', role: 'waste-yarn' },
  ],
  frame: project.base.frame, strategy: project.base.strategy,
  output: { predictedPasses: compiled.stats.passCount, emittedPasses: inspectKcDocument(converted.kcode).length, operations: compiled.stats.opCount, estimatedKnitTimeSeconds: compiled.stats.estimatedKnitTimeSeconds },
  identity: { compileHash: compiled.inputHash, knitoutSha256: hash(compiled.knitoutText), kcodeSha256: hash(converted.kcode) },
  compilerFingerprint: computeCompilerFingerprint(resolve('packages/machine-lib/src')),
  softwareVerdict: 'Surface-proven', physicalVerdict: 'Pending machine trial',
};

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
writeFileSync(resolve(destination, 'project.kniterate-studio.json'), `${JSON.stringify(project, null, 2)}\n`);
writeFileSync(resolve(destination, 'chart.colorwork.json'), `${JSON.stringify(chart, null, 2)}\n`);
writeFileSync(resolve(destination, 'blanket.k'), compiled.knitoutText);
writeFileSync(resolve(destination, 'blanket.kc'), converted.kcode);
writeFileSync(resolve(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(resolve(destination, 'OPERATOR-CHECKLIST.md'), `# V1 physical blanket trial\n\n1. Knit a profile-matched tension swatch with the exact four yarns and record yarn brand, line, lot, fiber, and measured gauge.\n2. Load C1 draw thread, C2-C5 according to manifest.json, and C6 waste yarn.\n3. Confirm needles ${project.base.machine.needleOffset}-${project.base.machine.needleOffset + width - 1}, 20 waste rows, draw thread, and machine bind-off.\n4. Open blanket.kc in the Kniterate application and compare its pass count to manifest.json before sending.\n5. Watch waste, draw, carrier bring-in, first two body rows, and bind-off. Stop on unexpected carrier position, loop loss, or takedown behavior.\n6. Photograph front, back, cast-on, both edges, and bind-off. Record dimensions off-machine and after rest.\n7. Copy the completed artifact into packages/machine-lib/registry/swatches only after the outcome and exact hashes are recorded.\n`);
process.stdout.write(`v1 physical trial ready: ${destination}\n${JSON.stringify(manifest.output, null, 2)}\n`);
