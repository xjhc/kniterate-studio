import { AlertTriangle, CheckCircle2, CircleAlert, Download, LoaderCircle, Package, Printer } from 'lucide-react';
import type { PieceId } from './draft';
import type { SweaterPlan } from './sweater';
import type { SweaterRunState } from './sweaterRun';

/** Plain-language state of the whole sweater: whether it can be knitted, what to fix, and the files. */
export function SweaterStatusPanel({ plan, run, onOpenPiece, onDownloadPiece, onPackage, onPrint, packaging }: {
  plan: SweaterPlan;
  run: SweaterRunState;
  onOpenPiece: (piece: PieceId) => void;
  onDownloadPiece: (piece: PieceId) => void;
  onPackage: () => void;
  onPrint: () => void;
  packaging: boolean;
}) {
  const summary = run.summary;
  const checking = run.status === 'checking' || !run.current;
  const designErrors = plan.findings.filter((finding) => finding.severity === 'error');
  let tone: 'checking' | 'ready' | 'warn' | 'blocked' = 'checking';
  let title = 'Checking every piece…';
  let detail = 'Each piece is being compiled and checked as a machine program.';
  if (run.status === 'failed') { tone = 'blocked'; title = 'The check stopped'; detail = run.error ?? 'Unknown error.'; }
  else if (summary && !checking) {
    if (!summary.exportReady) { tone = 'blocked'; title = 'Not knittable yet'; detail = 'A piece cannot be knitted as designed. Fix what is listed below.'; }
    else if (summary.readiness.ready) { tone = 'ready'; title = 'Ready to knit'; detail = 'Every piece passed the machine checks and every size is backed by measured gauges.'; }
    else { tone = 'warn'; title = 'Knittable — sizes not confirmed'; detail = 'Every piece passed the machine checks. The sizes rest on assumptions until you resolve the notes below.'; }
  } else if (designErrors.length > 0) { tone = 'blocked'; title = 'Not knittable yet'; detail = designErrors[0]!.message; }
  const notes = (summary && !checking ? summary.findings : plan.findings.map((finding) => ({ ...finding, owner: 'design' as const }))).filter((finding) => finding.severity !== 'info');
  const operator = summary && !checking ? summary.findings.filter((finding) => finding.severity === 'info' && finding.owner === 'operator') : [];
  const Icon = tone === 'ready' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : tone === 'blocked' ? CircleAlert : LoaderCircle;
  return <aside className="sweater-status" aria-label="Status">
    <section className={`status-card tone-${tone}`} role="status">
      <Icon size={22} className={tone === 'checking' ? 'spin' : undefined} />
      <div><strong>{title}</strong><p>{detail}</p></div>
    </section>
    {notes.length > 0 && <section className="status-notes">
      <h3>{tone === 'blocked' ? 'To fix' : 'Before you knit'}</h3>
      <ul>{notes.map((note, index) => <li key={index} className={`note-${note.severity}`}>{note.message}</li>)}</ul>
    </section>}
    <section className="status-pieces">
      <h3>Pieces</h3>
      <ul>
        {plan.pieces.map((piece) => {
          const result = summary?.pieces.find((item) => item.id === piece.id);
          const state = checking || !result ? 'checking' : result.verdict.state === 'blocked' ? 'blocked' : 'ok';
          const raster = piece.raster;
          return <li key={piece.id} className={`piece-row piece-${state}`}>
            <button type="button" className="piece-open" onClick={() => onOpenPiece(piece.id)}>
              <span className="piece-dot" aria-hidden="true" />
              <span className="piece-name">{piece.name}{piece.copies > 1 ? <em> ×{piece.copies}</em> : null}</span>
              <span className="piece-facts">{raster ? `${raster.realized.castOnStitches} st · ${raster.rows.length} rows` : 'not planned'}{result?.passCount && !checking ? ` · ${result.passCount.toLocaleString()} passes` : ''}</span>
            </button>
            <button type="button" className="icon-button" disabled={state !== 'ok' || !result?.kcText} onClick={() => onDownloadPiece(piece.id)} title={`Download ${piece.id}.kc`} aria-label={`Download ${piece.name} program`}><Download size={15} /></button>
            {state === 'blocked' && result?.error && <p className="piece-error">{result.error}</p>}
          </li>;
        })}
      </ul>
      <p className="design-hint" title={plan.yarn.how}>About {plan.yarn.metres.toLocaleString('en')} m of yarn in all (an estimate from the stitch count).</p>
    </section>
    <section className="status-actions">
      <button type="button" className="primary-button" disabled={!summary?.exportReady || checking || packaging} onClick={onPackage}>{packaging ? <LoaderCircle size={16} className="spin" /> : <Package size={16} />}Download knitting package</button>
      <button type="button" className="secondary-button" disabled={checking || !summary} onClick={onPrint}><Printer size={16} />Pattern &amp; assembly</button>
      <p className="design-hint">The package holds every piece's .kc, the written pattern, the schematic and the project file.</p>
    </section>
    {operator.length > 0 && <section className="status-notes operator">
      <h3>At the machine</h3>
      <ul>{operator.map((note, index) => <li key={index}>{note.message}</li>)}</ul>
    </section>}
    {summary && !checking && <p className="status-verdict" title={summary.verdict.annotation}>Software check: {summary.verdict.label}. Yarn behaviour and fit are only proven by knitting.</p>}
  </aside>;
}
