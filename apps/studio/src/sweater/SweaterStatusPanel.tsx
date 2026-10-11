import type { ReactNode } from 'react';
import { StatusPanel, type StatusTone } from '../workspace/StatusPanel';
import type { PieceId } from './draft';
import type { SweaterPlan } from './sweater';
import type { SweaterRunState } from './sweaterRun';

/** Whether the sweater can be knitted, what to fix, and its machine files. */
export function SweaterStatusPanel({ plan, run, onOpenFile, onDownloadPiece, onPackage, onPrint, packaging, fileDetail }: {
  plan: SweaterPlan;
  run: SweaterRunState;
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
  const designErrors = plan.findings.filter((finding) => finding.severity === 'error');
  let tone: StatusTone = 'checking';
  let title = 'Checking every piece…';
  let detail = '';
  if (run.status === 'failed') { tone = 'blocked'; title = 'The check stopped'; detail = run.error ?? 'Unknown error.'; }
  else if (summary && !checking) {
    if (!summary.exportReady) { tone = 'blocked'; title = 'Not knittable yet'; detail = 'Fix what is listed below.'; }
    else if (summary.readiness.ready) { tone = 'ready'; title = 'Ready to knit'; }
    else { tone = 'warn'; title = 'Knittable — sizes not confirmed'; detail = 'Measure a swatch and enter your gauge to confirm the sizes.'; }
  } else if (designErrors.length > 0) { tone = 'blocked'; title = 'Not knittable yet'; detail = designErrors[0]!.message; }
  const notes = (summary && !checking ? summary.findings : plan.findings.map((finding) => ({ ...finding, owner: 'design' as const }))).filter((finding) => finding.severity !== 'info');
  const operator = summary && !checking ? summary.findings.filter((finding) => finding.severity === 'info' && finding.owner === 'operator') : [];
  return <StatusPanel
    tone={tone}
    title={title}
    detail={detail}
    notes={notes.map((note) => ({ severity: note.severity, text: note.message }))}
    files={plan.pieces.map((piece) => {
      const result = summary?.pieces.find((item) => item.id === piece.id);
      const state = checking || !result ? 'checking' as const : result.verdict.state === 'blocked' ? 'blocked' as const : result.kcText ? 'ok' as const : 'checking' as const;
      const raster = piece.raster;
      return {
        id: piece.id,
        name: piece.name,
        fileName: `${piece.id}.kc`,
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
    atTheMachine={operator.map((note) => note.message)}
    fileDetail={fileDetail}
    footer={<p className="design-hint status-yarn" title={plan.yarn.how}>About {plan.yarn.metres.toLocaleString('en')} m of yarn.</p>}
  />;
}
