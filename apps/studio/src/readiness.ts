import { KNITERATE_7GG_KCODE_PROFILE_V2, deriveMachineTraceAdvisoriesV1, resolveValidatorMessage, type MachineTraceV1 } from '@kniterate-studio/machine-lib/browser';
import type { AuthoredPipelineResult } from './authoredPipeline';
import type { ProjectPlan } from './plan';
import type { ProjectEdit } from '@kniterate-studio/project-contract';

/**
 * Every diagnostic a project produces, each with an owner, and the readiness
 * result computed from them. Readiness is not a verdict rung: the verdict
 * policy (`engine.ts::resolveAuthoredVerdict`) is unchanged, and a
 * Surface-proven project with any unresolved warning is still not ready.
 * Nothing is filtered to make a project ready.
 */

export type FindingOwner = 'design' | 'compiler' | 'operator';

export interface Finding {
  stage: 'plan' | 'compile' | 'kcode' | 'pipeline';
  rule: string;
  severity: 'error' | 'warning' | 'info';
  /** Who can resolve it: the author, an engine repair, or the machine operator. */
  owner: FindingOwner;
  /** Where in the design, e.g. `target.widthCm`, `yarns/ground`, `rows/row_0012`. */
  path: string | null;
  title: string;
  message: string;
  passIndices?: readonly number[];
  fixes: { label: string; edits: ProjectEdit[] }[];
}

export type ReadinessBlocker =
  | { kind: 'verdict-blocked'; label: string }
  | { kind: 'finding'; rule: string; severity: 'error' | 'warning'; owner: FindingOwner; path: string | null }
  | { kind: 'assumed-value'; path: string; rule: string }
  | { kind: 'missing-input'; path: string; rule: string }
  | { kind: 'unsupported'; path: string; rule: string };

export interface Readiness {
  /** True exactly when there are no blockers. Only then may anyone call the project ready. */
  ready: boolean;
  blockers: ReadinessBlocker[];
  /** Checks done at the machine; software never marks them complete. */
  operatorChecks: string[];
}

/** Rules the author resolves by changing the design. Everything else from the compiler is compiler-owned. */
function isDesignRule(rule: string): boolean {
  return rule.startsWith('project-') || rule.startsWith('track-a-') || rule === 'long-float' || rule === 'bed-state-long-float'
    || rule === 'machine-advisory.float-distance' || rule === 'compile-no-pattern-carriers';
}

function title(rule: string, severity: Finding['severity'], message: string): string {
  const resolved = resolveValidatorMessage({ rule, severity, message });
  return resolved.catalogHit ? resolved.title : rule;
}

/**
 * The vendor converter drops Knitout extension headers it does not encode
 * (e.g. carrier spacing and stopping distance). Those settings then live only
 * on the controller, so they become an operator check with the intended value.
 */
function operatorHeader(rule: string, message: string, knitoutLines: readonly string[]): string | null {
  if (rule !== 'vendor-converter-note') return null;
  const match = /:(\d+) WARNING: Unknown comment header '([^']+)'/.exec(message);
  if (match === null) return null;
  const line = knitoutLines[Number(match[1]) - 1] ?? '';
  const value = line.startsWith(';;') ? line.slice(line.indexOf(':') + 1).trim() : '';
  return `${match[2]}${value ? ` = ${value}` : ''} is not encoded in the .kc; confirm the controller setting before knitting.`;
}

/**
 * Sideways floats along the actual yarn paths of a beanie: each carrier's
 * previous loop to its next stitch, across rows, sections and transfers, from
 * the emitted trace. Spans starting before the draw yarn's last row are the
 * yarn carried in from the waste section, which compileProject reports from
 * the authored rows (`carried-yarn`), as it does vertical carries
 * (`project-long-carry`) that a needle distance cannot see.
 */
function beanieFloatFindings(trace: MachineTraceV1, floatLimit: number): Finding[] {
  const report = deriveMachineTraceAdvisoriesV1(trace, KNITERATE_7GG_KCODE_PROFILE_V2, { maxFloatDistance: floatLimit });
  let frameEnd = -1;
  for (const pass of trace.passes) if (pass.carrier === '1' && pass.actions.some((action) => action.kind === 'knit')) frameEnd = pass.index;
  const findings: Finding[] = [];
  for (const advisory of report.advisories) {
    if (advisory.rule !== 'machine-advisory.float-distance' || advisory.carrier === '1' || advisory.carrier === '6') continue;
    if ((advisory.fromPassIndex ?? 0) <= frameEnd) continue;
    findings.push({ stage: 'kcode', rule: 'long-float', severity: 'warning', owner: 'design', path: null, title: 'long-float', message: `C${advisory.carrier} floats ${advisory.distance} needles behind the work from pass ${(advisory.fromPassIndex ?? 0) + 1} to pass ${advisory.passIndex + 1} (limit ${floatLimit}).`, passIndices: [advisory.passIndex], fixes: [] });
  }
  const listed = report.advisories.filter((advisory) => advisory.rule === 'machine-advisory.float-distance').length;
  if (report.counts['machine-advisory.float-distance'] > listed) {
    findings.push({ stage: 'kcode', rule: 'long-float', severity: 'warning', owner: 'design', path: null, title: 'long-float', message: `${report.counts['machine-advisory.float-distance'] - listed} further float advisories were not listed individually.`, fixes: [] });
  }
  return findings;
}

export function collectFindings(plan: ProjectPlan, result: AuthoredPipelineResult): Finding[] {
  const findings: Finding[] = plan.findings.map((finding) => ({
    stage: 'plan',
    rule: finding.rule,
    severity: finding.severity,
    owner: 'design',
    path: finding.path,
    title: finding.rule,
    message: finding.message,
    fixes: finding.fixes,
  }));
  for (const diagnostic of result.compiled?.diagnostics ?? []) {
    findings.push({
      stage: 'compile',
      rule: diagnostic.rule,
      severity: diagnostic.severity,
      owner: diagnostic.rule === 'carried-yarn' ? 'operator' : isDesignRule(diagnostic.rule) ? 'design' : 'compiler',
      path: diagnostic.rowId === null ? null : `rows/${diagnostic.rowId}`,
      title: title(diagnostic.rule, diagnostic.severity, diagnostic.message),
      message: diagnostic.message,
      passIndices: diagnostic.passIndices,
      fixes: [],
    });
  }
  const knitoutLines = result.compiled?.knitoutText?.split('\n') ?? [];
  for (const message of result.kcode?.messages ?? []) {
    const header = operatorHeader(message.rule, message.message, knitoutLines);
    findings.push({
      stage: 'kcode',
      rule: message.rule,
      severity: message.severity,
      owner: header !== null ? 'operator' : isDesignRule(message.rule) ? 'design' : 'compiler',
      path: null,
      title: title(message.rule, message.severity, message.message),
      message: header ?? message.message,
      fixes: [],
    });
  }
  if (plan.piece === 'beanie' && result.kcode?.trace) findings.push(...beanieFloatFindings(result.kcode.trace, plan.backing.floatLimit));
  for (const [rule, error] of [['compile-failed', result.compileError], ['output-failed', result.outputError]] as const) {
    if (error !== null) findings.push({ stage: 'pipeline', rule, severity: 'error', owner: 'compiler', path: null, title: rule, message: error, fixes: [] });
  }
  return findings;
}

const PLAN_BLOCKER_KIND: Partial<Record<string, 'assumed-value' | 'missing-input' | 'unsupported'>> = {
  'gauge-assumed': 'assumed-value',
  'size-needs-gauge': 'missing-input',
  'size-exceeds-capacity': 'unsupported',
};

export function resolveReadiness(input: { verdict: AuthoredPipelineResult['verdict']; findings: readonly Finding[] }): Readiness {
  const blockers: ReadinessBlocker[] = [];
  if (input.verdict.state === 'blocked') blockers.push({ kind: 'verdict-blocked', label: input.verdict.label });
  const operatorChecks: string[] = [];
  for (const finding of input.findings) {
    if (finding.severity === 'info') {
      if (finding.owner === 'operator') operatorChecks.push(finding.message);
      continue;
    }
    const planKind = finding.stage === 'plan' ? PLAN_BLOCKER_KIND[finding.rule] : undefined;
    if (planKind !== undefined) blockers.push({ kind: planKind, path: finding.path ?? '', rule: finding.rule });
    else blockers.push({ kind: 'finding', rule: finding.rule, severity: finding.severity, owner: finding.owner, path: finding.path });
  }
  return { ready: blockers.length === 0, blockers, operatorChecks };
}
