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
  KNITOUT_RESOURCE_LIMITS_V1,
  checkKnitoutSourceResourceLimits,
  parseKnitoutProgram,
  type KnitoutCapacityIssueV1,
  type KnitoutResourceProfileV1,
  type KnitoutParseIssue,
  type ParseKnitoutProgramOptions,
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
export type { CarrierId, YarnBinding } from './knitout/types.js';
export type { PredictedPass } from './knitout/sim/types.js';
export {
  projectBackFaceFromArtifact,
  type BackFaceCell,
  type BackFaceProjection,
} from './knitout/back-face-projection.js';
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
export { KCODE_RESOURCE_LIMITS_V1, parseKCodeDocument } from './knitout/kcode/parser.js';
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
  MACHINE_TRACE_PASS_ROLES_V1,
  classifyMachineTracePassRoleV1,
  isLoopFormingMachineTracePassV1,
  summarizeMachineTracePassMetricsV1,
  summarizeMachineTracePassRolesV1,
  type MachineTracePassMetricsV1,
  type MachineTracePassRoleV1,
} from './knitout/kcode/pass-metrics.js';
export {
  CUSTOMIST_MATCHED_PRESETS_V1,
  CUSTOMIST_STANDARD_WASTE_PASSES_V1,
  customistWastePassesV1,
  buildCustomistMatchedCompileInputV1,
  type CustomistMatchedCompileRequestV1,
  type CustomistMatchedTechniqueV1,
} from './knitout/recipes/customist-matched.js';
export {
  diffTraceStitchesV1,
  passStitchSignatureV1,
  type TraceStitchDiffV1,
} from './knitout/kcode/trace-stitch-diff.js';
export {
  DEFAULT_MAX_FLOAT_DISTANCE_V1,
  MACHINE_TRACE_ADVISORY_RULES_V1,
  deriveMachineTraceAdvisoriesV1,
  type DeriveMachineTraceAdvisoriesOptionsV1,
  type MachineTraceAdvisoryReportV1,
  type MachineTraceAdvisoryRuleV1,
  type MachineTraceAdvisoryV1,
} from './knitout/kcode/machine-advisories.js';
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
  MACHINE_TOPOLOGY_INSPECTION_LIMITS_V1,
  MACHINE_TOPOLOGY_WINDOW_LIMITS_V1,
  indexMachineTopologyWindowV1,
  projectMachineTopologyWindowV1,
  inspectMachineTopologyLoopV1,
  type MachineTopologyWindowIndexV1,
  type MachineTopologyWindowV1,
  type MachineTopologyLoopInspectionV1,
} from './knitout/kcode/machine-topology-window.js';
export {
  MACHINE_EXECUTION_LIMITS_V1,
  createMachineExecutionIndexV1,
  inspectMachineExecutionV1,
  type MachineExecutionAssuranceV1,
  type MachineExecutionCarrierV1,
  type MachineExecutionCheckpointV1,
  type MachineExecutionEventV1,
  type MachineExecutionIndexV1,
  type MachineExecutionInspectionV1,
  type MachineExecutionLoopDeltaV1,
  type MachineExecutionObservationV1,
  type MachineExecutionPassV1,
} from './knitout/kcode/machine-execution.js';
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
  findKnitProvenMatch,
  findKnitProvenKCodeMatch,
  knitProvenRegistryEntries,
  matchKnitProvenArtifact,
  matchKnitProvenKCode,
  type KnitProvenMatch,
  type KnitProvenRegistryEntry,
} from './physical-registry.js';
export { buildCustomistRibBeanie, type CustomistRibBeanieInput } from './knitout/passes/customist-rib-beanie.js';
export { emitShapedPanelV1, ShapedPanelError, type PanelRowV1, type PanelSegmentV1, type PanelStitchV1, type ShapedPanelInputV1 } from './knitout/passes/shaped-panel.js';
export { CUSTOMIST_RIB_CROWN_194_V1, CUSTOMIST_RIB_CROWN_WIDTH } from './knitout/passes/customist-rib-beanie-crown.js';
export { BIRDSEYE_BODY_EXTRA_FRONT_ROWS } from './knitout/passes/customist-rib-beanie.js';
export { EIGHT_LINE_CROWN_V1, planEightLineCrown } from './knitout/passes/rib-crown-plan.js';
export { writeKnitoutProgram } from './knitout/emitter.js';
export { computeInputHash } from './knitout/run-artifact.js';
