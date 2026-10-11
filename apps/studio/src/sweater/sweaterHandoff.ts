import { materializeColorworkProject, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import type { PanelPlan } from './rasterize';
import { edgeRhythm } from './rhythm';
import type { SweaterPiecePlan, SweaterPlan } from './sweater';
import type { SweaterRunSummary } from './sweaterRun';
import { sweaterSchematicSvg } from './schematic';
import { ribName, textureMatching } from './textures';

/**
 * The sweater's written pattern and its download package. The machine knits
 * every piece; the pattern says what each program does, in rows and
 * stitches, so the knitter can follow and check it, and how to assemble it.
 */

const SILHOUETTE_NAMES = { 'drop-shoulder': 'drop-shoulder', 'j-sleeve': 'J-sleeve', 'set-in': 'set-in sleeve' } as const;

const width = (raster: PanelPlan, row: number) => raster.rows[row]!.segments.reduce((sum, segment) => sum + segment.hi - segment.lo + 1, 0);

/** The shaping of one piece, as pattern lines. */
export function pieceSteps(piece: SweaterPiecePlan, plan: SweaterPlan): string[] {
  const raster = piece.raster;
  if (raster === null) return [`Not planned: ${piece.error ?? 'no rows'}.`];
  const object = plan.object;
  const rib = piece.id === 'sleeve' ? object.trims.cuff.rib : piece.id === 'neckband' ? object.trims.neck.rib : object.trims.hem.rib;
  const steps: string[] = [];
  const bottom = raster.realized.ribRows.bottom;
  steps.push(`Cast on ${raster.realized.castOnStitches} stitches over waste yarn and the draw thread.`);
  if (piece.id === 'neckband') {
    steps.push(`Rows 1–${raster.rows.length}: ${ribName(rib)} rib.`);
  } else {
    if (bottom > 0) steps.push(`Rows 1–${bottom}: ${ribName(rib)} rib (${piece.id === 'sleeve' ? 'cuff' : 'hem'}).`);
    steps.push(`From row ${bottom + 1}: ${object.body.name.toLowerCase()}.`);
  }
  // Shaping in the machine knitter's rhythm, with the stitch count after each step.
  const split = raster.events.find((event) => event.kind === 'neck-split');
  const before = raster.events.filter((event) => split === undefined || event.row < split.row);
  const after = split === undefined ? [] : raster.events.filter((event) => event.row > split.row);
  // A bind-off on the right comes a row after its left one; count after both.
  const settled = (row: number) => Math.max(row, ...before.filter((event) => event.kind === 'bind-off' && event.edge === 'right' && event.row >= row && event.row <= row + 1).map((event) => event.row));
  for (const step of edgeRhythm(before, ['left'])) steps.push(`${step.text.replace(': ', ' at each side: ')} → ${width(raster, step.kind === 'bind-off' ? settled(step.to) : step.to)} stitches.`);
  if (split !== undefined) {
    steps.push(`Row ${split.row + 1}: neck. Bind off the centre ${split.stitches} stitches. From here the left shoulder knits on C${plan.carriers.main} and the right shoulder on C${plan.carriers.second}, at the same time.`);
    const neck = edgeRhythm(after, ['neck-left']);
    if (neck.length > 0) steps.push(`Each neck edge: ${neck.map((step) => step.text.replace(/^Rows? /, (match) => match.toLowerCase())).join('; ')}.`);
    const shoulder = edgeRhythm(after, ['left']);
    if (shoulder.length > 0) steps.push(`Each armhole edge: ${shoulder.map((step) => step.text.replace(/^Rows? /, (match) => match.toLowerCase())).join('; ')}; both shoulders on the same rows.`);
  }
  const last = raster.rows.length - 1;
  const lastRow = raster.rows[last]!;
  const finish = object.top === 'waste' ? 'knit waste yarn over' : 'bind off';
  steps.push(`Row ${last + 1} is the last: ${finish} the remaining ${lastRow.segments.map((segment) => segment.hi - segment.lo + 1).join(' + ')} stitches.`);
  return steps;
}

export function assemblySteps(plan: SweaterPlan): string[] {
  const { silhouette, neckline } = plan.object;
  const steps = [
    'Take each piece off the machine and pull the draw thread (C1) to release it from the waste yarn. Trim the strand of the second shoulder yarn that runs up the right edge of the front' + (plan.pieces.find((piece) => piece.id === 'back')?.raster?.events.some((event) => event.kind === 'neck-split') ? ' and back.' : '.'),
    'Wash and block every piece to the schematic measurements; let them dry flat.',
    neckline === 'boat'
      ? `Sew the shoulder seams from each armhole edge toward the centre, leaving the middle ${plan.object.measurements.neckWidth} cm open for the neck.`
      : 'Sew the front to the back at the shoulders (mattress stitch through the bound-off edges, or graft live stitches if you finished with waste yarn).',
    silhouette === 'drop-shoulder'
      ? 'Fold each sleeve in half lengthwise to find the middle of its top. Pin that point to the shoulder seam and sew the sleeve top straight along the front and back edges.'
      : silhouette === 'j-sleeve'
        ? 'Pin the middle of each sleeve top to the shoulder seam. Sew the flat top along the straight armhole edges, then fit the sleeve\'s bound-off underarm steps into the body\'s.'
        : 'Pin the top of each sleeve cap to the shoulder seam and the cap\'s bound-off stitches to the underarm bind-offs. Ease the cap into the armhole and sew.',
    'Sew each side seam and sleeve seam in one line, from the hem to the cuff, one stitch in from the edges.',
    ...(neckline === 'crew' ? ['Sew the neckband\'s short ends together into a ring. Pin the seam to one shoulder seam and stretch the band evenly around the neck opening; sew it on with the right sides out.'] : []),
    ...(neckline === 'v' ? ['Sew the neckband on from the point of the V, round the back and down to the point again, stretching it slightly; cross the right end over the left at the V and stitch both ends down.'] : []),
    ...(neckline === 'square' ? ['Sew the neckband on round the opening, stretching it slightly along the sides; at each corner fold the band at 45° (a mitre) so it lies flat, and join the ends at a shoulder seam.'] : []),
    'Weave in the ends.',
  ];
  return steps;
}

/** The written pattern, with the readiness story first. */
export function sweaterInstructions(project: ColorworkProjectV1, plan: SweaterPlan, summary: SweaterRunSummary | null): string {
  const { state } = materializeColorworkProject(project);
  const yarn = state.chart.palette[0]!;
  const object = plan.object;
  const texture = textureMatching(object.body.texture);
  const lines: string[] = [`# ${project.title}`, ''];
  if (summary) {
    lines.push(summary.readiness.ready ? '**Ready to knit.** Every piece passed the software checks.' : `**Not ready yet.** ${summary.readiness.blockers.length} thing${summary.readiness.blockers.length === 1 ? '' : 's'} to resolve:`);
    for (const finding of summary.findings.filter((item) => item.severity !== 'info')) lines.push(`- ${finding.message}`);
    lines.push('', `Software verdict: ${summary.verdict.label}. Physical knitting, yarn and fit are checked only by knitting.`, '');
  }
  lines.push(
    '## The sweater',
    `A ${SILHOUETTE_NAMES[object.silhouette]} sweater with a ${object.neckline === 'boat' ? 'boat neck' : `${object.neckline === 'v' ? 'V' : object.neckline} neck and rib neckband`}, knitted flat in pieces and sewn${object.size ? ` (${object.size})` : ''}.`,
    `Body: ${object.body.name}${texture ? '' : ` (custom: ${object.body.texture.join(' / ')})`}. Hem and cuffs: ${ribName(object.trims.hem.rib)} rib, ${object.trims.hem.cm} and ${object.trims.cuff.cm} cm. ${object.neckline === 'crew' ? 'Neckband' : 'Neck edge'}: ${ribName(object.trims.neck.rib)} rib, ${object.trims.neck.cm} cm.`,
    `Yarn: ${yarn.name} (${yarn.hex}). Body gauge ${plan.gauge.stitchesPer10cm} st / ${plan.gauge.rowsPer10cm} rows per 10 cm (${plan.gauge.source}); rib gauge ${plan.ribGauge.stitchesPer10cm} / ${plan.ribGauge.rowsPer10cm} (${plan.ribGauge.source}).`,
    '',
    '## Finished measurements',
    ...plan.realized.map((item) => `- **${item.label}:** ${item.cm} cm knitted${item.target === null ? '' : ` (wanted ${item.target} cm)`}, ${item.how}.`),
    `- **Yarn:** about ${plan.yarn.metres.toLocaleString('en')} m of the main yarn (${plan.yarn.how}).`,
    '',
    '## At the machine',
    ...(summary ? summary.readiness.operatorChecks : [`Main yarn on C${plan.carriers.main}${plan.carriers.second ? `; a second cone of the same yarn on C${plan.carriers.second} for the right shoulder` : ''}. Waste yarn on C${plan.carriers.waste}, draw thread on C${plan.carriers.draw}.`]).map((check) => `- ${check}`),
    '',
    '## Pieces',
  );
  for (const piece of plan.pieces) {
    const run = summary?.pieces.find((item) => item.id === piece.id);
    lines.push('', `### ${piece.name}${piece.copies > 1 ? ` — knit ${piece.copies}` : ''}`, `File: \`${piece.id}.kc\`${run?.passCount ? ` · ${run.passCount.toLocaleString()} passes` : ''}${run ? ` · ${run.verdict.label}` : ''}`, '');
    for (const step of pieceSteps(piece, plan)) lines.push(`- ${step}`);
  }
  lines.push('', '## Assembly', ...assemblySteps(plan).map((step, index) => `${index + 1}. ${step}`), '');
  return lines.join('\n');
}

/** Every file of the package, with a manifest of their SHA-256. Throws when a piece has no validated program. */
export async function sweaterPackageFiles(input: {
  project: ColorworkProjectV1;
  serializedProject: string;
  plan: SweaterPlan;
  summary: SweaterRunSummary;
  sha256: (bytes: Uint8Array) => Promise<string>;
}): Promise<Record<string, Uint8Array>> {
  const { project, plan, summary } = input;
  if (!summary.exportReady) throw new Error('Every piece needs a validated program before the package can be written.');
  const encode = (text: string) => new TextEncoder().encode(text);
  const { state } = materializeColorworkProject(project);
  const files: Record<string, Uint8Array> = {
    'project.json': encode(input.serializedProject),
    'instructions.md': encode(sweaterInstructions(project, plan, summary)),
    'schematic.svg': encode(sweaterSchematicSvg(plan, state.chart.palette[0]!.hex)),
  };
  for (const piece of summary.pieces) {
    files[`${piece.id}.kc`] = encode(piece.kcText!);
    if (piece.knitoutText) files[`${piece.id}.k`] = encode(piece.knitoutText);
  }
  const manifest = {
    kind: 'kniterate-studio-sweater-package',
    version: 1,
    project: project.id,
    verdict: summary.verdict.label,
    ready: summary.readiness.ready,
    pieces: summary.pieces.map((piece) => ({ id: piece.id, name: piece.name, copies: piece.copies, file: `${piece.id}.kc`, passes: piece.passCount, kcodeSha256: piece.kcHash, verdict: piece.verdict.label })),
    files: Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, bytes]) => [name, await input.sha256(bytes)] as const))),
  };
  files['manifest.json'] = encode(`${JSON.stringify(manifest, null, 2)}\n`);
  return files;
}
