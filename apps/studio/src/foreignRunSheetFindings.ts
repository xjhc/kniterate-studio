import type { MachineDiagnostic } from './engine';

const MAX_REPRESENTATIVE_FINDING_ANCHORS = 3;

export interface ForeignRunSheetFindingRepresentative {
  readonly passIndex: number | null;
  readonly line: number | null;
  readonly detail: string;
}

export interface ForeignRunSheetFindingGroup {
  readonly key: string;
  readonly severity: MachineDiagnostic['severity'];
  readonly rule: string;
  readonly title: string;
  readonly explanation: string;
  occurrences: number;
  readonly representatives: ForeignRunSheetFindingRepresentative[];
}

function representativeKey(representative: ForeignRunSheetFindingRepresentative): string {
  if (representative.passIndex === null && representative.line === null) {
    return `artifact-wide\u001f${representative.detail}`;
  }
  return `${representative.passIndex ?? 'none'}\u001f${representative.line ?? 'none'}`;
}

/**
 * Keeps the printable operator handoff compact without dropping why a finding
 * exists. Catalog-backed diagnostics group by their stable presentation copy;
 * uncatalogued diagnostics retain distinct raw explanations as separate groups.
 */
export function groupForeignRunSheetFindings(
  diagnostics: readonly MachineDiagnostic[],
): ForeignRunSheetFindingGroup[] {
  const groups = new Map<string, ForeignRunSheetFindingGroup>();
  const representativeKeys = new Map<string, Set<string>>();

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === 'info') continue;
    const key = [
      diagnostic.severity,
      diagnostic.rule,
      diagnostic.title,
      diagnostic.explanation,
    ].join('\u001f');
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        key,
        severity: diagnostic.severity,
        rule: diagnostic.rule,
        title: diagnostic.title,
        explanation: diagnostic.explanation,
        occurrences: 0,
        representatives: [],
      };
      groups.set(key, group);
      representativeKeys.set(key, new Set());
    }
    group.occurrences += diagnostic.occurrences;

    const representative = {
      passIndex: diagnostic.passIndex,
      line: diagnostic.line,
      detail: diagnostic.rawMessage,
    } satisfies ForeignRunSheetFindingRepresentative;
    const identity = representativeKey(representative);
    const identities = representativeKeys.get(key)!;
    if (
      group.representatives.length < MAX_REPRESENTATIVE_FINDING_ANCHORS
      && !identities.has(identity)
    ) {
      identities.add(identity);
      group.representatives.push(representative);
    }
  }

  return [...groups.values()];
}

export function formatForeignRunSheetFindingAnchor(
  representative: ForeignRunSheetFindingRepresentative,
): string {
  const anchors: string[] = [];
  if (representative.passIndex !== null) anchors.push(`pass ${representative.passIndex + 1}`);
  if (representative.line !== null) anchors.push(`source line ${representative.line}`);
  return anchors.length > 0 ? anchors.join(' / ') : 'artifact-wide';
}
