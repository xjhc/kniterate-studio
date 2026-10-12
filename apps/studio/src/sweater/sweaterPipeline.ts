import {
  customistWastePassesV1,
  ShapedPanelError,
  computeInputHash,
  emitShapedPanelV1,
  matchKnitProvenArtifact,
  parseKnitoutProgram,
  writeKnitoutProgram,
  type CarrierId,
  type PanelRowV1,
  type PredictedPass,
} from '@kniterate-studio/machine-lib/browser';
import { assessAuthoredCapacityV1, materializeColorworkProject, observeAuthoredCapacityV1, type ColorworkProjectV1, type MachineSetup } from '@kniterate-studio/project-contract';
import { compileKCodeArtifact } from '../kcode/compileKCodeArtifact';
import type { KCodeArtifact } from '../kcode/kcodeProtocol';
import { resolveAuthoredVerdict, type AuthoredVerdict } from '../engine';
import { resolveReadiness, settingName, type Finding, type Readiness } from '../readiness';
import type { PieceId } from './draft';
import { planSweater, type PiecesPlan, type SweaterPiecePlan } from './sweater';
import { planPanel } from './panel';
import { textureTransfersPerRepeat } from './textures';

/**
 * Sweater project → one validated program per piece. Each piece goes through
 * the same seams as any authored project: the construction emits Knitout,
 * the vendored converter lowers it, the strict KCode validator checks it and
 * `resolveAuthoredVerdict` decides. The sweater's verdict is its worst piece.
 */

export interface CompiledPiece {
  knitoutText: string;
  inputHash: string;
  passes: readonly PredictedPass[];
  programOpSourceRows: readonly (readonly number[] | null)[];
  rowProvenance: { rowId: string; chartRow: number; machineRow: number }[];
  needleRange: { start: number; end: number };
}

export interface SweaterPieceResult {
  id: PieceId;
  name: string;
  copies: number;
  compiled: CompiledPiece | null;
  compileError: string | null;
  kcode: KCodeArtifact | null;
  outputError: string | null;
  verdict: AuthoredVerdict;
}

export interface SweaterPipelineResult {
  plan: PiecesPlan;
  pieces: SweaterPieceResult[];
  findings: Finding[];
  readiness: Readiness;
  /** The worst piece's verdict: one blocked piece blocks the sweater. */
  verdict: AuthoredVerdict;
  /** Every piece passed the same gate as the Export button. */
  exportReady: boolean;
}

/** One piece's Knitout program, from the plan. Throws ShapedPanelError when the shaping is not machine-knittable. */
export function compileSweaterPiece(plan: PiecesPlan, piece: SweaterPiecePlan, setup?: MachineSetup): CompiledPiece {
  const raster = piece.raster;
  if (raster === null) throw new Error(piece.error ?? `${piece.name} has no rows.`);
  const rows: PanelRowV1[] = raster.rows.map((row, index) => ({
    segments: row.segments,
    stitch: (needle: number) => raster.stitchAt(index, needle),
    settings: row.zone,
    sourceRow: index,
  }));
  const splits = rows.some((row) => row.segments.length === 2);
  const input = {
    rows,
    mainCarrier: plan.carriers.main as CarrierId,
    ...(splits && plan.carriers.second !== null ? { secondCarrier: plan.carriers.second as CarrierId } : {}),
    wasteCarrier: plan.carriers.waste as CarrierId,
    drawCarrier: plan.carriers.draw as CarrierId,
    top: plan.object.top ?? 'bind-off',
    fashion: plan.object.fashion ?? 1,
    ...(setup?.wasteRows !== undefined ? { startWastePasses: customistWastePassesV1('flat', setup.wasteRows) } : {}),
  } as const;
  const built = emitShapedPanelV1(input);
  const knitoutText = writeKnitoutProgram(built.program);
  const parsed = parseKnitoutProgram(knitoutText);
  const opRows = built.program.ops.map((op) => op.sourceRows ?? null);
  const all = raster.rows.flatMap((row) => row.segments);
  return {
    knitoutText,
    inputHash: computeInputHash({
      construction: 'shaped-panel@1',
      piece: piece.id,
      rows: raster.rows.map((row, index) => ({ segments: row.segments, zone: row.zone, stitches: row.segments.map((segment) => Array.from({ length: segment.hi - segment.lo + 1 }, (_, k) => raster.stitchAt(index, segment.lo + k)).join('')) })),
      carriers: plan.carriers,
      top: input.top,
      fashion: input.fashion,
    }),
    passes: built.predictedPasses,
    programOpSourceRows: opRows.length === parsed.opLines.length ? opRows : parsed.opLines.map(() => null),
    rowProvenance: raster.rows.map((_, index) => ({ rowId: `${piece.id}-row-${index + 1}`, chartRow: raster.rows.length - 1 - index, machineRow: index })),
    needleRange: { start: Math.min(...all.map((segment) => segment.lo)), end: Math.max(...all.map((segment) => segment.hi)) },
  };
}

const BLOCKED = (annotation: string): AuthoredVerdict => ({ state: 'blocked', label: 'Blocked', annotation, evidenceId: null });

export async function runSweaterPipeline(project: ColorworkProjectV1): Promise<SweaterPipelineResult> {
  const { state } = materializeColorworkProject(project);
  // A sweater's pieces, or a one-yarn panel's single piece.
  const plan: PiecesPlan = state.object?.kind === 'panel' ? planPanel(state) : planSweater(state);
  const capacity = assessAuthoredCapacityV1(project);
  const designErrors = plan.findings.filter((finding) => finding.severity === 'error');
  const pieces: SweaterPieceResult[] = [];
  for (const piece of plan.pieces) {
    let compiled: CompiledPiece | null = null;
    let compileError: string | null = null;
    const pieceErrors = designErrors.filter((finding) => finding.piece === null || finding.piece === piece.id);
    if (pieceErrors.length > 0) compileError = pieceErrors.map((finding) => finding.message).join(' ');
    else {
      try {
        compiled = compileSweaterPiece(plan, piece, state.setup);
      } catch (error) {
        compileError = error instanceof ShapedPanelError ? `${piece.name}, ${error.message}` : error instanceof Error ? error.message : String(error);
      }
    }
    let kcode: KCodeArtifact | null = null;
    let outputError: string | null = null;
    if (compiled !== null && capacity.status === 'supported') {
      const pieceCapacity = observeAuthoredCapacityV1(capacity, { knitoutRecords: compiled.knitoutText.split('\n').length });
      if (pieceCapacity.status === 'blocked') outputError = pieceCapacity.message;
      else {
        try {
          kcode = await compileKCodeArtifact({
            kind: 'convert-kcode',
            requestId: 1,
            inputHash: compiled.inputHash,
            capacity: pieceCapacity,
            knitoutText: compiled.knitoutText,
            compilerNeedleRange: compiled.needleRange,
            programOpSourceRows: compiled.programOpSourceRows,
            rowProvenance: compiled.rowProvenance,
          });
        } catch (error) {
          outputError = error instanceof Error ? error.message : String(error);
        }
      }
    } else if (compiled !== null) outputError = capacity.status === 'blocked' ? capacity.message : 'Capacity was not assessed.';
    if (outputError !== null) outputError = capacityInWords(piece.name, outputError, plan);
    const outputReady = kcode?.ok === true;
    const knitProven = matchKnitProvenArtifact(outputReady ? compiled?.inputHash : null, outputReady ? kcode?.kcHash : null);
    const verdict = resolveAuthoredVerdict({
      compileStatus: compileError === null ? 'ready' : 'failed',
      compileOk: compiled !== null,
      compileError,
      outputStatus: kcode !== null ? 'ready' : outputError !== null ? 'failed' : 'idle',
      outputOk: kcode?.ok ?? null,
      outputCurrent: kcode !== null,
      outputError,
      knitProvenEntryId: knitProven?.id ?? null,
    }) ?? BLOCKED('No validated K-code was produced for this piece.');
    pieces.push({ id: piece.id, name: piece.name, copies: piece.copies, compiled, compileError, kcode, outputError, verdict });
  }
  const findings = sweaterFindings(plan, pieces);
  const blocked = pieces.find((piece) => piece.verdict.state === 'blocked');
  const verdict: AuthoredVerdict = blocked !== undefined
    ? BLOCKED(`${blocked.name}: ${blocked.verdict.annotation}`)
    : pieces.every((piece) => piece.verdict.state === 'knit')
      ? { state: 'knit', label: 'Knit-proven', annotation: 'Every piece has a current clean physical registry match.', evidenceId: pieces.map((piece) => piece.verdict.evidenceId).join(',') }
      : { state: 'surface', label: 'Surface-proven', annotation: `Every piece's emitted KCode passed the strict V1 checks. Physical yarn, tension and fit remain separate gates.`, evidenceId: null };
  return {
    plan,
    pieces,
    findings,
    readiness: resolveReadiness({ verdict, findings }),
    verdict,
    exportReady: pieces.length > 0 && pieces.every((piece) => piece.kcode?.ok === true && piece.verdict.state !== 'blocked'),
  };
}

/**
 * The authored program limits (records, passes, selected cells) are checks on
 * one program's size. For a sweater piece the cause is its size and texture,
 * so say that, and what to change.
 */
function capacityInWords(name: string, error: string, plan: PiecesPlan): string {
  const limit = /raster cells/i.test(error) ? 'needle selections' : /lowered passes/i.test(error) ? 'machine passes' : /records/i.test(error) ? 'program lines' : null;
  if (limit === null) return error;
  const transfers = textureTransfersPerRepeat(plan.object.body.texture) > 0;
  return `${name} needs more ${limit} than Studio checks in one program. Make it smaller, use a coarser gauge${transfers ? `, or choose a stitch that moves fewer stitches between beds (${plan.object.body.name.toLowerCase()} moves stitches on most rows)` : ''}.`;
}

/** Every finding of the sweater, each with an owner. */
export function sweaterFindings(plan: PiecesPlan, pieces: readonly SweaterPieceResult[]): Finding[] {
  const findings: Finding[] = plan.findings.map((finding) => ({
    stage: 'plan',
    rule: finding.rule,
    severity: finding.severity,
    owner: 'design',
    path: finding.path,
    title: finding.rule,
    message: finding.message,
    fixes: [],
  }));
  for (const piece of pieces) {
    for (const message of piece.kcode?.messages ?? []) {
      const header = /WARNING: Unknown comment header '([^']+)'/.exec(message.message);
      // A machine setting the files do not carry is one note for the whole sweater.
      if (header && findings.some((finding) => finding.rule === message.rule && finding.owner === 'operator' && finding.message.includes(settingName(header[1]!)))) continue;
      findings.push({
        stage: 'kcode',
        rule: message.rule,
        severity: header ? 'info' : message.severity,
        owner: header ? 'operator' : 'compiler',
        path: `pieces/${piece.id}`,
        title: message.rule,
        message: header ? `Set ${settingName(header[1]!)} on the machine; the files do not set it.` : `${piece.name}: ${message.message}`,
        fixes: [],
      });
    }
    if (piece.compileError !== null && !plan.findings.some((finding) => finding.severity === 'error' && (finding.piece === null || finding.piece === piece.id))) {
      findings.push({ stage: 'pipeline', rule: 'compile-failed', severity: 'error', owner: 'compiler', path: `pieces/${piece.id}`, title: 'compile-failed', message: piece.compileError, fixes: [] });
    }
    if (piece.outputError !== null) {
      const size = piece.outputError.includes('than Studio checks in one program');
      findings.push({ stage: 'pipeline', rule: size ? 'sweater-piece-too-large' : 'output-failed', severity: 'error', owner: size ? 'design' : 'compiler', path: `pieces/${piece.id}`, title: size ? 'sweater-piece-too-large' : 'output-failed', message: size ? piece.outputError : `${piece.name}: ${piece.outputError}`, fixes: [] });
    }
  }
  // What the operator loads and watches; never marked complete by software.
  findings.push({ stage: 'plan', rule: 'operator-yarns', severity: 'info', owner: 'operator', path: 'yarns', title: 'operator-yarns', message: `Yarn on C${plan.carriers.main}${plan.carriers.second ? `, a second cone of the same yarn on C${plan.carriers.second} (right shoulder)` : ''}, waste yarn on C${plan.carriers.waste}, draw thread on C${plan.carriers.draw}.`, fixes: [] });
  if (plan.carriers.second) findings.push({ stage: 'plan', rule: 'carried-yarn', severity: 'info', owner: 'operator', path: 'yarns', title: 'carried-yarn', message: `On the front${plan.pieces.find((piece) => piece.id === 'back')?.raster?.events.some((event) => event.kind === 'neck-split') ? ' and back' : ''}, C${plan.carriers.second} runs up the right edge to the neck: keep it slack, trim it after.`, fixes: [] });
  return findings;
}
