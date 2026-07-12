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
