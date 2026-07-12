export { diffKc, renderKcPassWindow, type KcDiff } from './knitout/kc-diff.js';
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
