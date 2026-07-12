import { materializeColorworkProject, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import {
  compileToRunArtifact,
  projectColorworkChartV1,
  type PredictedPass,
  type ValidationMessage,
  type YarnBinding,
} from '@kniterate-studio/machine-lib/browser';

export type AuthoredVerdict = 'blocked' | 'surface';

export interface BlanketCompileArtifact {
  revision: string;
  ok: boolean;
  verdict: AuthoredVerdict;
  inputHash: string | null;
  messages: readonly ValidationMessage[];
  knitoutText: string | null;
  passes: readonly PredictedPass[];
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
    stats: {
      designRows: state.chart.height,
      needles: state.chart.width,
      patternColors: usedPalette.length,
      passCount: 0,
      opCount: 0,
      estimatedKnitTimeSeconds: null,
    },
  };
  if (setupMessages.length > 0) return { ...base, ok: false, verdict: 'blocked', inputHash: null, messages: setupMessages, knitoutText: null, passes: [] };

  const projected = projectColorworkChartV1(state.chart);
  const yarnBindings: YarnBinding[] = usedPalette.map((entry) => {
    const assignment = assignments.get(entry.id)!;
    return { keyId: entry.id, carrier: assignment.carrier, name: assignment.yarnName };
  });
  const backBedStyle = state.strategy.technique === 'fairisle' ? 'floats'
    : state.strategy.technique === 'ladder-back' ? 'ladder'
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
  return {
    ...base,
    ok: artifact.ok,
    verdict: artifact.ok ? 'surface' : 'blocked',
    inputHash: artifact.inputHash,
    messages,
    knitoutText: artifact.knitoutText,
    passes: artifact.predictedPasses,
    stats: {
      ...base.stats,
      passCount: artifact.predictedPasses.length,
      opCount: artifact.program?.ops.length ?? 0,
      estimatedKnitTimeSeconds: artifact.plan?.estimatedKnitTimeSeconds ?? null,
    },
  };
}
