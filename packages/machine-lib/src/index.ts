export {
  compileChartToKnitout,
  type CompileChartInput,
  type CompileChartResult,
} from './knitout/compile/from-chart.js';
export { writeKnitoutProgram } from './knitout/emitter.js';
export {
  parseKnitoutProgram,
  type KnitoutParseIssue,
  type ParsedKnitoutDocument,
} from './knitout/parser.js';
export { inspectKcDocument, type KcDocumentPass } from './knitout/kc-document.js';
export { inspectKnitoutPasses, type KnitoutSourcePass } from './knitout/inspect-program.js';
export {
  knitoutToKCode,
  nodeKCodeConverter,
  type KnitoutToKCodeResult,
} from './knitout/kniterate/to-kcode.js';
export {
  kcToKnitout,
  type KcToKnitoutOptions,
  type KcToKnitoutResult,
  type KcToKnitoutStats,
} from './knitout/kc-to-knitout.js';
export {
  diffKc,
  formatPass,
  renderKcPassWindow,
  type KcDiff,
  type KcDiffOptions,
  type KcPassDelta,
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
