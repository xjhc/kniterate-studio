import { materializeColorworkProject, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import type { PanelPlan } from './panel';
import { pieceSteps } from './sweaterHandoff';
import type { SweaterRunSummary } from './sweaterRun';
import { ribName, textureMatching } from './textures';

/** A one-yarn scarf or blanket's written pattern and its download package. */

export function panelInstructions(project: ColorworkProjectV1, plan: PanelPlan, summary: SweaterRunSummary | null): string {
  const { state } = materializeColorworkProject(project);
  const yarn = state.chart.palette[0]!;
  const object = plan.object;
  const piece = plan.pieces[0]!;
  const run = summary?.pieces[0];
  const lines: string[] = [`# ${project.title}`, ''];
  if (summary) {
    lines.push(summary.readiness.ready ? '**Ready to knit.**' : `**Not ready yet.** ${summary.readiness.blockers.length} thing${summary.readiness.blockers.length === 1 ? '' : 's'} to resolve:`);
    for (const finding of summary.findings.filter((item) => item.severity !== 'info')) lines.push(`- ${finding.message}`);
    lines.push('', `Software check: ${summary.verdict.label}. Yarn and size are proven only by knitting.`, '');
  }
  lines.push(
    `## The ${piece.name.toLowerCase()}`,
    `${object.body.name}${textureMatching(object.body.texture) ? '' : ` (your stitch: ${object.body.texture.join(' / ')})`}, ${object.widthCm} × ${object.lengthCm} cm${object.ends.cm > 0 ? `, with ${object.ends.cm} cm of ${ribName(object.ends.rib)} rib at each end` : ''}.`,
    plan.knitted ? `Knitted: ${plan.knitted.stitches} stitches × ${plan.knitted.rows} rows, ${plan.knitted.widthCm} × ${plan.knitted.lengthCm} cm.` : '',
    `Yarn: ${yarn.name} (${yarn.hex}), about ${plan.yarn.metres.toLocaleString('en')} m. Gauge ${plan.gauge.stitchesPer10cm} st / ${plan.gauge.rowsPer10cm} rows per 10 cm (${plan.gauge.source}).`,
    '',
    '## At the machine',
    ...(summary ? summary.readiness.operatorChecks : [`Yarn on C${plan.carriers.main}, waste yarn on C${plan.carriers.waste}, draw thread on C${plan.carriers.draw}.`]).map((check) => `- ${check}`),
    '',
    '## Knitting',
    `File: \`panel.kc\`${run?.passCount ? ` · ${run.passCount.toLocaleString()} passes` : ''}${run ? ` · ${run.verdict.label}` : ''}`,
    '',
    ...pieceSteps(piece, plan).map((step) => `- ${step}`),
    '',
    '## Finishing',
    '- Pull the draw thread (C1) to free the piece from the waste yarn.',
    '- Weave in the ends.',
  );
  return `${lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n')}\n`;
}

export async function panelPackageFiles(input: {
  project: ColorworkProjectV1;
  serializedProject: string;
  plan: PanelPlan;
  summary: SweaterRunSummary;
  sha256: (bytes: Uint8Array) => Promise<string>;
}): Promise<Record<string, Uint8Array>> {
  const { project, plan, summary } = input;
  const piece = summary.pieces[0];
  if (!summary.exportReady || !piece?.kcText) throw new Error('The panel needs a validated program before the package can be written.');
  const encode = (text: string) => new TextEncoder().encode(text);
  const files: Record<string, Uint8Array> = {
    'project.json': encode(input.serializedProject),
    'instructions.md': encode(panelInstructions(project, plan, summary)),
    'panel.kc': encode(piece.kcText),
  };
  if (piece.knitoutText) files['panel.k'] = encode(piece.knitoutText);
  const manifest = {
    kind: 'kniterate-studio-panel-package',
    version: 1,
    project: project.id,
    verdict: summary.verdict.label,
    ready: summary.readiness.ready,
    pieces: [{ id: piece.id, name: piece.name, copies: 1, file: 'panel.kc', passes: piece.passCount, kcodeSha256: piece.kcHash, verdict: piece.verdict.label }],
    files: Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, bytes]) => [name, await input.sha256(bytes)] as const))),
  };
  files['manifest.json'] = encode(`${JSON.stringify(manifest, null, 2)}\n`);
  return files;
}
