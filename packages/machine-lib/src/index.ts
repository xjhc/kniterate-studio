export {
  compileChartToKnitout,
  type CompileChartInput,
  type CompileChartResult,
} from './knitout/compile/from-chart.js';
export { writeKnitoutProgram } from './knitout/emitter.js';
export {
  KNITOUT_RESOURCE_LIMITS_V1,
  checkKnitoutSourceResourceLimits,
  parseKnitoutProgram,
  type KnitoutCapacityIssueV1,
  type KnitoutResourceProfileV1,
  type KnitoutParseIssue,
  type ParseKnitoutProgramOptions,
  type ParsedKnitoutDocument,
} from './knitout/parser.js';
export { inspectKcDocument, type KcDocumentPass } from './knitout/kc-document.js';
export { inspectKnitoutPasses, type KnitoutSourcePass } from './knitout/inspect-program.js';
export {
  knitoutToKCode,
  authoredKnitoutToKCodeWithTrace,
  knitoutToKCodeWithTrace,
  nodeKCodeConverter,
  type KnitoutToKCodeResult,
  type KnitoutToScheduledKCodeResult,
} from './knitout/kniterate/to-kcode.js';
export type {
  VendorLoweringSettings,
  VendorLoweringResourceLimits,
  VendorKCodeCoordinateMappingV1,
  VendorPositionV1,
  VendorScheduledKCode,
  VendorScheduledPass,
} from './knitout/kniterate/vendor-pass-contract.js';
export {
  KNITERATE_7GG_KCODE_PROFILE_V1,
  KNITERATE_7GG_KCODE_PROFILE_V2,
  KNITERATE_KCODE_OPERATION_CONTRACTS_V1,
  basePayloadIndexToKCodeColumn,
  kcodeOperationContractV1,
  kcodeColumnToBasePayloadIndex,
  kcodeColumnToTraceCoordinate,
  type KCodeCarrierToken,
  type KCodeCommandAuthorityV1,
  type KCodeDialect,
  type KCodeMachineProfileV1,
  type KCodeOperationContractV1,
  type KCodeOperationV1,
  type KCodePassDirectionV1,
  type KCodeRegularBedActionV1,
  type KCodeRegularOperationContractV1,
  type KCodeTraceBedV1,
  type KCodeTransferOperationContractV1,
} from './knitout/kcode/machine-profile.js';
export {
  KCODE_RESOURCE_LIMITS_V1,
  parseKCodeDocument,
} from './knitout/kcode/parser.js';
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
  isLoopFormingMachineTracePassV1,
  summarizeMachineTracePassMetricsV1,
  type MachineTracePassMetricsV1,
} from './knitout/kcode/pass-metrics.js';
export {
  PROGRAMMED_MOTION_CLAIM_BOUNDARY_V1,
  PROGRAMMED_MOTION_DISTANCE_ASSUMPTION_V1,
  PROGRAMMED_MOTION_SPEED_ASSUMPTION_V1,
  deriveMachineTraceProgrammedMotionV1,
  type DeriveMachineTraceProgrammedMotionOptionsV1,
  type MachineTraceProgrammedMotionV1,
} from './knitout/kcode/programmed-motion.js';
export {
  DEFAULT_MACHINE_TOPOLOGY_LIMITS_V1,
  MachineTopologyProjectionErrorV1,
  projectMachineTopologyV1,
  type MachineTopologyActionAnchorV1,
  type MachineTopologyCarrierChainV1,
  type MachineTopologyConnectionV1,
  type MachineTopologyLimitsV1,
  type MachineTopologyLocationV1,
  type MachineTopologyLoopV1,
  type MachineTopologyMovementV1,
  type MachineTopologyProjectionErrorCodeV1,
  type MachineTopologyStackV1,
  type MachineTopologyV1,
} from './knitout/kcode/machine-topology.js';
export {
  DEFAULT_MACHINE_TOPOLOGY_MESH_LIMITS_V1,
  projectMachineTopologyMeshV1,
  type MachineTopologyMeshEdgeV1,
  type MachineTopologyMeshLimitsV1,
  type MachineTopologyMeshMovementV1,
  type MachineTopologyMeshNodeV1,
  type MachineTopologyMeshV1,
} from './knitout/kcode/machine-topology-mesh.js';
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
export { isKCodeCommandLegalityExportEligible } from './knitout/kcode/export-eligibility.js';
export {
  compareScheduledPassesToMachineTrace,
  type ScheduledTraceComparisonV1,
  type ScheduledTraceMismatchV1,
} from './knitout/kcode/scheduled-trace-diff.js';
export {
  createAuthoredKCodeCoordinateBridgeV1,
  deriveEndpointPhysicalNeedleMappingV1,
  physicalNeedleForTraceCoordinateV1,
  type AuthoredKCodeCoordinateBridgeV1,
  type CreateAuthoredKCodeCoordinateBridgeInputV1,
  type EndpointPhysicalNeedleMappingV1,
} from './knitout/kcode/coordinate-bridge.js';
export type {
  KCodeDiagnostic,
  KCodeDiagnosticRule,
  KCodeDocumentMetadataV1,
  KCodeDocumentV1,
  KCodePassBlock,
  KCodeResourceProfileV1,
  KCodeSourceSpan,
  ParseKCodeDocumentOptions,
  ParseKCodeDocumentResult,
} from './knitout/kcode/types.js';
export {
  kcToKnitout,
  type KcToKnitoutOptions,
  type KcToKnitoutResult,
  type KcToKnitoutStats,
} from './knitout/kc-to-knitout.js';
export {
  diffKc,
  diffKCodeMachineTrace,
  formatPass,
  renderKcPassWindow,
  renderKCodeMachineTraceWindow,
  renderKCodeMachineTraceWindowFromTraces,
  type KcDiff,
  type KcDiffOptions,
  type KcPassDelta,
  type KCodeMachineTraceDelta,
  type KCodeMachineTraceDiff,
  type KCodeMachineTraceDiffOptions,
  type RenderKCodeMachineTraceWindowOptions,
  type RenderKCodeMachineTraceWindowFromTracesOptions,
} from './knitout/kc-diff.js';
export {
  compileToRunArtifact,
  runArtifactFromCompileResult,
  type CompiledRunArtifact,
  type RunArtifact,
} from './knitout/run-artifact.js';
export { parseKcPasses, type ParsedKcPass } from './knitout/sim/kc-parse.js';
export { CarriageSimulator, type CarriageSimulatorOptions } from './knitout/sim/carriage-simulator.js';
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
  projectColorworkChartV1,
  type ProjectedColorworkChart,
} from './colorwork/from-colorwork-chart.js';
export * from './knitout/types.js';
export {
  projectBackFaceFromArtifact,
  type BackFaceCell,
  type BackFaceProjection,
} from './knitout/back-face-projection.js';
export * from './physical-registry.js';
