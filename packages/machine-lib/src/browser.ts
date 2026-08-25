export {
  diffKc,
  diffKCodeMachineTrace,
  renderKcPassWindow,
  renderKCodeMachineTraceWindow,
  renderKCodeMachineTraceWindowFromTraces,
  type KcDiff,
  type KCodeMachineTraceDelta,
  type KCodeMachineTraceDiff,
  type KCodeMachineTraceDiffOptions,
  type RenderKCodeMachineTraceWindowOptions,
  type RenderKCodeMachineTraceWindowFromTracesOptions,
} from './knitout/kc-diff.js';
export { inspectKcDocument, type KcDocumentPass } from './knitout/kc-document.js';
export { inspectKnitoutPasses, type KnitoutSourcePass } from './knitout/inspect-program.js';
export {
  kcToKnitout,
  type KcToKnitoutResult,
  type KcToKnitoutStats,
} from './knitout/kc-to-knitout.js';
export {
  parseKnitoutProgram,
  type KnitoutParseIssue,
  type ParsedKnitoutDocument,
} from './knitout/parser.js';
export {
  validateKnitoutProgram,
  type ValidationMessage,
  type ValidationReport,
} from './validators/knitout-program.js';
export {
  resolveValidatorMessage,
  type ResolvedValidatorMessage,
} from './validators/messages.js';
export {
  compileToRunArtifact,
  type CompiledRunArtifact,
} from './knitout/run-artifact.js';
export {
  projectColorworkChartV1,
  type ProjectedColorworkChart,
} from './colorwork/from-colorwork-chart.js';
export type { YarnBinding } from './knitout/types.js';
export type { PredictedPass } from './knitout/sim/types.js';
export {
  projectBackFaceFromArtifact,
  type BackFaceCell,
  type BackFaceProjection,
} from './knitout/back-face-projection.js';
export {
  KNITERATE_7GG_KCODE_PROFILE_V1,
  basePayloadIndexToKCodeColumn,
  kcodeColumnToBasePayloadIndex,
  kcodeColumnToTraceCoordinate,
  type KCodeCarrierToken,
  type KCodeDialect,
  type KCodeMachineProfileV1,
} from './knitout/kcode/machine-profile.js';
export { parseKCodeDocument } from './knitout/kcode/parser.js';
export {
  parseKCodeBytes,
  emitKCodeDocumentBytes,
} from './knitout/kcode/bytes.js';
export { emitKCodeDocument } from './knitout/kcode/emitter.js';
export {
  projectKCodeMachineTrace,
  type MachineTraceActionV1,
  type MachineTracePassV1,
  type MachineTraceRackCommandV1,
  type MachineTraceSelectionV1,
  type MachineTraceV1,
} from './knitout/kcode/machine-trace.js';
export {
  projectMachineScene,
  type MachineSceneActionGlyphV1,
  type MachineSceneMovementV1,
  type MachineScenePassV1,
  type MachineSceneRackCommandV1,
  type MachineSceneSelectionV1,
  type MachineSceneV1,
} from './knitout/kcode/machine-scene.js';
export {
  validateKCodeMachineTrace,
  type MachineLoopStateSnapshotV1,
  type MachinePassStateSnapshotV1,
  type MachineValidationDiagnosticV1,
  type MachineValidationReportV1,
} from './knitout/kcode/machine-validator.js';
export {
  compareScheduledPassesToMachineTrace,
  type ScheduledTraceComparisonV1,
  type ScheduledTraceMismatchV1,
} from './knitout/kcode/scheduled-trace-diff.js';
export type {
  KCodeDiagnostic,
  KCodeDiagnosticRule,
  KCodeDocumentMetadataV1,
  KCodeDocumentV1,
  KCodePassBlock,
  KCodeSourceSpan,
  ParseKCodeDocumentOptions,
  ParseKCodeDocumentResult,
} from './knitout/kcode/types.js';
export {
  findKnitProvenMatch,
  findKnitProvenKCodeMatch,
  knitProvenRegistryEntries,
  matchKnitProvenArtifact,
  matchKnitProvenKCode,
  type KnitProvenMatch,
  type KnitProvenRegistryEntry,
} from './physical-registry.js';
