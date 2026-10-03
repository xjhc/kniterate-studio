import { materializeColorworkProject, type ColorworkProjectV1, type ProjectState, type ProjectTrial, type ResolvedProjectPlacement } from '@kniterate-studio/project-contract';
import type { AuthoredPipelineResult } from './authoredPipeline';
import type { ProjectPlan, Valued } from './plan';
import type { Finding, Readiness } from './readiness';

/**
 * Everything a person reads about a project, from one place, so the CLI, the
 * browser, the printed sheet and the exported package tell the same story:
 * the readiness story, the instructions, a dimensioned schematic, the
 * measurement form and the package manifest. Browser-safe and pure.
 */

// ---------------------------------------------------------------------------
// Readiness story

export type StoryStatus = 'ready' | 'needs-measurements' | 'design-issues' | 'blocked';

export interface StoryItem {
  /** The part of the piece it concerns, e.g. "Fit", "Cuff", "Motif". */
  part: string;
  severity: Finding['severity'];
  owner: Finding['owner'];
  rule: string;
  /** What happens if it is left as is. */
  consequence: string;
  /** The concrete next step. */
  action: string;
  message: string;
  /** Where to go: a control or region id the UI can focus (`fit.head`, `gauge.body`, `placement:<id>`, `rows/<rowId>`, `program`). */
  target: string | null;
  fixes: Finding['fixes'];
}

export interface ReadinessStory {
  status: StoryStatus;
  headline: string;
  detail: string;
  /** Evidence line, always stated: software checks, verdict, physical status. */
  evidence: string;
  items: StoryItem[];
  operatorChecks: string[];
  /** Things to know that do not block, e.g. that recorded measurements were synthetic. */
  notices: string[];
}

interface RuleStory { part: string; consequence: string; action: string; target: (finding: Finding) => string | null }

const RULE_STORIES: Record<string, RuleStory> = {
  'gauge-assumed': {
    part: 'Fit',
    consequence: 'The finished size is a calculation from a guessed gauge, so the hat may not fit.',
    action: 'Knit and measure a swatch (or the trial piece) and enter the measured gauge.',
    target: (finding) => (finding.path === 'object.ribGauge' ? 'gauge.rib' : 'gauge.body'),
  },
  'size-needs-gauge': {
    part: 'Fit',
    consequence: 'Without a gauge, stitch and row counts cannot be derived from centimetres.',
    action: 'Enter the gauge measured on a swatch in this yarn and fabric.',
    target: (finding) => (finding.path === 'object.ribGauge' ? 'gauge.rib' : 'gauge.body'),
  },
  'size-off-target': {
    part: 'Size',
    consequence: 'The piece would knit to a different size than the one asked for.',
    action: 'Apply the offered resize, or change the requested size.',
    target: (finding) => (finding.path === 'target.heightCm' ? 'fit.body' : 'fit.head'),
  },
  'size-exceeds-capacity': {
    part: 'Size',
    consequence: 'The machine bed cannot hold this size at this gauge.',
    action: 'Choose a smaller size or a finer gauge.',
    target: () => 'fit.head',
  },
  'beanie-width-invalid': {
    part: 'Size',
    consequence: 'The crown cannot be planned at this width, so nothing can be knitted.',
    action: 'Apply the offered width.',
    target: () => 'fit.head',
  },
  'project-beanie-width': {
    part: 'Size',
    consequence: 'The crown cannot be knitted at this width, so no program is produced.',
    action: 'Apply the offered width under Size.',
    target: () => 'fit.head',
  },
  'cuff-off-target': {
    part: 'Cuff',
    consequence: 'The cuff would knit to a different height than the one asked for.',
    action: 'Apply the offered cuff rows; the body and motifs stay where they are.',
    target: () => 'fit.cuff',
  },
  'placement-size-off': {
    part: 'Motif',
    consequence: 'The motif was converted at another gauge and would knit stretched or squashed.',
    action: 'Refresh the motif from its stored image.',
    target: (finding) => (finding.path?.startsWith('placements/') ? `placement:${finding.path.slice(11)}` : null),
  },
  'project-placement-conflict': {
    part: 'Motif',
    consequence: 'The motif cannot be drawn (it does not fit, or a color maps to no yarn), so it is left out and export is blocked.',
    action: 'Move or shrink the motif, make the piece larger, or fix its color mapping.',
    target: () => 'placements',
  },
  'long-float': {
    part: 'Body colorwork',
    consequence: 'A long strand of yarn would lie behind the work and snag fingers and hair.',
    action: 'Switch the body to a birdseye back, or make the motif bolder or more compact.',
    target: () => 'backing',
  },
  'project-long-carry': {
    part: 'Body colorwork',
    consequence: 'A yarn would run unused up the inside of the hat over many rows.',
    action: 'Switch the body to a birdseye back, or bring the color into the rows between.',
    target: (finding) => finding.path,
  },
  'project-beanie-backing-unsupported': {
    part: 'Body colorwork',
    consequence: 'This backing is not built for beanies, so nothing is knitted.',
    action: 'Choose fairisle or birdseye.',
    target: () => 'backing',
  },
  'project-beanie-colorwork-unsupported': {
    part: 'Cuff',
    consequence: 'The rib cuff knits one yarn; colored stitches in it cannot be knitted.',
    action: 'Keep the cuff rows one color and put colorwork above the cuff.',
    target: () => 'fit.cuff',
  },
  'name-encodes-carrier': {
    part: 'Yarns',
    consequence: 'The yarn name names a different carrier than the one it is loaded on, which invites a loading mistake.',
    action: 'Apply the offered rename.',
    target: () => 'yarns',
  },
};

const MEASUREMENT_RULES = new Set(['gauge-assumed', 'size-needs-gauge']);

export function readinessStory(plan: ProjectPlan, findings: readonly Finding[], readiness: Readiness, verdict: AuthoredPipelineResult['verdict'], trials: readonly ProjectTrial[] = []): ReadinessStory {
  const items: StoryItem[] = findings.filter((finding) => finding.severity !== 'info').map((finding) => {
    const story = RULE_STORIES[finding.rule];
    return {
      part: finding.path === 'object.ribGauge' ? 'Cuff fit' : story?.part ?? (finding.owner === 'compiler' ? 'Machine program' : 'Design'),
      severity: finding.severity,
      owner: finding.owner,
      rule: finding.rule,
      consequence: story?.consequence ?? (finding.owner === 'compiler' ? 'The program generator reported a problem it must fix; this is not something to work around in the design.' : 'The design has a problem the program cannot knit around.'),
      action: story?.action ?? (finding.owner === 'compiler' ? 'Report it; do not knit this program.' : 'Change the design; `studio explain <rule>` describes it.'),
      message: finding.message,
      target: story?.target(finding) ?? (finding.path?.startsWith('rows/') ? finding.path : finding.owner === 'compiler' ? 'program' : null),
      fixes: finding.fixes,
    };
  });
  const physical = verdict.state === 'knit' ? 'physically proven by a registered knit of this exact file' : 'physical knit pending';
  const evidence = verdict.state === 'blocked'
    ? `Blocked · no machine program can be exported · ${physical}`
    : `Software checks passed · ${verdict.label} · ${physical}`;
  let status: StoryStatus;
  let headline: string;
  let detail: string;
  if (verdict.state === 'blocked') {
    status = 'blocked';
    headline = 'Cannot knit yet';
    detail = items.find((item) => item.severity === 'error')?.message ?? verdict.annotation;
  } else if (readiness.ready) {
    status = 'ready';
    headline = 'Ready to knit';
    detail = plan.piece === 'beanie' ? 'Every software check passed and every measurement is recorded as measured.' : 'Every software check passed.';
  } else if (items.every((item) => MEASUREMENT_RULES.has(item.rule))) {
    status = 'needs-measurements';
    headline = 'Fit needs measurements';
    const parts = [...new Set(items.map((item) => (item.target === 'gauge.rib' ? 'rib' : 'body')))];
    const named = parts.join(' and ');
    detail = `${named[0]!.toUpperCase()}${named.slice(1)} gauge${parts.length === 1 ? ' is' : 's are'} assumed. Enter measured ${parts.length === 1 ? 'gauge' : 'gauges'} to check the finished dimensions.`;
  } else {
    status = 'design-issues';
    const design = items.filter((item) => !MEASUREMENT_RULES.has(item.rule));
    headline = `${design.length} design issue${design.length === 1 ? '' : 's'} to resolve`;
    detail = design[0]!.consequence;
  }
  const synthetic = trials.filter((trial) => trial.synthetic);
  const notices = synthetic.length
    ? [`${synthetic.length} recorded trial${synthetic.length === 1 ? ' is' : 's are'} SYNTHETIC (made up to test the software): ${synthetic.length === 1 ? 'its' : 'their'} gauges count as assumed, not measured, and nothing was knitted.`]
    : [];
  return { status, headline, detail, evidence, items, operatorChecks: readiness.operatorChecks, notices };
}

// ---------------------------------------------------------------------------
// Instructions

export function constructionLine(plan: ProjectPlan): string {
  const sections = plan.sections;
  if (sections === null) return `Panel: ${plan.stitches.value} needles (${plan.needles.first}-${plan.needles.last}) × ${plan.rows.value} rows`;
  const cm = (value: { value: number } | null) => (value === null ? '' : ` (${value.value} cm)`);
  return [
    `${plan.stitches.value} needles ${plan.needles.first}–${plan.needles.last}`,
    sections.cuff ? `${sections.cuff.rows}-row 2x2 rib cuff${sections.cuff.folds ? ` folding up to ${sections.cuff.visibleCm?.value ?? '?'} cm` : cm(sections.cuff.knittedCm)}` : null,
    `${sections.body.rows}-row ${sections.body.fabric} body${cm(sections.body.cm)}`,
    sections.crown ? `${sections.crown.rows}-row ${sections.crown.recipe} crown to ${sections.crown.finalStitches} stitches${cm(sections.crown.cm)}` : 'no crown at this width',
    sections.finishedHeightCm ? `finished height about ${sections.finishedHeightCm.value} cm flat` : null,
  ].filter(Boolean).join('; ');
}

export interface CarrierRequirement { carrier: string; role: 'pattern' | 'waste' | 'frame' | 'unassigned'; paletteId: string | null; yarnName: string | null }

export function carrierRequirements(state: ProjectState, result: Pick<AuthoredPipelineResult, 'kcode' | 'compiled'>): CarrierRequirement[] | null {
  const trace = result.kcode?.trace;
  if (trace === null || trace === undefined) return null;
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

function valued(value: Valued<number> | null | undefined): string {
  if (!value) return 'unknown (no gauge)';
  return `${value.provenance === 'assumed' ? '≈ ' : ''}${value.value} cm (${value.how})`;
}

export function instructionsMarkdown(project: ColorworkProjectV1, plan: ProjectPlan, result: AuthoredPipelineResult, findings: readonly Finding[], readiness: Readiness): string {
  const { state, placements } = materializeColorworkProject(project);
  const story = readinessStory(plan, findings, readiness, result.verdict, state.trials ?? []);
  const sections = plan.sections;
  const head = state.object?.headCircumferenceCm;
  const lines = [
    `# ${project.title}`,
    '',
    `**${story.headline}.** ${story.detail}`,
    `${story.evidence}. Program: ${result.kcode?.passCount ?? '?'} passes, KCode SHA-256 \`${result.kcode?.kcHash ?? 'none'}\`.`,
    ...story.notices.map((notice) => `**Notice:** ${notice}`),
    ...(story.items.length ? ['', '## Unresolved', ...story.items.map((item) => `- **${item.part}** (${item.severity}, ${item.owner}): ${item.message} *Consequence:* ${item.consequence} *Next:* ${item.action}`)] : []),
    '',
    '## What it knits',
    plan.piece === 'beanie' ? `Flat beanie, seamed afterwards: ${constructionLine(plan)}.` : `${constructionLine(plan)}.`,
    `Frame: ${result.compiled?.frame?.preset ?? 'unknown'}.`,
    ...(head !== undefined ? [`Fit: ${head} cm head with ${Math.round(Math.abs(state.object?.ease ?? -0.1) * 100)}% ${(state.object?.ease ?? -0.1) < 0 ? 'negative' : 'positive'} ease.`] : []),
    plan.gauge ? `Body gauge: ${plan.gauge.stitchesPer10cm} st / ${plan.gauge.rowsPer10cm} rows per 10 cm (${plan.gauge.source}).` : 'No gauge recorded: sizes in cm are unknown.',
    ...(state.object?.ribGauge ? [`Rib gauge: ${state.object.ribGauge.stitchesPer10cm} st / ${state.object.ribGauge.rowsPer10cm} rows per 10 cm (${state.object.ribGauge.source}).`] : []),
    ...(plan.predicted ? [`${plan.piece === 'beanie' ? 'Finished circumference' : 'Width'}: ${valued(plan.predicted.widthCm)}.`] : []),
    ...(sections ? [
      ...(sections.cuff ? [`Cuff: ${sections.cuff.rows} rows, knitted ${valued(sections.cuff.knittedCm)}${sections.cuff.folds ? `; folds up to ${valued(sections.cuff.visibleCm)}` : ''}.`] : []),
      `Body: ${sections.body.rows} rows of ${sections.body.fabric}, ${valued(sections.body.cm)}.`,
      sections.crown ? `Crown: ${sections.crown.rows} rows, ${sections.crown.recipe}, closing to ${sections.crown.finalStitches} stitches, ${valued(sections.crown.cm)}.` : 'Crown: none at this width.',
      ...(sections.finishedHeightCm ? [`Finished height: ${valued(sections.finishedHeightCm)}.`] : []),
    ] : []),
    ...placements.map((resolved) => motifLine(resolved, plan)),
    '',
    '## Load',
    ...(carrierRequirements(state, result) ?? []).map((item) => `- C${item.carrier}: ${item.role === 'pattern' ? item.yarnName : item.role === 'waste' ? 'waste yarn' : 'draw thread (smooth contrasting yarn, removed afterwards)'}`),
    ...(story.operatorChecks.length ? ['', '## Operator checks', ...story.operatorChecks.map((check) => `- ${check}`)] : []),
    ...((state.trials ?? []).length ? ['', '## Recorded trials', ...state.trials!.map((trial) => `- ${trial.synthetic ? 'SYNTHETIC (software test, not knitted) ' : ''}${trial.outcome} · candidate \`${trial.candidate.kcodeSha256}\` · ${trial.recordedAt.slice(0, 10)}${trial.bodyGauge ? ` · body gauge ${trial.bodyGauge.stitchesPer10cm}/${trial.bodyGauge.rowsPer10cm}` : ''}${trial.ribGauge ? ` · rib gauge ${trial.ribGauge.stitchesPer10cm}/${trial.ribGauge.rowsPer10cm}` : ''}`)] : []),
    '',
    '## After knitting',
    ...plan.finishing.map((step, index) => `${index + 1}. ${step}`),
  ];
  return `${lines.join('\n')}\n`;
}

function motifLine(resolved: ResolvedProjectPlacement, plan: ProjectPlan): string {
  const { placement } = resolved;
  if (resolved.status !== 'placed') return `Motif "${placement.id}": does not fit (${resolved.reason}).`;
  const gauge = plan.gauge;
  const size = gauge ? ` (${(placement.motif.width / (gauge.stitchesPer10cm / 10)).toFixed(1)} × ${(placement.motif.height / (gauge.rowsPer10cm / 10)).toFixed(1)} cm)` : '';
  const above = plan.sections?.cuff ? 'the cuff' : 'the cast-on';
  return `Motif "${placement.id}": ${placement.motif.width} × ${placement.motif.height} stitches${size}, ${placement.x === 'center' ? 'centred on the front' : `from stitch ${placement.x + 1}`}, its lowest stitch ${placement.rowsAboveCuff} chart row${placement.rowsAboveCuff === 1 ? '' : 's'} above ${above}.`;
}

// ---------------------------------------------------------------------------
// Schematic

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cmLabel(value: Valued<number> | null | undefined, rows: number): string {
  if (!value) return `${rows} rows`;
  return `${value.provenance === 'assumed' || value.how.includes('assumed') ? '≈' : ''}${value.value} cm`;
}

/**
 * A dimensioned schematic from the Plan: the flat piece as knitted (cuff with
 * its fold line, body, crown, seam edges, motif) and the finished front with
 * the cuff folded up. Labels marked ≈ rest on an assumed gauge or estimate.
 * Returns null for a panel.
 */
export function schematicSvg(project: ColorworkProjectV1, plan: ProjectPlan): string | null {
  const sections = plan.sections;
  if (sections === null) return null;
  const { state } = materializeColorworkProject(project);
  const gauge = plan.gauge;
  const widthStitches = state.chart.width;
  const cuffRows = sections.cuff?.rows ?? 0;
  const bodyRows = sections.body.rows;
  const crownRows = sections.crown?.rows ?? 0;
  const ribRowsPerCm = state.object?.ribGauge ? state.object.ribGauge.rowsPer10cm / 10 : null;
  const bodyRowsPerCm = gauge ? gauge.rowsPer10cm / 10 : null;
  const stitchesPerCm = gauge ? gauge.stitchesPer10cm / 10 : null;
  // Heights in cm when known, else in rows scaled as if 3.4 rows per cm, so proportions stay readable.
  const cuffH = cuffRows / (ribRowsPerCm ?? bodyRowsPerCm ?? 3.4);
  const bodyH = bodyRows / (bodyRowsPerCm ?? 3.4);
  const crownH = crownRows / (bodyRowsPerCm ?? 3.4);
  const flatW = widthStitches / (stitchesPerCm ?? 2.6);
  const scale = Math.min(330 / flatW, 360 / (cuffH + bodyH + crownH));
  const W = flatW * scale; const cuff = cuffH * scale; const body = bodyH * scale; const crown = crownH * scale;
  const finalW = sections.crown ? (sections.crown.finalStitches / widthStitches) * W : W;
  const x0 = 130; const base = 410;
  const palette = state.chart.palette;
  const main = palette[0]?.hex ?? '#444';
  const parts: string[] = [];
  const text = (x: number, y: number, content: string, anchor = 'middle', size = 12, weight = 400) => parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="currentColor">${escapeXml(content)}</text>`);
  const dimV = (x: number, y1: number, y2: number, label: string) => {
    parts.push(`<path d="M${x} ${y1}V${y2}M${x - 4} ${y1}h8M${x - 4} ${y2}h8" stroke="currentColor" stroke-width="1" fill="none"/>`);
    text(x - 8, (y1 + y2) / 2 + 4, label, 'end', 11);
  };

  // Flat piece, as knitted.
  text(x0 + W / 2, 24, 'Flat piece as knitted, face side up', 'middle', 13, 600);
  const cuffTop = base - cuff; const bodyTop = cuffTop - body; const crownTop = bodyTop - crown;
  if (cuff > 0) {
    parts.push(`<rect x="${x0}" y="${cuffTop}" width="${W}" height="${cuff}" fill="${main}" fill-opacity="0.55" stroke="currentColor"/>`);
    for (let x = x0 + 4; x < x0 + W; x += 6) parts.push(`<path d="M${x.toFixed(1)} ${cuffTop + 2}V${base - 2}" stroke="currentColor" stroke-opacity="0.25"/>`);
    if (sections.cuff?.folds) {
      const fold = base - cuff / 2;
      parts.push(`<path d="M${x0 - 6} ${fold}H${x0 + W + 6}" stroke="#d97706" stroke-dasharray="6 4" stroke-width="1.5"/>`);
      text(x0 + W + 10, fold + 4, 'fold line', 'start', 11);
    }
    dimV(x0 - 8, cuffTop, base, `cuff ${cmLabel(sections.cuff?.knittedCm, cuffRows)}`);
  }
  parts.push(`<rect x="${x0}" y="${bodyTop}" width="${W}" height="${body}" fill="${main}" fill-opacity="0.3" stroke="currentColor"/>`);
  dimV(x0 - 8, bodyTop, cuffTop, `body ${cmLabel(sections.body.cm, bodyRows)}`);
  if (crown > 0) {
    parts.push(`<path d="M${x0} ${bodyTop}L${x0 + (W - finalW) / 2} ${crownTop}H${x0 + (W + finalW) / 2}L${x0 + W} ${bodyTop}Z" fill="${main}" fill-opacity="0.15" stroke="currentColor"/>`);
    for (let line = 0; line < 8; line += 1) {
      const xb = x0 + ((2 * line + 1) / 16) * W; const xt = x0 + (W - finalW) / 2 + ((2 * line + 1) / 16) * finalW;
      parts.push(`<path d="M${xb.toFixed(1)} ${bodyTop}L${xt.toFixed(1)} ${crownTop}" stroke="currentColor" stroke-opacity="0.3" stroke-dasharray="2 3"/>`);
    }
    dimV(x0 - 8, crownTop, bodyTop, `crown ${cmLabel(sections.crown?.cm, crownRows)}`);
    text(x0 + W / 2, crownTop - 6, `gathered: ${sections.crown?.finalStitches} live stitches`, 'middle', 11);
  }
  // Seam edges.
  for (const x of [x0, x0 + W]) parts.push(`<path d="M${x} ${crownTop + (x === x0 ? 0 : 0)}V${base}" stroke="#2563eb" stroke-width="3" stroke-opacity="0.7"/>`);
  text(x0 + W + 4, base - cuff - body / 2, 'seam', 'start', 11);
  const widthLabel = plan.predicted ? `${plan.predicted.widthCm.provenance === 'assumed' || gauge?.source === 'assumed' ? '≈' : ''}${plan.predicted.widthCm.value} cm finished circumference` : `${widthStitches} needles`;
  parts.push(`<path d="M${x0} ${base + 14}H${x0 + W}M${x0} ${base + 10}v8M${x0 + W} ${base + 10}v8" stroke="currentColor"/>`);
  text(x0 + W / 2, base + 30, `${widthStitches} needles · ${widthLabel}`, 'middle', 11);

  // Body colorwork from the materialized chart (painted stitches and placed motifs alike), merged into runs.
  const bodyUnitH = body / bodyRows;
  const birdseyeStart = sections.body.rows - sections.body.chartRows > 0 ? 2 : 0;
  const ground = state.chart.cells[state.chart.height - 1]?.[0] ?? 0;
  const drawBody = (originX: number, originBottom: number, unitW: number, fromColumn: number, toColumn: number) => {
    for (let knitRow = cuffRows; knitRow < state.chart.height; knitRow += 1) {
      const cells = state.chart.cells[state.chart.height - 1 - knitRow]!;
      const y = originBottom - (knitRow - cuffRows + birdseyeStart + 1) * bodyUnitH;
      for (let column = fromColumn; column < toColumn;) {
        const color = cells[column]!;
        let end = column + 1;
        while (end < toColumn && cells[end] === color) end += 1;
        if (color !== ground) parts.push(`<rect x="${(originX + (column - fromColumn) * unitW).toFixed(2)}" y="${y.toFixed(2)}" width="${((end - column) * unitW + 0.05).toFixed(2)}" height="${(bodyUnitH + 0.05).toFixed(2)}" fill="${palette[color]?.hex ?? '#fff'}"/>`);
        column = end;
      }
    }
  };
  drawBody(x0, base - cuff, W / widthStitches, 0, widthStitches);

  // Finished front view: the seam at the back, the cuff folded up.
  const fx = 640; const fW = W / 2;
  const visibleCuff = sections.cuff ? (sections.cuff.folds ? cuff / 2 : cuff) : 0;
  const fBase = base; const fCuffTop = fBase - visibleCuff; const fBodyTop = fCuffTop - body; const fCrownTop = fBodyTop - crown * 0.7;
  text(fx + fW / 2, 24, 'Finished, front view', 'middle', 13, 600);
  parts.push(`<path d="M${fx} ${fBase}V${fBodyTop}C${fx} ${fCrownTop - 4} ${fx + fW} ${fCrownTop - 4} ${fx + fW} ${fBodyTop}V${fBase}Z" fill="${main}" fill-opacity="0.3" stroke="currentColor"/>`);
  if (visibleCuff > 0) {
    parts.push(`<rect x="${fx}" y="${fCuffTop}" width="${fW}" height="${visibleCuff}" fill="${main}" fill-opacity="0.55" stroke="currentColor"/>`);
    dimV(fx - 8, fCuffTop, fBase, `${sections.cuff?.folds ? 'folded cuff' : 'cuff'} ${cmLabel(sections.cuff?.visibleCm, cuffRows)}`);
  }
  dimV(fx - 8, fBodyTop, fCuffTop, `body ${cmLabel(sections.body.cm, bodyRows)}`);
  // The front is the middle half of the piece (the seam is at the back); only it is visible here.
  const frontStart = Math.floor(widthStitches / 4);
  const frontEnd = frontStart + Math.round(widthStitches / 2);
  drawBody(fx, fCuffTop, fW / (frontEnd - frontStart), frontStart, frontEnd);
  parts.push(`<path d="M${fx} ${fBase + 14}H${fx + fW}M${fx} ${fBase + 10}v8M${fx + fW} ${fBase + 10}v8" stroke="currentColor"/>`);
  text(fx + fW / 2, fBase + 30, plan.predicted ? `${cmLabel(plan.predicted.widthCm, 0)} around ÷ 2 = ${(plan.predicted.widthCm.value / 2).toFixed(1)} cm flat` : 'width unknown (no gauge)', 'middle', 11);
  if (sections.finishedHeightCm) text(fx + fW / 2, fBase + 46, `height ${cmLabel(sections.finishedHeightCm, 0)} flat, before gathering the crown`, 'middle', 11);
  const assumed = gauge?.source === 'assumed' || state.object?.ribGauge?.source === 'assumed';
  text(450, 474, assumed ? '≈ marks values from an assumed gauge or an estimate; measure a swatch to confirm.' : '≈ marks estimates (the crown uses the body gauge).', 'middle', 11);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 486" width="900" height="486" role="img" aria-label="Dimensioned schematic of ${escapeXml(project.title)}" style="color:#1f2937;background:#fff;font-family:system-ui,sans-serif">${parts.join('')}</svg>`;
}

// ---------------------------------------------------------------------------
// Measurement form and package

export interface PredictedCm { circumference: number | null; cuffVisible: number | null; body: number | null; crown: number | null; total: number | null }

export interface MeasurementRecord {
  kind: 'kniterate-studio-measurements';
  schemaVersion: 1;
  /** The knitted candidate, with what its plan predicted (so later drafts never change the comparison). */
  candidate: { kcodeSha256: string; label: string; predictedCm?: PredictedCm };
  /** True only for made-up values used to test software; never for a real knit. */
  synthetic: boolean;
  outcome: 'clean' | 'issues' | 'failed' | null;
  bodyGauge: { stitchesPer10cm: number | null; rowsPer10cm: number | null };
  ribGauge: { stitchesPer10cm: number | null; rowsPer10cm: number | null };
  finishedCm: { circumference: number | null; cuffVisible: number | null; body: number | null; crown: number | null; total: number | null };
  notes: string;
}

/** What a plan predicts for the measurements a knitter returns. */
export function predictedCm(plan: ProjectPlan): PredictedCm {
  return {
    circumference: plan.predicted?.widthCm.value ?? null,
    cuffVisible: plan.sections?.cuff?.visibleCm?.value ?? null,
    body: plan.sections?.body.cm?.value ?? null,
    crown: plan.sections?.crown?.cm?.value ?? null,
    total: plan.sections?.finishedHeightCm?.value ?? null,
  };
}

export function measurementTemplate(project: ColorworkProjectV1, kcodeSha256: string, plan?: ProjectPlan): MeasurementRecord {
  return {
    kind: 'kniterate-studio-measurements',
    schemaVersion: 1,
    candidate: { kcodeSha256, label: project.title, ...(plan ? { predictedCm: predictedCm(plan) } : {}) },
    synthetic: false,
    outcome: null,
    bodyGauge: { stitchesPer10cm: null, rowsPer10cm: null },
    ribGauge: { stitchesPer10cm: null, rowsPer10cm: null },
    finishedCm: { circumference: null, cuffVisible: null, body: null, crown: null, total: null },
    notes: '',
  };
}

export function measurementFormMarkdown(project: ColorworkProjectV1, plan: ProjectPlan, kcodeSha256: string): string {
  const sections = plan.sections;
  const predicted = (value: Valued<number> | null | undefined) => (value ? `${value.provenance === 'assumed' ? '≈' : ''}${value.value} cm` : '—');
  return `${[
    `# Measurement form: ${project.title}`,
    '',
    `Candidate: KCode SHA-256 \`${kcodeSha256}\`. Measure only the piece knitted from this exact file.`,
    'After finishing (draw thread out, seamed, folded, washed or steamed as the label says, dried flat, rested 24 h), lay it flat without tension and use a rigid rule. Fill `measurements.json` with the same values and record it with `pnpm studio -- measure <project.json> measurements.json`.',
    '',
    '| Measure | How | Predicted | Measured |',
    '|---|---|---|---|',
    '| Body gauge | stitches and rows over 10 cm in a plain area of the body, face side | — | ___ st / ___ rows |',
    ...(sections?.cuff ? ['| Rib gauge | stitches and rows over 10 cm in the cuff, unstretched | — | ___ st / ___ rows |'] : []),
    `| Circumference | flat width at mid-body × 2, after seaming | ${predicted(plan.predicted?.widthCm)} | ___ cm |`,
    ...(sections?.cuff ? [`| Cuff | visible height${sections.cuff.folds ? ' when folded' : ''} | ${predicted(sections.cuff.visibleCm)} | ___ cm |`] : []),
    ...(sections ? [
      `| Body | cuff top to the first crown decrease | ${predicted(sections.body.cm)} | ___ cm |`,
      `| Crown | first decrease to the top, along the knitting | ${predicted(sections.crown?.cm)} | ___ cm |`,
      `| Total | brim to top, flat | ${predicted(sections.finishedHeightCm)} | ___ cm |`,
    ] : []),
    '',
    'Also: outcome (clean / issues / failed), every machine stop and what was done, and photographs of the front, the inside, the crown and any defect with a ruler in frame.',
  ].join('\n')}\n`;
}

export interface HandoffManifest {
  kind: 'kniterate-studio-handoff';
  schemaVersion: 1;
  title: string;
  projectId: string;
  historyCursor: number;
  identity: { kcodeSha256: string; compileHash: string | null; passCount: number };
  verdict: string;
  readiness: { ready: boolean; headline: string; evidence: string; unresolved: { part: string; rule: string; severity: string }[]; notices: string[] };
  /** The candidate: these files are immutable, and registration checks each hash. */
  files: Record<string, string>;
  /** Forms the knitter fills in and returns; not hashed, never part of the candidate. */
  forms: string[];
  trials: { candidate: string; synthetic: boolean; outcome: string; recordedAt: string }[];
}

/**
 * The package a person takes to the machine: the editable project, the exact
 * program, the instructions, previews, unresolved checks and the measurement
 * form. `extra` holds environment-made files (a chart PNG). The manifest lists
 * each file's SHA-256, computed by the caller's `sha256`.
 */
export async function handoffFiles(input: {
  project: ColorworkProjectV1;
  serializedProject: string;
  plan: ProjectPlan;
  result: AuthoredPipelineResult;
  findings: readonly Finding[];
  readiness: Readiness;
  extra?: Record<string, string | Uint8Array>;
  sha256: (bytes: string | Uint8Array) => Promise<string>;
}): Promise<Record<string, string | Uint8Array>> {
  const { project, plan, result, findings, readiness } = input;
  if (!result.exportReady || result.kcode === null || result.compiled?.knitoutText == null) throw new Error('Only a project with an exportable program can be packaged.');
  const { state } = materializeColorworkProject(project);
  const story = readinessStory(plan, findings, readiness, result.verdict, state.trials ?? []);
  const svg = schematicSvg(project, plan);
  const files: Record<string, string | Uint8Array> = {
    'project.kniterate-studio.json': input.serializedProject,
    'program.k': result.compiled.knitoutText,
    'program.kc': result.kcode.kcText,
    'instructions.md': instructionsMarkdown(project, plan, result, findings, readiness),
    'measurement-form.md': measurementFormMarkdown(project, plan, result.kcode.kcHash),
    'measurements.json': `${JSON.stringify(measurementTemplate(project, result.kcode.kcHash, plan), null, 2)}\n`,
    ...(svg ? { 'schematic.svg': svg } : {}),
    ...input.extra,
  };
  const forms = ['measurement-form.md', 'measurements.json'];
  const hashes: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files)) if (!forms.includes(name)) hashes[name] = await input.sha256(bytes);
  const manifest: HandoffManifest = {
    kind: 'kniterate-studio-handoff',
    schemaVersion: 1,
    title: project.title,
    projectId: project.id,
    historyCursor: project.history.cursor,
    identity: { kcodeSha256: result.kcode.kcHash, compileHash: result.compiled.inputHash, passCount: result.kcode.passCount },
    verdict: result.verdict.label,
    readiness: { ready: readiness.ready, headline: story.headline, evidence: story.evidence, unresolved: story.items.map(({ part, rule, severity }) => ({ part, rule, severity })), notices: story.notices },
    files: hashes,
    forms,
    trials: (state.trials ?? []).map((trial) => ({ candidate: trial.candidate.kcodeSha256, synthetic: trial.synthetic, outcome: trial.outcome, recordedAt: trial.recordedAt })),
  };
  return { ...files, 'manifest.json': `${JSON.stringify(manifest, null, 2)}\n` };
}
