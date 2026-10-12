import type { ReactNode } from 'react';
import { StatusPanel, type StatusTone } from '../workspace/StatusPanel';
import { revealSection } from '../workspace/panel';
import { MEASUREMENT_RULES } from '../readiness';
import type { SwatchFile } from '../useSwatchFile';
import type { PieceId } from './draft';
import type { PiecesPlan } from './sweater';
import { piecesStory, type SweaterRunState } from './sweaterRun';

/** Whether a flat-piece project (a sweater, a scarf or blanket) can be knitted, the steps to knit it, and its machine files. */
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
  const designErrors = plan.findings.filter((finding) => finding.severity === 'error');
  const findings = (summary && !checking ? summary.findings : plan.findings.map((finding) => ({ ...finding, owner: 'design' as const }))).filter((finding) => finding.severity !== 'info');
  // The gauge is the swatch step's; everything else is the design's.
  const designNotes = findings.filter((finding) => !MEASUREMENT_RULES.has(finding.rule));
  let tone: StatusTone = 'checking';
  let title = 'Checking every piece…';
  let detail = '';
  if (run.status === 'failed') { tone = 'blocked'; title = 'The check stopped'; detail = run.error ?? 'Unknown error.'; }
  else if (summary && !checking) {
    // The same headline as the written pattern.
    const story = piecesStory(summary);
    title = story.headline;
    if (story.status === 'blocked') { tone = 'blocked'; detail = 'Fix what is listed under Design.'; }
    else if (story.status === 'ready') tone = 'ready';
    else if (story.status === 'design-issues') { tone = 'warn'; detail = 'It can be knitted. See Design below.'; }
    else { tone = 'next'; detail = 'Sizes use a typical gauge until you measure a swatch.'; }
  } else if (designErrors.length > 0) { tone = 'blocked'; title = "Can't knit yet"; detail = designErrors[0]!.message; }
  const operator = summary && !checking ? summary.findings.filter((finding) => finding.severity === 'info' && finding.owner === 'operator') : [];
  const gauges = [{ name: plan.object.body.name, measured: plan.gauge.source === 'measured' }, ...(ribUsed ? [{ name: 'Rib', measured: plan.ribGauge.source === 'measured' }] : [])];
  return <StatusPanel
    tone={tone}
    title={title}
    detail={detail}
    notes={designNotes.map((note) => ({ severity: note.severity, text: note.message }))}
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
    downloaded={downloaded}
    swatch={{ gauges, onEnter: () => revealSection('swatch'), file: swatchFile }}
    atTheMachine={operator.map((note) => note.message)}
    fileDetail={fileDetail}
    footer={<p className="design-hint status-yarn" title={plan.yarn.how}>About {plan.yarn.metres.toLocaleString('en')} m of yarn.</p>}
  />;
}
