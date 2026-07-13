import { appendProjectEdit, materializeColorworkProject, type ColorworkProjectV1, type ProjectState } from '@kniterate-studio/project-contract';
import {
  compileToRunArtifact,
  projectColorworkChartV1,
  projectBackFaceFromArtifact,
  type BackFaceProjection,
  type PredictedPass,
  type ValidationMessage,
  type YarnBinding,
} from '@kniterate-studio/machine-lib/browser';

export type CompileVerdict = 'blocked' | 'surface';
export type BackingTechnique = ProjectState['strategy']['technique'];

export interface StrategyComparison {
  technique: BackingTechnique;
  compileVerdict: CompileVerdict;
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
  inputHash: string | null;
  messages: readonly ValidationMessage[];
  knitoutText: string | null;
  passes: readonly PredictedPass[];
  rowProvenance: readonly {
    rowId: string;
    chartRow: number;
    displayRow: number;
    passIndices: readonly number[];
  }[];
  backFace: BackFaceProjection | null;
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

export function compileColorworkProject(project: ColorworkProjectV1): BlanketCompileArtifact {
  const { state, overrides } = materializeColorworkProject(project);
  const usedPaletteIndexes = new Set(state.chart.cells.flat());
  const usedPalette = state.chart.palette.filter((_entry, index) => usedPaletteIndexes.has(index));
  const assignments = new Map(state.machine.yarnAssignments.map((assignment) => [assignment.paletteId, assignment]));
  const setupMessages: ValidationMessage[] = [];

  if (usedPalette.length > 4) setupMessages.push(setupError('project-pattern-color-limit', `This chart uses ${usedPalette.length} pattern colors; Kniterate Studio v1 supports at most four on reserved carriers C2-C5.`));
  for (const entry of usedPalette) {
    if (!assignments.has(entry.id)) setupMessages.push(setupError('project-yarn-assignment-required', `${entry.name} is used by the chart but has no pattern carrier assignment.`));
  }
  if (state.strategy.technique === 'complement' && usedPalette.length !== 2) setupMessages.push(setupError('project-complement-two-colors', `Complement backing requires exactly two used colors; this chart uses ${usedPalette.length}.`));
  for (const resolved of overrides) {
    if (resolved.status === 'quarantined') setupMessages.push(setupError('project-override-quarantined', resolved.reason ?? `Override ${resolved.override.id} is quarantined.`));
  }

  const base = {
    revision: projectRevision(project),
    technique: state.strategy.technique,
    stats: {
      designRows: state.chart.height,
      needles: state.chart.width,
      patternColors: usedPalette.length,
      passCount: 0,
      opCount: 0,
      estimatedKnitTimeSeconds: null,
    },
  };
  if (setupMessages.length > 0) return { ...base, ok: false, compileVerdict: 'blocked', inputHash: null, messages: setupMessages, knitoutText: null, passes: [], rowProvenance: [], backFace: null, diagnostics: setupMessages.map((message) => ({ ...message, opIndex: null, rowId: null, passIndices: [] })) };

  const projected = projectColorworkChartV1(state.chart);
  const yarnBindings: YarnBinding[] = usedPalette.map((entry) => {
    const assignment = assignments.get(entry.id)!;
    return { keyId: entry.id, carrier: assignment.carrier, name: assignment.yarnName };
  });
  const backBedStyle = state.strategy.technique === 'fairisle' ? 'floats'
    : state.strategy.technique === 'ladder-back' ? 'ladder'
    : state.strategy.technique === 'lined' ? 'lined'
    : 'birdseye';
  const artifact = compileToRunArtifact({
    chart: projected.chart,
    keyPalette: projected.palette,
    yarnBindings,
    needleOffset: state.machine.needleOffset,
    wastePasses: state.frame.wasteRows,
    wasteCarrierOverride: '6',
    drawCarrierOverride: state.frame.drawThread ? '1' : 'none',
    bindOff: state.frame.bindOff,
    backBedStyle,
    ...(state.strategy.technique === 'complement' ? { dbjBackingStrategy: 'complement' as const } : {}),
    ...(state.strategy.technique === 'birdseye' ? { birdseyeMode: state.strategy.birdseyeMode ?? 'minimal' } : {}),
    ...(state.strategy.technique === 'fairisle' ? { floatPolicy: { mode: 'warn-above' as const, threshold: state.strategy.floatLimit } } : {}),
  });
  const messages = [...artifact.chartMessages, ...artifact.programMessages, ...artifact.bedStateMessages, ...artifact.carriageMessages];
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
    ok: artifact.ok,
    compileVerdict: artifact.ok ? 'surface' : 'blocked',
    inputHash: artifact.inputHash,
    messages,
    knitoutText: artifact.knitoutText,
    passes: artifact.predictedPasses,
    rowProvenance,
    backFace: projectBackFaceFromArtifact(artifact, state.chart, yarnBindings, state.machine.needleOffset),
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
