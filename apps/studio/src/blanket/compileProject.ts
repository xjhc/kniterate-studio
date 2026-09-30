import {
  appendProjectEdit,
  assessAuthoredCapacityV1,
  materializeColorworkProject,
  observeAuthoredCapacityV1,
  type AuthoredCapacitySupportedV1,
  type AuthoredCapacityV1,
  type ColorworkProjectV1,
  type ResolvedProjectOverride,
  type ProjectState,
} from '@kniterate-studio/project-contract';
import {
  CUSTOMIST_MATCHED_PRESETS_V1,
  CUSTOMIST_RIB_CROWN_WIDTH,
  buildCustomistMatchedCompileInputV1,
  buildCustomistRibBeanie,
  computeInputHash,
  parseKnitoutProgram,
  writeKnitoutProgram,
  compileToRunArtifact,
  projectColorworkChartV1,
  projectBackFaceFromArtifact,
  type BackFaceProjection,
  type PredictedPass,
  type ValidationMessage,
  type YarnBinding,
} from '@kniterate-studio/machine-lib/browser';

export type CompileVerdict = 'blocked' | 'surface';

export interface CompiledFrame {
  preset: string;
  reference: string;
  wastePasses: number | null;
  wasteCarrier: string | null;
  drawCarrier: string | null;
  bindOff: string | null;
  /** Carriers the program brings in beyond the pattern yarns and waste (for example a Customist draw/cameo yarn). */
  frameCarriers: string[];
}

/** Backings Studio authors: each compiles through a Customist-matched configuration. */
export const AUTHORED_TECHNIQUES = ['fairisle', 'birdseye'] as const satisfies readonly BackingTechnique[];

function isAuthoredTechnique(technique: BackingTechnique): technique is (typeof AUTHORED_TECHNIQUES)[number] {
  return (AUTHORED_TECHNIQUES as readonly BackingTechnique[]).includes(technique);
}
export type BackingTechnique = ProjectState['strategy']['technique'];

export interface StrategyComparison {
  technique: BackingTechnique;
  compileVerdict: CompileVerdict;
  capacity: AuthoredCapacityV1;
  passCount: number;
  estimatedKnitTimeSeconds: number | null;
  backFace: BackFaceProjection | null;
  blockingMessage: string | null;
}

export interface BlanketCompileArtifact {
  revision: string;
  technique: BackingTechnique;
  ok: boolean;
  compileVerdict: CompileVerdict;
  capacity: AuthoredCapacityV1;
  inputHash: string | null;
  messages: readonly ValidationMessage[];
  knitoutText: string | null;
  passes: readonly PredictedPass[];
  /** Source design rows aligned one-to-one with serialized Knitout operations. */
  programOpSourceRows: readonly (readonly number[] | null)[];
  rowProvenance: readonly {
    rowId: string;
    chartRow: number;
    machineRow: number;
    displayRow: number;
    passIndices: readonly number[];
  }[];
  backFace: BackFaceProjection | null;
  /** Frame and settings source. Studio compiles only through configurations matched to a captured Customist program. */
  frame: CompiledFrame | null;
  diagnostics: readonly {
    severity: ValidationMessage['severity'];
    rule: string;
    message: string;
    opIndex: number | null;
    rowId: string | null;
    passIndices: readonly number[];
  }[];
  stats: {
    designRows: number;
    needles: number;
    patternColors: number;
    passCount: number;
    opCount: number;
    estimatedKnitTimeSeconds: number | null;
  };
}

function projectRevision(project: ColorworkProjectV1): string {
  return `${project.id}:${project.history.cursor}:${project.history.entries.length}`;
}

function setupError(rule: string, message: string): ValidationMessage {
  return { severity: 'error', rule, message };
}

function sourceRecordCount(source: string): number {
  let records = 1;
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 0x0a) records++;
  }
  return records;
}

export function compileColorworkProject(project: ColorworkProjectV1): BlanketCompileArtifact {
  const capacity = assessAuthoredCapacityV1(project);
  const preflightBase = {
    revision: projectRevision(project),
    technique: capacity.project.technique,
    capacity,
    stats: {
      designRows: capacity.project.height,
      needles: capacity.project.width,
      patternColors: Math.min(4, capacity.project.activeColors),
      passCount: 0,
      opCount: 0,
      estimatedKnitTimeSeconds: null,
    },
  };
  if (capacity.status === 'blocked') {
    const message = setupError(capacity.rule, capacity.message);
    return {
      ...preflightBase,
      ok: false,
      compileVerdict: 'blocked',
      inputHash: null,
      messages: [message],
      knitoutText: null,
      passes: [],
      programOpSourceRows: [],
      rowProvenance: [],
      backFace: null,
      frame: null,
      diagnostics: [{ ...message, opIndex: null, rowId: null, passIndices: [] }],
    };
  }
  const { state, overrides } = materializeColorworkProject(project);
  if (state.object?.kind === 'beanie') return compileBeanieProject(project, state, overrides, capacity as AuthoredCapacitySupportedV1);
  const usedPaletteIndexes = new Set(state.chart.cells.flat());
  const usedPalette = state.chart.palette.filter((_entry, index) => usedPaletteIndexes.has(index));
  const assignments = new Map(state.machine.yarnAssignments.map((assignment) => [assignment.paletteId, assignment]));
  const setupMessages: ValidationMessage[] = [];

  if (!isAuthoredTechnique(state.strategy.technique)) setupMessages.push(setupError('project-technique-unmatched', `The ${state.strategy.technique} backing has no Customist-matched reference program yet; choose Fairisle or Birdseye.`));
  if (usedPalette.length > 4) setupMessages.push(setupError('project-pattern-color-limit', `This chart uses ${usedPalette.length} pattern colors; Kniterate Studio v1 supports at most four on reserved carriers C2-C5.`));
  for (const entry of usedPalette) {
    if (!assignments.has(entry.id)) setupMessages.push(setupError('project-yarn-assignment-required', `${entry.name} is used by the chart but has no pattern carrier assignment.`));
  }
  for (const resolved of overrides) {
    if (resolved.status === 'quarantined') setupMessages.push(setupError('project-override-quarantined', resolved.reason ?? `Override ${resolved.override.id} is quarantined.`));
    // The compiler does not consume overrides yet; refuse rather than export
    // output that silently omits recorded intent.
    else setupMessages.push(setupError('project-override-unsupported', `Override ${resolved.override.id} (${resolved.override.kind}) cannot be compiled yet; remove it to export.`));
  }

  const base = {
    revision: projectRevision(project),
    technique: state.strategy.technique,
    capacity,
    stats: {
      designRows: state.chart.height,
      needles: state.chart.width,
      patternColors: usedPalette.length,
      passCount: 0,
      opCount: 0,
      estimatedKnitTimeSeconds: null,
    },
  };
  if (setupMessages.length > 0 || !isAuthoredTechnique(state.strategy.technique)) return { ...base, ok: false, compileVerdict: 'blocked', inputHash: null, messages: setupMessages, knitoutText: null, passes: [], programOpSourceRows: [], rowProvenance: [], backFace: null, frame: null, diagnostics: setupMessages.map((message) => ({ ...message, opIndex: null, rowId: null, passIndices: [] })) };

  const projected = projectColorworkChartV1(state.chart);
  const yarnBindings: YarnBinding[] = usedPalette.map((entry) => {
    const assignment = assignments.get(entry.id)!;
    return { keyId: entry.id, carrier: assignment.carrier, name: assignment.yarnName };
  });
  // A single-color chart has no backing: it knits plain jersey inside the
  // Customist fairisle frame whichever backing is selected.
  const technique = usedPalette.length < 2 ? 'fairisle' : state.strategy.technique;
  const input = buildCustomistMatchedCompileInputV1({
    technique,
    chart: projected.chart,
    keyPalette: projected.palette,
    yarnBindings,
    needleOffset: state.machine.needleOffset,
    ...(technique === 'fairisle' ? { floatPolicy: { mode: 'warn-above' as const, threshold: state.strategy.floatLimit } } : {}),
  });
  const artifact = compileToRunArtifact(input);
  const frame: CompiledFrame = {
    preset: CUSTOMIST_MATCHED_PRESETS_V1[technique].id,
    reference: CUSTOMIST_MATCHED_PRESETS_V1[technique].reference,
    wastePasses: input.wastePasses ?? null,
    wasteCarrier: input.wasteCarrierOverride ?? null,
    drawCarrier: input.drawCarrierOverride === undefined || input.drawCarrierOverride === 'none' ? null : input.drawCarrierOverride,
    bindOff: input.bindOff ?? null,
    frameCarriers: [],
  };
  // Machine safety: every carrier the program brings in must carry a declared
  // yarn (an assigned pattern yarn, the waste, or the preset's frame yarn).
  // A legal program that knits an unassigned carrier would pass every KCode
  // check yet knit with no yarn loaded.
  const carrierMessages: ValidationMessage[] = [];
  if (artifact.knitoutText !== null) {
    const patternCarriers = new Set<string>(yarnBindings.map((binding) => binding.carrier));
    const presetFrameCarriers = new Set<string>(CUSTOMIST_MATCHED_PRESETS_V1[technique].frameCarriers);
    const introduced = new Set<string>();
    for (const match of artifact.knitoutText.matchAll(/^in ([1-6](?: [1-6])*)$/gm)) {
      for (const carrier of match[1]!.split(' ')) introduced.add(carrier);
    }
    const extra = [...introduced].filter((carrier) => !patternCarriers.has(carrier) && carrier !== frame.wasteCarrier).sort();
    frame.frameCarriers = extra.filter((carrier) => presetFrameCarriers.has(carrier));
    const unassigned = extra.filter((carrier) => !presetFrameCarriers.has(carrier));
    if (unassigned.length > 0) {
      carrierMessages.push(setupError('project-unassigned-carrier', `The compiled ${technique} program uses ${unassigned.map((carrier) => `C${carrier}`).join(', ')}, which ${unassigned.length === 1 ? 'has' : 'have'} no yarn assigned.${technique === 'birdseye' ? ' The Customist-matched birdseye program is laid out for four colors on C2-C5; use four colors or Fairisle.' : ''}`));
    }
  }
  const exactCapacity = artifact.knitoutText === null
    ? capacity
    : observeAuthoredCapacityV1(capacity, { knitoutRecords: sourceRecordCount(artifact.knitoutText) });
  const capacityMessages = exactCapacity.status === 'blocked'
    ? [setupError(exactCapacity.rule, exactCapacity.message)]
    : [];
  const messages = [...artifact.chartMessages, ...artifact.programMessages, ...artifact.bedStateMessages, ...artifact.carriageMessages, ...capacityMessages, ...carrierMessages];
  const compileOk = artifact.ok && exactCapacity.status === 'supported' && carrierMessages.length === 0;
  const passIndicesByMachineRow = new Map<number, number[]>();
  artifact.predictedPasses.forEach((pass, passIndex) => {
    for (const machineRow of pass.sourceRows ?? []) {
      const indices = passIndicesByMachineRow.get(machineRow) ?? [];
      indices.push(passIndex);
      passIndicesByMachineRow.set(machineRow, indices);
    }
  });
  const rowProvenance = state.rowIds.map((rowId, chartRow) => {
    const machineRow = state.chart.height - chartRow - 1;
    return {
      rowId,
      chartRow,
      machineRow,
      displayRow: state.chart.rowNumbering === 'bottom-up' ? state.chart.height - chartRow : chartRow + 1,
      passIndices: passIndicesByMachineRow.get(machineRow) ?? [],
    };
  });
  const diagnostics = messages.map((message) => {
    const sourceRows = message.opIndex === undefined ? null : artifact.programOpSourceRows[message.opIndex] ?? null;
    const machineRow = sourceRows?.length === 1 ? sourceRows[0]! : null;
    const provenance = machineRow === null ? undefined : rowProvenance[state.chart.height - machineRow - 1];
    return { severity: message.severity, rule: message.rule, message: message.message, opIndex: message.opIndex ?? null, rowId: provenance?.rowId ?? null, passIndices: provenance?.passIndices ?? [] };
  });
  return {
    ...base,
    capacity: exactCapacity,
    ok: compileOk,
    compileVerdict: compileOk ? 'surface' : 'blocked',
    inputHash: compileOk ? artifact.inputHash : null,
    messages,
    knitoutText: compileOk ? artifact.knitoutText : null,
    passes: artifact.predictedPasses,
    programOpSourceRows: artifact.programOpSourceRows,
    rowProvenance,
    backFace: projectBackFaceFromArtifact(artifact, state.chart, yarnBindings, state.machine.needleOffset),
    frame,
    diagnostics,
    stats: {
      ...base.stats,
      passCount: artifact.predictedPasses.length,
      opCount: artifact.program?.ops.length ?? 0,
      estimatedKnitTimeSeconds: artifact.plan?.estimatedKnitTimeSeconds ?? null,
    },
  };
}

export function strategyComparisonFromArtifact(artifact: BlanketCompileArtifact): StrategyComparison {
  return {
    technique: artifact.technique,
    compileVerdict: artifact.compileVerdict,
    capacity: artifact.capacity,
    passCount: artifact.stats.passCount,
    estimatedKnitTimeSeconds: artifact.stats.estimatedKnitTimeSeconds,
    backFace: artifact.backFace,
    blockingMessage: artifact.messages.find((message) => message.severity === 'error')?.message ?? null,
  };
}

export function projectWithPreviewStrategy(project: ColorworkProjectV1, technique: BackingTechnique): ColorworkProjectV1 {
  const current = materializeColorworkProject(project).state.strategy;
  if (current.technique === technique) return project;
  let id = `preview_strategy_${technique.replace(/-/g, '_')}`;
  while (project.history.entries.some((entry) => entry.id === id)) id += '_';
  return appendProjectEdit(project, { id, source: 'system', edit: { kind: 'set-strategy', strategy: { ...current, technique } } });
}

/** Width limits of the flat 2×2 rib beanie: the eight-line crown needs 60, the bed and carrier parking allow 244. */
export const BEANIE_WIDTH_LIMITS = { min: 60, max: 244 } as const;

/**
 * A beanie project: the chart is the rib body (width = needles, height = rib
 * rows, one color); the construction supplies Customist's frame, the crown,
 * and the knit-off. At the reference width the crown is Customist's own.
 */
function compileBeanieProject(
  project: ColorworkProjectV1,
  state: ProjectState,
  overrides: readonly ResolvedProjectOverride[],
  capacity: AuthoredCapacitySupportedV1,
): BlanketCompileArtifact {
  const width = state.chart.width;
  const rows = state.chart.height;
  const usedPaletteIndexes = [...new Set(state.chart.cells.flat())];
  const yarn = state.chart.palette[usedPaletteIndexes[0] ?? 0]!;
  const assignment = state.machine.yarnAssignments.find((item) => item.paletteId === yarn.id);
  const setupMessages: ValidationMessage[] = [];
  if (usedPaletteIndexes.length > 1) setupMessages.push(setupError('project-beanie-colorwork-unsupported', `This beanie's rib body uses ${usedPaletteIndexes.length} colors; the flat 2x2 rib beanie knits one yarn (motifs are not supported yet).`));
  if (assignment === undefined) setupMessages.push(setupError('project-yarn-assignment-required', `${yarn.name} is the beanie's yarn but has no carrier assignment.`));
  if (width % 2 !== 0 || width < BEANIE_WIDTH_LIMITS.min || width > BEANIE_WIDTH_LIMITS.max) setupMessages.push(setupError('project-beanie-width', `The flat 2x2 rib beanie needs an even width from ${BEANIE_WIDTH_LIMITS.min} to ${BEANIE_WIDTH_LIMITS.max} needles; this one has ${width}.`));
  for (const resolved of overrides) setupMessages.push(setupError(resolved.status === 'quarantined' ? 'project-override-quarantined' : 'project-override-unsupported', resolved.reason ?? `Override ${resolved.override.id} cannot be compiled for a beanie; remove it to export.`));
  const crown = width === CUSTOMIST_RIB_CROWN_WIDTH ? 'customist-194' as const : 'eight-line' as const;
  const frame: CompiledFrame = {
    preset: `customist-2x2-rib-beanie@1 (${crown} crown)`,
    reference: 'reference/2x2-rib-beanie.kc',
    wastePasses: 81,
    wasteCarrier: '6',
    drawCarrier: '1',
    bindOff: 'knit-off (top gathered by hand)',
    frameCarriers: ['1'],
  };
  const base = {
    revision: projectRevision(project),
    technique: state.strategy.technique,
    capacity,
    rowProvenance: [],
    backFace: null,
    frame,
    stats: { designRows: rows, needles: width, patternColors: 1, passCount: 0, opCount: 0, estimatedKnitTimeSeconds: null },
  };
  if (setupMessages.length > 0) {
    return { ...base, ok: false, compileVerdict: 'blocked', inputHash: null, messages: setupMessages, knitoutText: null, passes: [], programOpSourceRows: [], diagnostics: setupMessages.map((message) => ({ ...message, opIndex: null, rowId: null, passIndices: [] })) };
  }
  const input = { needleStart: state.machine.needleOffset, needleEnd: state.machine.needleOffset + width - 1, bodyCarrier: assignment!.carrier, wasteCarrier: '6', drawCarrier: '1', ribRows: rows, crown } as const;
  const built = buildCustomistRibBeanie(input);
  const knitoutText = writeKnitoutProgram(built.program);
  const parsed = parseKnitoutProgram(knitoutText);
  const exactCapacity = observeAuthoredCapacityV1(capacity, { knitoutRecords: sourceRecordCount(knitoutText) });
  const capacityMessages = exactCapacity.status === 'blocked' ? [setupError(exactCapacity.rule, exactCapacity.message)] : [];
  const ok = capacityMessages.length === 0;
  return {
    ...base,
    capacity: exactCapacity,
    ok,
    compileVerdict: ok ? 'surface' : 'blocked',
    inputHash: ok ? computeInputHash({ construction: 'customist-2x2-rib-beanie@1', ...input }) : null,
    messages: capacityMessages,
    knitoutText: ok ? knitoutText : null,
    passes: built.predictedPasses,
    // The beanie has no chart-row provenance: every operation belongs to the construction.
    programOpSourceRows: parsed.opLines.map(() => null),
    diagnostics: capacityMessages.map((message) => ({ ...message, opIndex: null, rowId: null, passIndices: [] })),
    stats: { ...base.stats, passCount: built.predictedPasses.length, opCount: built.program.ops.length },
  };
}
