import type { ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, CircleAlert, Download, Info, LoaderCircle, Package, Printer, Ruler } from 'lucide-react';

/**
 * The right-hand panel of every project: whether it can be knitted, then the
 * steps from design to knitted piece, in order. Each step holds what belongs
 * to it: what to fix, the swatch, the machine files and downloads, what to do
 * at the machine, and measuring the knitted piece. The next step to take is
 * marked.
 */

export type StatusTone = 'checking' | 'ready' | 'next' | 'warn' | 'blocked';

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

/** The swatch step: each fabric the sizes come from, whether its gauge was measured, where to enter it, and the swatch's machine file. */
export interface SwatchStep {
  gauges: { name: string; measured: boolean }[];
  onEnter: () => void;
  file?: { onDownload: (() => void) | null; writing: boolean; problem: string | null };
}

/** After knitting, for a piece you can measure once it is off the machine (a beanie): part of the Knit step, done once real measurements are recorded. */
export interface MeasureStep { done: boolean; content: ReactNode }

type StepState = 'done' | 'current' | 'todo';

function Step({ number, title, state, children }: { number: number; title: string; state: StepState; children?: ReactNode }) {
  return <li className={`status-step step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
    <span className="step-mark" aria-hidden="true">{state === 'done' ? <Check size={13} strokeWidth={3} /> : number}</span>
    <div className="step-body">
      <h3>{title}{state === 'done' && <span className="visually-hidden"> (done)</span>}</h3>
      {children}
    </div>
  </li>;
}

function Notes({ notes }: { notes: StatusNote[] }) {
  if (notes.length === 0) return null;
  return <ul className="status-notes">{notes.map((note, index) => <li key={index} className={`note-${note.severity}`}>{note.text}{note.actions && <span className="note-actions">{note.actions}</span>}</li>)}</ul>;
}

export function StatusPanel({ tone, title, detail, notes, files, onOpenFile, onDownloadFile, onPackage, onPrint, packaging, canPackage, canPrint, downloaded, swatch, atTheMachine, measure, footer, fileDetail }: {
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
  /** Whether this design's files were downloaded since its last change. */
  downloaded: boolean;
  /** Present when the sizes come from a gauge. */
  swatch?: SwatchStep;
  atTheMachine: string[];
  measure?: MeasureStep;
  footer?: ReactNode;
  /** More about the open file's piece (its shaping), shown under it. */
  fileDetail?: { id: string; content: ReactNode };
}) {
  const Icon = tone === 'ready' ? CheckCircle2 : tone === 'next' ? Info : tone === 'warn' ? AlertTriangle : tone === 'blocked' ? CircleAlert : LoaderCircle;
  // The first step not done is the one to take next; while checking, none is.
  const done = {
    design: tone === 'ready' || tone === 'next',
    swatch: swatch?.gauges.every((gauge) => gauge.measured) ?? true,
    download: downloaded,
    knit: measure?.done ?? false,
  };
  const order = ['design', ...(swatch ? ['swatch'] : []), 'download', 'knit'] as (keyof typeof done)[];
  const current = tone === 'checking' ? null : order.find((step) => !done[step]) ?? null;
  const state = (step: keyof typeof done): StepState => (done[step] ? 'done' : current === step ? 'current' : 'todo');
  const number = (step: keyof typeof done) => order.indexOf(step) + 1;
  return <aside className="sweater-status" aria-label="Status">
    <section className={`status-card tone-${tone}`} role="status">
      <Icon size={22} className={tone === 'checking' ? 'spin' : undefined} />
      <div><strong data-testid="readiness-headline">{title}</strong>{detail && <p>{detail}</p>}</div>
    </section>
    <ol className="status-steps" aria-label="Steps">
      <Step number={number('design')} title="Design" state={state('design')}><Notes notes={notes} /></Step>
      {swatch && <Step number={number('swatch')} title="Measure a swatch" state={state('swatch')}>
        <ul className="swatch-gauges">{swatch.gauges.map((gauge) => <li key={gauge.name} className={gauge.measured ? 'measured' : ''}>{gauge.name}<span>{gauge.measured ? 'measured' : 'typical values'}</span></li>)}</ul>
        {!done.swatch && swatch.file?.onDownload && <p className="step-hint">Knit the swatch file, wash and dry it like the finished piece, then measure 10 cm in the middle.</p>}
        <div className="step-buttons">
          {swatch.file?.onDownload && <button type="button" className="secondary-button step-action" disabled={swatch.file.writing} onClick={swatch.file.onDownload}>{swatch.file.writing ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}{swatch.file.writing ? 'Writing the swatch file…' : 'Download swatch file'}</button>}
          <button type="button" className="secondary-button step-action" onClick={swatch.onEnter}><Ruler size={15} />{done.swatch ? 'Change your swatch' : 'Enter your swatch'}</button>
        </div>
        {swatch.file?.problem && <p className="piece-error" role="alert">{swatch.file.problem}</p>}
      </Step>}
      <Step number={number('download')} title="Download" state={state('download')}>
        <section className="status-pieces" aria-label="Machine files">
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
        <div className="status-actions">
          <button type="button" className="primary-button" disabled={!canPackage || packaging} onClick={onPackage}>{packaging ? <LoaderCircle size={16} className="spin" /> : <Package size={16} />}Download knitting package</button>
          <button type="button" className="secondary-button" disabled={!canPrint} onClick={onPrint}><Printer size={16} />Print knitting sheet</button>
        </div>
      </Step>
      <Step number={number('knit')} title="Knit" state={state('knit')}>
        {atTheMachine.length > 0 && <ul className="status-notes operator">{atTheMachine.map((note, index) => <li key={index}>{note}</li>)}</ul>}
        {measure && <div className="after-knitting">{measure.content}</div>}
      </Step>
    </ol>
    {footer}
  </aside>;
}
