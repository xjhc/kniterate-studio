import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, Download, Info, LoaderCircle, Package, Printer, Ruler } from 'lucide-react';
import { MACHINE_START_CHECKS } from '../readiness';

/**
 * One status and the next useful action. Explanations, individual files and
 * machine preparation stay available on demand; disclosure never changes
 * whether a file can be exported.
 */

export type StatusTone = 'checking' | 'ready' | 'next' | 'warn' | 'blocked';

export interface StatusNote {
  severity: 'error' | 'warning' | 'info';
  text: string;
  /** The consequence, available in Why?. */
  why?: string | null;
  /** Buttons that go to the problem or fix it. */
  actions?: ReactNode;
}

export interface StatusFile {
  id: string;
  name: string;
  fileName: string;
  facts: string;
  state: 'ok' | 'blocked' | 'checking';
  copies?: number;
  error?: string | null;
}

/** The swatch step: each fabric the sizes come from, whether its gauge was measured, where to enter it, and the swatch's machine file. */
export interface SwatchStep {
  gauges: { name: string; measured: boolean }[];
  onEnter: () => void;
  file?: { onDownload: (() => void) | null; writing: boolean; problem: string | null };
}

function Notes({ notes }: { notes: StatusNote[] }) {
  if (notes.length === 0) return null;
  return <ul className="status-notes">{notes.map((note, index) => <li key={index} className={`note-${note.severity}`}>{note.text}{note.why && <p className="step-hint">{note.why}</p>}{note.actions && <span className="note-actions">{note.actions}</span>}</li>)}</ul>;
}

export function StatusPanel({ tone, title, detail, evidence, notes, files, onOpenFile, onDownloadFile, onPackage, onPrint, packaging, canPackage, canPrint, downloaded, swatch, atTheMachine, footer, fileDetail }: {
  tone: StatusTone;
  title: string;
  detail: string;
  evidence?: string;
  notes: StatusNote[];
  files: StatusFile[];
  onOpenFile: (id: string) => void;
  onDownloadFile: (id: string) => void;
  onPackage: () => void;
  onPrint: () => void;
  packaging: boolean;
  canPackage: boolean;
  canPrint: boolean;
  /** Whether this design's files were downloaded since its last change. */
  downloaded: boolean;
  /** Present when the sizes come from a gauge. */
  swatch?: SwatchStep;
  /** Settings the file cannot make, to set on the machine before knitting it. */
  atTheMachine: string[];
  footer?: ReactNode;
  /** More about the open file's piece (its shaping), shown under it. */
  fileDetail?: { id: string; content: ReactNode };
}) {
  const Icon = tone === 'ready' ? CheckCircle2 : tone === 'next' ? Info : tone === 'warn' ? AlertTriangle : tone === 'blocked' ? CircleAlert : LoaderCircle;
  const checking = tone === 'checking';
  const measured = swatch?.gauges.every((gauge) => gauge.measured) ?? true;
  const leadNote = tone === 'blocked' || tone === 'warn' ? notes.find((note) => note.severity === 'error') ?? notes[0] : undefined;
  const primarySwatch = !checking && !leadNote && swatch !== undefined && !measured;
  const primaryPackage = !checking && !leadNote && !primarySwatch && canPackage;
  const startChecks = [...new Set([
    ...atTheMachine,
    ...(swatch?.file?.onDownload ? MACHINE_START_CHECKS : []),
  ])];
  const swatchButton = (primary: boolean) => swatch?.file?.onDownload && <button type="button" className={primary ? 'primary-button' : 'secondary-button'} disabled={swatch.file.writing} onClick={swatch.file.onDownload}>{swatch.file.writing ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}{swatch.file.writing ? 'Writing the swatch file…' : 'Download swatch file'}</button>;
  const packageButton = (primary: boolean) => <button type="button" className={primary ? 'primary-button' : 'secondary-button'} disabled={checking || !canPackage || packaging} onClick={onPackage}>{packaging ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Package size={16} aria-hidden="true" />}{packaging ? 'Writing the knitting package…' : 'Download knitting package'}</button>;
  return <aside className="sweater-status" aria-label="Status">
    <section className={`status-card tone-${tone}`} role="status">
      <Icon size={20} className={checking ? 'spin' : undefined} aria-hidden="true" />
      <div><strong data-testid="readiness-headline">{title}</strong>{tone === 'blocked' && !leadNote && detail && <p>{detail}</p>}</div>
    </section>
    {leadNote && <section className="status-next" aria-label="Next step">
      <p className="status-reason">{leadNote.text}</p>
      {leadNote.actions && <div className="note-actions">{leadNote.actions}</div>}
    </section>}
    {(primarySwatch || primaryPackage) && <div className="status-actions" aria-label="Next step">
      {primarySwatch && (swatch?.file?.onDownload ? swatchButton(true) : <button type="button" className="primary-button" onClick={swatch!.onEnter}><Ruler size={15} aria-hidden="true" />Enter your swatch</button>)}
      {primaryPackage && packageButton(true)}
    </div>}
    {swatch?.file?.problem && <p className="piece-error" role="alert">{swatch.file.problem}</p>}
    <div className="status-disclosures">
      <details className="status-disclosure">
        <summary>Why?</summary>
        <div className="status-disclosure-body">
          {detail && <p className="step-hint">{detail}</p>}
          {evidence && <p className="step-hint">{evidence}</p>}
          {checking && <p className="step-hint">Downloads update when the current design has been checked.</p>}
          {leadNote?.why && <p className="step-hint">{leadNote.why}</p>}
          <Notes notes={notes.filter((note) => note !== leadNote)} />
          {downloaded && <p className="step-hint">This design’s files have been downloaded.</p>}
        </div>
      </details>
      {swatch && <details className="status-disclosure">
        <summary>Swatch</summary>
        <div className="status-disclosure-body">
        <ul className="swatch-gauges">{swatch.gauges.map((gauge) => <li key={gauge.name} className={gauge.measured ? 'measured' : ''}>{gauge.name}<span>{gauge.measured ? 'measured' : 'typical values'}</span></li>)}</ul>
        {!measured && <p className="step-hint">Knit a swatch, wash and dry it like the finished piece, then measure 10 cm in the middle.</p>}
        <div className="step-buttons">
          {!primarySwatch && swatchButton(false)}
          {(!primarySwatch || swatch.file?.onDownload) && <button type="button" className="secondary-button" onClick={swatch.onEnter}><Ruler size={15} aria-hidden="true" />{measured ? 'Change your swatch' : 'Enter your swatch'}</button>}
        </div>
        </div>
      </details>}
      <details className="status-disclosure">
        <summary>Files and printing</summary>
        <div className="status-disclosure-body">
        <section className="status-pieces" aria-label="Machine files">
          <ul>
            {files.map((file) => <li key={file.id} className={`piece-row piece-${checking ? 'checking' : file.state}`}>
              <button type="button" className="piece-open" onClick={() => onOpenFile(file.id)} title={`See what ${file.fileName} knits`}>
                <span className="piece-dot" aria-hidden="true" />
                <span className="piece-name"><code>{file.fileName}</code> {file.name}{file.copies && file.copies > 1 ? <em> · run {file.copies}×</em> : null}</span>
                <span className="piece-facts">{file.facts}</span>
              </button>
              <button type="button" className="icon-button" disabled={checking || file.state !== 'ok'} onClick={() => onDownloadFile(file.id)} title={`Download ${file.fileName}`} aria-label={`Download ${file.fileName}`}><Download size={15} aria-hidden="true" /></button>
              {file.state === 'blocked' && file.error && !notes.some((note) => note.text === file.error) && <p className="piece-error">{file.error}</p>}
              {fileDetail?.id === file.id && <div className="file-detail">{fileDetail.content}</div>}
            </li>)}
          </ul>
        </section>
        <div className="status-actions">
          {!primaryPackage && packageButton(false)}
          <button type="button" className="secondary-button" disabled={checking || !canPrint} onClick={onPrint}><Printer size={16} aria-hidden="true" />Print knitting sheet</button>
        </div>
        {footer}
        </div>
      </details>
      {startChecks.length > 0 && <details className="status-disclosure">
        <summary>Before knitting</summary>
        <section className="status-disclosure-body at-the-machine" aria-label="At the machine">
          <p className="step-hint">Check these at the machine before every run, including a swatch.</p>
          <ul className="status-notes operator">{startChecks.map((note) => <li key={note}>{note}</li>)}</ul>
        </section>
      </details>}
    </div>
  </aside>;
}
