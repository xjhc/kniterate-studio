import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, CircleAlert, Download, Info, LoaderCircle, Package, Printer, Ruler } from 'lucide-react';
import type { StoryStatus } from '../handoff';
import { MACHINE_START_CHECKS } from '../readiness';

/**
 * One status and the next useful action. What it means, the other things to
 * check, single files and machine preparation open on demand; disclosure never
 * changes whether a file can be exported. While a change is checked, the last
 * result stays in place, dimmed with its buttons off: nothing jumps, and
 * nothing stale can be applied or downloaded.
 */

export type StatusTone = 'checking' | 'ready' | 'next' | 'warn' | 'blocked';

/** A readiness story's status as a tone, for the panel and the top bar alike. */
export function storyTone(status: StoryStatus): Exclude<StatusTone, 'checking'> {
  return status === 'ready' ? 'ready' : status === 'blocked' ? 'blocked' : status === 'needs-measurements' ? 'next' : 'warn';
}

export interface StatusNote {
  severity: 'error' | 'warning' | 'info';
  /** What is wrong, in a few words. */
  text: string;
  /** The next step in words, where no button takes it. */
  action?: string | null;
  /** What it leads to, and any other way to fix it: in Why?. */
  why?: string | null;
  /** Buttons that fix the problem or go to it. */
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
  file?: { onDownload: (() => void) | null; writing: boolean; problem: string | null; downloaded?: boolean };
}

interface StatusPanelProps {
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
  /** Whether this design's files have been downloaded since its last change. */
  downloaded: boolean;
  /** The swatch to measure, for a project sized in cm. */
  swatch?: SwatchStep;
  /** What to check or set at the machine before knitting. */
  atTheMachine: string[];
  footer?: ReactNode;
  /** The open file's detail, shown under its row. */
  fileDetail?: { id: string; content: ReactNode };
}

/** The part of the panel that stays on screen while the next change is checked. */
type Result = Pick<StatusPanelProps, 'tone' | 'title' | 'detail' | 'notes' | 'atTheMachine' | 'canPackage' | 'canPrint'>;

function Notes({ notes, disabled }: { notes: StatusNote[]; disabled: boolean }) {
  if (notes.length === 0) return null;
  return <ul className="status-notes">{notes.map((note, index) => <li key={index} className={`note-${note.severity}`}>
    {note.text}
    {note.action && <p className="step-hint">{note.action}</p>}
    {note.why && <p className="step-hint">{note.why}</p>}
    {note.actions && <fieldset className="note-actions" disabled={disabled}>{note.actions}</fieldset>}
  </li>)}</ul>;
}

export function StatusPanel(props: StatusPanelProps) {
  const { files, onOpenFile, onDownloadFile, onPackage, onPrint, packaging, downloaded, swatch, footer, fileDetail } = props;
  const checking = props.tone === 'checking';
  // Read in render on purpose: the result shown until the next one is the last one checked.
  const settled = useRef<Result | null>(null);
  if (!checking) settled.current = props;
  const { tone, title, detail, notes, atTheMachine, canPackage, canPrint } = (checking ? settled.current : null) ?? props;
  // Nothing checked yet: there is no result to keep.
  const waiting = tone === 'checking';
  const Icon = waiting ? LoaderCircle : tone === 'ready' ? CheckCircle2 : tone === 'next' ? Info : tone === 'warn' ? AlertTriangle : CircleAlert;
  const measured = swatch?.gauges.every((gauge) => gauge.measured) ?? true;
  const swatchFile = swatch?.file?.onDownload ? swatch.file : null;
  const swatchDownloaded = swatchFile?.downloaded === true;
  const lead = tone === 'blocked' || tone === 'warn' ? notes.find((note) => note.severity === 'error') ?? notes[0] : undefined;
  const others = notes.filter((note) => note !== lead);
  // The one next step: fix what blocks, else measure a swatch, else download, else print and go to the machine.
  const next = waiting || lead ? null
    : swatch && !measured ? (swatchFile && !swatchDownloaded ? 'swatch-file' : 'swatch-enter')
      : canPackage ? (downloaded && canPrint ? 'print' : 'package')
        : null;
  const startChecks = [...new Set([...atTheMachine, ...(swatchFile ? MACHINE_START_CHECKS : [])])];
  // A download sends you to the machine: its checks open once, and stay as you leave them.
  const [machineOpen, setMachineOpen] = useState(false);
  useEffect(() => { if (downloaded || swatchDownloaded) setMachineOpen(true); }, [downloaded, swatchDownloaded]);
  const why = lead ? lead.why : tone === 'blocked' ? null : detail;

  const swatchDownload = (primary: boolean) => swatchFile && <button type="button" className={primary ? 'primary-button' : 'secondary-button'} disabled={swatchFile.writing} onClick={swatchFile.onDownload!}>{swatchFile.writing ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}{swatchFile.writing ? 'Writing the swatch file…' : 'Download swatch file'}</button>;
  const swatchEnter = (primary: boolean) => swatch && <button type="button" className={primary ? 'primary-button' : 'secondary-button'} onClick={swatch.onEnter}><Ruler size={15} aria-hidden="true" />{measured ? 'Change your swatch' : 'Enter your swatch'}</button>;
  const packageButton = (primary: boolean) => <button type="button" className={primary ? 'primary-button' : 'secondary-button'} disabled={checking || !canPackage || packaging} onClick={onPackage}>{packaging ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Package size={16} aria-hidden="true" />}{packaging ? 'Writing the knitting package…' : 'Download knitting package'}</button>;
  const printButton = (primary: boolean) => <button type="button" className={primary ? 'primary-button' : 'secondary-button'} disabled={checking || !canPrint} onClick={onPrint}><Printer size={16} aria-hidden="true" />Print knitting sheet</button>;

  return <aside id="status-panel" className={`sweater-status${checking ? ' is-checking' : ''}`} aria-label="Status" aria-busy={checking}>
    <section className={`status-card tone-${tone}`} role="status">
      <Icon size={20} className={waiting ? 'spin' : undefined} aria-hidden="true" />
      <div><strong data-testid="readiness-headline">{title}</strong>{tone === 'blocked' && !lead && detail && <p>{detail}</p>}</div>
      {/* Shown only if the check takes a moment, so a quick one changes nothing on screen. */}
      {checking && !waiting && <span className="status-busy" aria-hidden="true"><LoaderCircle size={14} className="spin" /></span>}
    </section>
    {lead && <section className="status-next" aria-label="Next step">
      <p className="status-reason">{lead.text}</p>
      {lead.action && <p className="step-hint">{lead.action}</p>}
      {lead.actions && <fieldset className="note-actions" disabled={checking}>{lead.actions}</fieldset>}
    </section>}
    {next && <div className="status-actions" aria-label="Next step">
      {next === 'print' && <p className="status-done"><Check size={14} aria-hidden="true" />Downloaded</p>}
      {next === 'swatch-enter' && swatchDownloaded && <p className="status-done"><Check size={14} aria-hidden="true" />Swatch file downloaded</p>}
      {next === 'swatch-file' && swatchDownload(true)}
      {next === 'swatch-enter' && swatchEnter(true)}
      {next === 'package' && packageButton(true)}
      {next === 'print' && printButton(true)}
    </div>}
    {swatch?.file?.problem && <p className="piece-error" role="alert">{swatch.file.problem}</p>}
    <div className="status-disclosures">
      {(why || waiting || others.length > 0) && <details id="status-why" className="status-disclosure">
        <summary>Why?{others.length > 0 && <span className="status-more">{others.length} more to check</span>}</summary>
        <div className="status-disclosure-body">
          {why && <p className="step-hint">{why}</p>}
          {waiting && <p className="step-hint">Downloads update when the current design has been checked.</p>}
          <Notes notes={others} disabled={checking} />
        </div>
      </details>}
      {swatch && <details className="status-disclosure">
        <summary>Swatch</summary>
        <div className="status-disclosure-body">
          <ul className="swatch-gauges">{swatch.gauges.map((gauge) => <li key={gauge.name} className={gauge.measured ? 'measured' : ''}>{gauge.name}<span>{gauge.measured ? 'measured' : 'typical values'}</span></li>)}</ul>
          {!measured && <p className="step-hint">Knit a swatch, wash and dry it like the finished piece, then measure 10 cm in the middle.</p>}
          <div className="step-buttons">
            {next !== 'swatch-file' && swatchDownload(false)}
            {next !== 'swatch-enter' && swatchEnter(false)}
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
            {next !== 'package' && packageButton(false)}
            {next !== 'print' && printButton(false)}
          </div>
          {footer}
        </div>
      </details>
      {startChecks.length > 0 && <details className="status-disclosure" open={machineOpen} onToggle={(event) => setMachineOpen(event.currentTarget.open)}>
        <summary>Before knitting</summary>
        <section className="status-disclosure-body at-the-machine" aria-label="At the machine">
          <p className="step-hint">Check these at the machine before every run, including a swatch.</p>
          <ul className="status-notes operator">{startChecks.map((note) => <li key={note}>{note}</li>)}</ul>
        </section>
      </details>}
    </div>
  </aside>;
}
