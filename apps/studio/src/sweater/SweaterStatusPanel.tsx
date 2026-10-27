import type { ReactNode } from 'react';
import { StatusPanel, storyTone, type StatusTone } from '../workspace/StatusPanel';
import { revealSection } from '../workspace/panel';
import { readinessStory, storyItems, type ReadinessStory } from '../handoff';
import type { SwatchFile } from '../useSwatchFile';
import { statusNotes } from '../workspace/statusNotes';
import { machineFileName } from '../workspace/fileNames';
import type { PieceId } from './draft';
import type { PiecesPlan } from './sweater';
import type { SweaterRunState } from './sweaterRun';

/**
 * A flat-piece project's status, for the panel and the top bar alike: the
 * readiness story once every piece is checked; until then the plan's own
 * errors already block.
 */
export function piecesStatus(plan: PiecesPlan, run: SweaterRunState): { tone: StatusTone; title: string; detail: string; story: ReadinessStory | null } {
  const summary = run.summary;
  const checking = run.status === 'checking' || !run.current;
  // The same story, in the same words, as every project and the written pattern.
  const story = summary && !checking ? readinessStory({ findings: summary.findings, readiness: summary.readiness, verdict: summary.verdict, exportReady: summary.exportReady }) : null;
  if (run.status === 'failed') return { tone: 'blocked', title: 'The check stopped', detail: run.error ?? 'Unknown error.', story };
  if (story) return { tone: storyTone(story.status), title: story.headline, detail: story.detail, story };
  if (plan.findings.some((finding) => finding.severity === 'error')) return { tone: 'blocked', title: "Can't knit yet", detail: 'Fix these first.', story };
  return { tone: 'checking', title: 'Checking every piece…', detail: '', story };
}

/** The current result and next action for a flat-piece project, with details available on demand. */
export function SweaterStatusPanel({ plan, run, ribUsed, downloaded, swatchFile, onOpenFile, onDownloadPiece, onPackage, onPrint, packaging, fileDetail }: {
  plan: PiecesPlan;
  run: SweaterRunState;
  /** Whether the design has rib, so a rib swatch sizes it too. */
  ribUsed: boolean;
  downloaded: boolean;
  swatchFile: SwatchFile;
  /** Opens the piece's machine file: what the machine will knit for it. */
  onOpenFile: (piece: PieceId) => void;
  onDownloadPiece: (piece: PieceId) => void;
  onPackage: () => void;
  onPrint: () => void;
  packaging: boolean;
  fileDetail?: { id: PieceId; content: ReactNode };
}) {
  const summary = run.summary;
  const checking = run.status === 'checking' || !run.current;
  const { tone, title, detail, story } = piecesStatus(plan, run);
  // While checking, the plan's own findings.
  const items = story?.items ?? storyItems(plan.findings.map((finding) => ({ ...finding, stage: 'plan' as const, owner: 'design' as const, title: finding.rule, fixes: [] })));
  const gauges = [{ name: plan.object.body.name, measured: plan.gauge.source === 'measured' }, ...(ribUsed ? [{ name: 'Rib', measured: plan.ribGauge.source === 'measured' }] : [])];
  return <StatusPanel
    tone={tone}
    title={title}
    detail={detail}
    notes={statusNotes(items, { swatchStep: true })}
    files={plan.pieces.map((piece) => {
      const result = summary?.pieces.find((item) => item.id === piece.id);
      const state = checking || !result ? 'checking' as const : result.verdict.state === 'blocked' ? 'blocked' as const : result.kcText ? 'ok' as const : 'checking' as const;
      const raster = piece.raster;
      return {
        id: piece.id,
        name: piece.name,
        fileName: machineFileName(piece.name),
        copies: piece.copies,
        facts: `${raster ? `${raster.realized.castOnStitches} st · ${raster.rows.length} rows` : 'not planned'}${result?.passCount && !checking ? ` · ${result.passCount.toLocaleString()} passes` : ''}`,
        state,
        error: result?.error ?? null,
      };
    })}
    onOpenFile={(id) => onOpenFile(id as PieceId)}
    onDownloadFile={(id) => onDownloadPiece(id as PieceId)}
    onPackage={onPackage}
    onPrint={onPrint}
    packaging={packaging}
    canPackage={Boolean(summary?.exportReady) && !checking}
    canPrint={!checking && summary !== null}
    downloaded={downloaded}
    swatch={{ gauges, onEnter: () => revealSection('swatch'), file: swatchFile }}
    atTheMachine={story?.operatorChecks ?? []}
    fileDetail={fileDetail}
    footer={<p className="design-hint status-yarn" title={plan.yarn.how}>About {plan.yarn.metres.toLocaleString('en')} m of yarn.</p>}
  />;
}
