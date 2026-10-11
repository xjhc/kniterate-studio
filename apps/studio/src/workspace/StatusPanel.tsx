import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, Download, LoaderCircle, Package, Printer } from 'lucide-react';

/**
 * The right-hand panel of every project, in the same order: can it be
 * knitted, what to fix, the machine files, download and print, what to do at
 * the machine and after knitting.
 */

export type StatusTone = 'checking' | 'ready' | 'warn' | 'blocked';

export interface StatusNote {
  severity: 'error' | 'warning' | 'info';
  text: string;
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

export function StatusPanel({ tone, title, detail, notes, files, onOpenFile, onDownloadFile, onPackage, onPrint, packaging, canPackage, canPrint, atTheMachine, afterKnitting, footer, fileDetail }: {
  tone: StatusTone;
  title: string;
  detail: string;
  notes: StatusNote[];
  files: StatusFile[];
  onOpenFile: (id: string) => void;
  onDownloadFile: (id: string) => void;
  onPackage: () => void;
  onPrint: () => void;
  packaging: boolean;
  canPackage: boolean;
  canPrint: boolean;
  atTheMachine: string[];
  /** What to do with the knitted piece: measure it and revise the design. */
  afterKnitting?: ReactNode;
  footer?: ReactNode;
  /** More about the open file's piece (its shaping), shown under it. */
  fileDetail?: { id: string; content: ReactNode };
}) {
  const Icon = tone === 'ready' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : tone === 'blocked' ? CircleAlert : LoaderCircle;
  return <aside className="sweater-status" aria-label="Status">
    <section className={`status-card tone-${tone}`} role="status">
      <Icon size={22} className={tone === 'checking' ? 'spin' : undefined} />
      <div><strong data-testid="readiness-headline">{title}</strong>{detail && <p>{detail}</p>}</div>
    </section>
    {notes.length > 0 && <section className="status-notes">
      <h3>{tone === 'blocked' ? 'To fix' : 'Before you knit'}</h3>
      <ul>{notes.map((note, index) => <li key={index} className={`note-${note.severity}`}>{note.text}{note.actions && <span className="note-actions">{note.actions}</span>}</li>)}</ul>
    </section>}
    <section className="status-pieces">
      <h3>Machine files</h3>
      <ul>
        {files.map((file) => <li key={file.id} className={`piece-row piece-${file.state}`}>
          <button type="button" className="piece-open" onClick={() => onOpenFile(file.id)} title={`See what ${file.fileName} knits`}>
            <span className="piece-dot" aria-hidden="true" />
            <span className="piece-name"><code>{file.fileName}</code> {file.name}{file.copies && file.copies > 1 ? <em> · run {file.copies}×</em> : null}</span>
            <span className="piece-facts">{file.facts}</span>
          </button>
          <button type="button" className="icon-button" disabled={file.state !== 'ok'} onClick={() => onDownloadFile(file.id)} title={`Download ${file.fileName}`} aria-label={`Download ${file.fileName}`}><Download size={15} /></button>
          {file.state === 'blocked' && file.error && <p className="piece-error">{file.error}</p>}
          {fileDetail?.id === file.id && <div className="file-detail">{fileDetail.content}</div>}
        </li>)}
      </ul>
    </section>
    <section className="status-actions">
      <button type="button" className="primary-button" disabled={!canPackage || packaging} onClick={onPackage}>{packaging ? <LoaderCircle size={16} className="spin" /> : <Package size={16} />}Download knitting package</button>
      <button type="button" className="secondary-button" disabled={!canPrint} onClick={onPrint}><Printer size={16} />Print knitting sheet</button>
    </section>
    {atTheMachine.length > 0 && <section className="status-notes operator">
      <h3>At the machine</h3>
      <ul>{atTheMachine.map((note, index) => <li key={index}>{note}</li>)}</ul>
    </section>}
    {afterKnitting && <section className="status-notes after-knitting">
      <h3>After knitting</h3>
      {afterKnitting}
    </section>}
    {footer}
  </aside>;
}
