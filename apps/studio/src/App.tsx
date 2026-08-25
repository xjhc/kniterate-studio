import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Code2,
  Download,
  FileCode2,
  FilePlus2,
  FileUp,
  Grid3X3,
  ListChecks,
  Moon,
  PanelRight,
  Printer,
  Rows3,
  Sun,
  X,
} from 'lucide-react';
import { matchKnitProvenArtifact } from '@kniterate-studio/machine-lib/browser';
import { MAX_MACHINE_SOURCE_BYTES_V1, compareKcDocuments, openMachineDocument, rejectOversizedMachineDocument, rejectUnreadableMachineDocument, resolveAuthoredVerdict, type AuthoredVerdict, type MachineDiagnostic, type MachineDocument, type MachinePass } from './engine';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject, renameColorworkProject, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { useBlanketCompiler } from './blanket/useBlanketCompiler';
import type { BlanketCompileArtifact } from './blanket/compileProject';
import { ChartWorkspace } from './chart/ChartWorkspace';
import { useKCodeArtifact } from './kcode/useKCodeArtifact';
import type { KCodeArtifact } from './kcode/kcodeProtocol';
import { MachineMovementView, type MachineMovementViewProps } from './kcode/MachineMovementView';
import { programRegionForPass } from './chart/AuthoredMachinePanel';
import { NewProjectDialog, ProjectSettingsDialog, DEFAULT_PROJECT_PALETTE, type NewProjectValues } from './chart/ProjectDialogs';
import { readProjectAutosave, serializeProjectAutosave, PROJECT_AUTOSAVE_KEY } from './chart/projectAutosave';
import { indexSourceLines, sourceWindow } from './sourceWindow';

const ROW_HEIGHT = 44;
const CARRIER_COLORS: Record<string, string> = {
  '1': '#d95d48', '2': '#33866a', '3': '#d49b32', '4': '#4e75b8', '5': '#9b60a8', '6': '#67584c',
};

function useModalFocusTrap(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocus = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
    if (!dialog) return;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    (focusable()[0] ?? dialog).focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0]!; const last = items.at(-1)!;
      if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.document.addEventListener('keydown', handler);
    return () => { window.document.removeEventListener('keydown', handler); returnFocus?.focus(); };
  }, []);
  return dialogRef;
}

type MobileView = 'movement' | 'passes' | 'diagnostics' | 'source';

export async function readMachineFile(file: File): Promise<MachineDocument> {
  if (file.size > MAX_MACHINE_SOURCE_BYTES_V1) {
    return rejectOversizedMachineDocument(file.name, file.size);
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return file.name.toLowerCase().endsWith('.kc')
      ? openMachineDocument(file.name, bytes, { dialect: 'knitout-vendor' })
      : openMachineDocument(file.name, bytes, {});
  } catch (error) {
    return rejectUnreadableMachineDocument(
      file.name,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function defaultProject(): ColorworkProjectV1 {
  return createColorworkProjectV1({
    kind: 'knitlab-colorwork-chart', version: 1, title: 'Untitled colorwork', width: 200, height: 300, rowNumbering: 'bottom-up',
    palette: DEFAULT_PROJECT_PALETTE.map((entry) => ({ ...entry })),
    cells: Array.from({ length: 300 }, () => Array.from({ length: 200 }, () => 0)),
  }, { id: 'studio-default', title: 'Untitled colorwork' });
}

function initialProject(): { project: ColorworkProjectV1; recoveredAt: string | null } {
  let recovered: ReturnType<typeof readProjectAutosave> = null;
  try {
    recovered = readProjectAutosave(window.localStorage);
  } catch {
    // Storage can be disabled by the browser; the editor must still start.
  }
  return recovered ? { project: recovered.project, recoveredAt: recovered.savedAt } : { project: defaultProject(), recoveredAt: null };
}

function projectId(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'colorwork';
  return `${slug}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function CompilePipeline({ project, compile, kcode }: {
  project: ColorworkProjectV1;
  compile: ReturnType<typeof useBlanketCompiler>;
  kcode: ReturnType<typeof useKCodeArtifact>;
}) {
  const state = materializeColorworkProject(project).state;
  const stages = [
    { label: 'Chart', detail: `${state.chart.width}x${state.chart.height} · ${state.chart.palette.length} colors`, state: 'ready' },
    { label: 'Plan', detail: state.strategy.technique, state: compile.status === 'failed' || compile.artifact?.ok === false ? 'blocked' : compile.status === 'compiling' ? 'working' : 'ready' },
    { label: 'KCode', detail: kcode.artifact ? `${kcode.artifact.passCount.toLocaleString()} emitted passes` : kcode.status === 'converting' ? 'lowering' : 'waiting', state: kcode.status === 'failed' ? 'blocked' : kcode.artifact ? 'ready' : 'working' },
    { label: 'Proof', detail: kcode.status === 'ready' ? kcode.artifact?.ok ? 'trace + replay clear' : 'blocked' : kcode.status === 'failed' ? 'failed' : kcode.status === 'converting' ? 'checking exact output' : 'waiting', state: kcode.status === 'ready' ? kcode.artifact?.ok ? 'ready' : 'blocked' : kcode.status === 'failed' ? 'blocked' : 'working' },
  ];
  return <ol className="compile-pipeline" aria-label="Compile pipeline">{stages.map((stage, index) => <li key={stage.label} className={stage.state}>
    {index > 0 && <i aria-hidden="true" />}
    <span><b>{stage.label}</b><small>{stage.detail}</small></span>
  </li>)}</ol>;
}

function Verdict({ document, onClick }: { document: MachineDocument; onClick: () => void }) {
  return (
    <button className={`verdict verdict-${document.verdict.state}`} type="button" onClick={onClick}>
      <span className="verdict-dot" />
      {document.verdict.label}
      <ChevronDown size={14} />
    </button>
  );
}

function AuthoredVerdictBadge({ verdict, onClick }: { verdict: AuthoredVerdict; onClick: () => void }) {
  return <button className={`verdict authored-verdict verdict-${verdict.state}`} type="button" title={verdict.annotation} aria-label={`Verdict: ${verdict.label}`} onClick={onClick}><span className="verdict-dot" />{verdict.label}</button>;
}

function EmptyState({ active, onOpen, onDrop }: { active: boolean; onOpen: () => void; onDrop: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <main
      className={`empty-state${dragging ? ' dragging' : ''}`}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLElement>) => {
        event.preventDefault(); setDragging(false);
        if (event.dataTransfer.files[0]) onDrop(event.dataTransfer.files[0]);
      }}
    >
      <div className="empty-mark"><FileCode2 size={30} /></div>
      <h1>Open a machine file</h1>
      <p>.kc or Knitout .k</p>
      <button className="primary-button" type="button" onClick={onOpen} disabled={!active}>
        <FileUp size={17} /> Choose file
      </button>
      <span className="local-note">Stays on this device</span>
    </main>
  );
}

function PassGrid({ passes, selected, collapsed, onToggle, onSelect, compiled = false }: {
  passes: readonly MachinePass[];
  selected: number;
  collapsed: ReadonlySet<string>;
  onToggle: (section: string) => void;
  onSelect: (index: number) => void;
  compiled?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const grouped = useMemo(() => {
    const rows: Array<{ kind: 'section'; section: string; count: number } | { kind: 'pass'; pass: MachinePass }> = [];
    let current = '';
    for (const pass of passes) {
      if (pass.section !== current) {
        current = pass.section;
        rows.push({ kind: 'section', section: current, count: passes.filter((item) => item.section === current).length });
      }
      if (!collapsed.has(current)) rows.push({ kind: 'pass', pass });
    }
    return rows;
  }, [passes, collapsed]);
  const height = viewportRef.current?.clientHeight ?? 600;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const end = Math.min(grouped.length, start + Math.ceil(height / ROW_HEIGHT) + 10);

  useEffect(() => {
    const rowIndex = grouped.findIndex((row) => row.kind === 'pass' && row.pass.index === selected);
    if (rowIndex < 0 || !viewportRef.current) return;
    const top = rowIndex * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < viewportRef.current.scrollTop) viewportRef.current.scrollTop = top;
    else if (bottom > viewportRef.current.scrollTop + viewportRef.current.clientHeight) viewportRef.current.scrollTop = bottom - viewportRef.current.clientHeight;
  }, [selected, grouped]);

  return (
    <div className="pass-table">
      <div className="pass-head" aria-hidden="true">
        <span>Pass</span><span>Direction</span><span>Carrier</span><span>Action</span><span>{compiled ? 'Bed / mode' : 'Bed'}</span><span>{compiled ? 'Design' : 'Needles'}</span><span>Rack</span><span>Speed</span><span>Roller</span>
      </div>
      <div className="pass-viewport" ref={viewportRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <div className="pass-spacer" style={{ height: grouped.length * ROW_HEIGHT }}>
          {grouped.slice(start, end).map((row, offset) => {
            const rowIndex = start + offset;
            if (row.kind === 'section') return (
              <button className="section-row" style={{ top: rowIndex * ROW_HEIGHT }} key={`${row.section}-${rowIndex}`} type="button" onClick={() => onToggle(row.section)}>
                {collapsed.has(row.section) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                <strong>{row.section}</strong><span>{row.count.toLocaleString()} passes</span>
              </button>
            );
            const pass = row.pass;
            return (
              <button
                className={`pass-row${pass.index === selected ? ' selected' : ''}${pass.ghost ? ' ghost' : ''}`}
                style={{ top: rowIndex * ROW_HEIGHT }} key={pass.index} type="button" onClick={() => onSelect(pass.index)}
              >
                <span className="pass-number">{pass.index + 1}</span>
                <span className="direction">{pass.direction ?? '•'}</span>
                <span>{pass.carriers.length ? pass.carriers.map((carrier) => <i className="carrier-chip" style={{ '--carrier': CARRIER_COLORS[carrier] } as CSSProperties} key={carrier}>C{carrier}</i>) : <em>none</em>}</span>
                <span><code>{pass.type}</code></span><span>{pass.beds}</span><span>{pass.needleSpan}</span>
                <span>{pass.rack ?? '—'}</span><span>{pass.speed ?? '—'}</span><span>{pass.roller ?? '—'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function kcodeOverallContext(kcode: KCodeArtifact): NonNullable<MachineMovementViewProps['overallContext']> {
  const errorCount = kcode.messages.filter((message) => message.severity === 'error').reduce((count, message) => count + (message.occurrences ?? 1), 0);
  const warningCount = kcode.messages.filter((message) => message.severity === 'warning').reduce((count, message) => count + (message.occurrences ?? 1), 0);
  if (!kcode.ok || errorCount > 0) {
    const blockingCount = Math.max(1, errorCount);
    return {
      status: 'blocked',
      label: `${blockingCount} blocking exact-output finding${blockingCount === 1 ? '' : 's'} across strict parsing, replay, and scheduled-pass differential checks.`,
    };
  }
  if (warningCount > 0) return {
    status: 'warning',
    label: `${warningCount} exact-output warning${warningCount === 1 ? '' : 's'} across the whole artifact.`,
  };
  return {
    status: 'clear',
    label: 'No error or warning findings from strict parsing, KCode replay, or scheduled-pass differential checks.',
  };
}

function documentOverallContext(document: MachineDocument): NonNullable<MachineMovementViewProps['overallContext']> {
  const errors = document.stats.errorCount;
  const warnings = document.stats.warningCount;
  if (document.verdict.state === 'blocked' || errors > 0) return { status: 'blocked', label: document.verdict.annotation };
  if (warnings > 0) return { status: 'warning', label: `${warnings} finding${warnings === 1 ? '' : 's'} across the imported artifact. ${document.verdict.annotation}` };
  return { status: 'clear', label: document.verdict.annotation };
}

function CompiledMachineWorkspace({ artifact, kcode, outputStatus, outputError, focusedRowId, onFocusedRowId }: { artifact: BlanketCompileArtifact; kcode: KCodeArtifact | null; outputStatus: 'idle' | 'converting' | 'ready' | 'failed'; outputError: string | null; focusedRowId: string | null; onFocusedRowId: (rowId: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const focusedPass = kcode?.rowPasses.find((row) => row.rowId === focusedRowId)?.passIndices[0] ?? kcode?.scene?.passes[0]?.passIndex ?? 0;
  const [selected, setSelected] = useState(focusedPass);
  useEffect(() => setSelected(focusedPass), [focusedPass]);
  const passes = useMemo<MachinePass[]>(() => (kcode?.scene?.passes ?? []).map((pass, index) => {
    const provenance = kcode?.passProvenance[index];
    const coordinates = [...pass.beds.front, ...pass.beds.rear].map((selection) => selection.kcodeColumn);
    const designRows = (provenance?.rowIds ?? []).flatMap((rowId) => {
      const row = artifact.rowProvenance.find((item) => item.rowId === rowId);
      return row ? [`R${row.displayRow}`] : [rowId];
    });
    const bedLabel = `${pass.beds.front.length ? 'F' : ''}${pass.beds.front.length && pass.beds.rear.length ? '+' : ''}${pass.beds.rear.length ? 'R' : ''}`;
    return {
      index: pass.passIndex,
      direction: pass.direction,
      type: pass.operation,
      carriers: pass.carrier === '0' ? [] : [pass.carrier],
      beds: provenance?.isAutoMove ? 'Auto move' : bedLabel || 'Move',
      needleSpan: coordinates.length ? `K${Math.min(...coordinates)}–K${Math.max(...coordinates)}` : designRows.join(', ') || 'No selections',
      rack: pass.rack,
      speed: pass.speed.value,
      roller: pass.roller.value,
      lineStart: kcode?.passLines[index]?.lineStart ?? 0,
      lineEnd: kcode?.passLines[index]?.lineEnd ?? 0,
      section: programRegionForPass(kcode!, index).replace(/^./, (value) => value.toUpperCase()),
      ghost: provenance?.isAutoMove ?? false,
    };
  }), [artifact, kcode]);
  const selectPass = (index: number) => {
    setSelected(index);
    const rowId = kcode?.passProvenance[index]?.rowIds[0];
    if (rowId) onFocusedRowId(rowId);
  };
  const outputMessages = kcode?.messages ?? [];
  const errors = [...artifact.messages, ...outputMessages].filter((message) => message.severity === 'error');
  const outputWarnings = outputMessages.filter((message) => message.severity === 'warning');
  const errorCount = errors.reduce((count, message) => count + (message.occurrences ?? 1), 0);
  const outputWarningCount = outputWarnings.reduce((count, message) => count + (message.occurrences ?? 1), 0);
  const findingGroups = [...outputMessages.reduce((groups, message) => {
    const group = groups.get(message.rule);
    if (group) group.count += message.occurrences ?? 1;
    else groups.set(message.rule, {
      diagnostic: {
        ...message,
        passIndex: kcode?.validation?.diagnostics.find((item) => item.rule === message.rule)?.passIndex ?? null,
      },
      count: message.occurrences ?? 1,
    });
    return groups;
  }, new Map<string, { diagnostic: { severity: 'error' | 'warning' | 'info'; rule: string; message: string; passIndex: number | null }; count: number }>()).values()];
  const sourceLines = useMemo(() => kcode?.kcText.split(/\r\n|\r|\n/) ?? [], [kcode]);
  const sourceSpan = kcode?.passLines[selected];
  const sourceFrom = Math.max(1, (sourceSpan?.lineStart ?? 1) - 6);
  const sourceTo = Math.min(sourceLines.length, (sourceSpan?.lineEnd ?? 1) + 6);
  return <div className="workspace">
    <nav className="side-rail" aria-label="Workspace views"><button className="active" type="button" title="Machine passes"><Rows3 size={19} /></button></nav>
    <main className="machine-workspace compiled-workspace">
      <div className="workspace-head"><div><span className="eyebrow">Compiled project</span><h1>Exact emitted machine trace</h1></div><div className="stat-strip"><span><b>{(kcode?.passCount ?? 0).toLocaleString()}</b> passes</span><span><b>{artifact.stats.patternColors}</b> pattern colors</span><span><b>{artifact.stats.needles}</b> design columns</span><span><b>{errorCount + (outputStatus === 'failed' ? 1 : 0)}</b> errors</span></div></div>
      <div className="compiled-machine-layout">
        {kcode?.scene ? <MachineMovementView className="compiled-movement" scene={kcode.scene} validation={kcode.validation} overallContext={kcodeOverallContext(kcode)} selectedPass={selected} onSelect={selectPass} />
          : kcode ? <div className="compiled-movement compiled-blocked" role="alert"><CircleAlert size={18} /><span><strong>Exact machine scene blocked</strong><small>{outputMessages.find((message) => message.severity === 'error')?.message ?? 'Strict parsing or MachineTrace projection did not produce an inspectable scene.'}</small></span></div>
            : outputStatus === 'failed' || outputStatus === 'ready' ? <div className="compiled-movement compiled-blocked" role="alert"><CircleAlert size={18} /><span><strong>KCode generation failed</strong><small>{outputError ?? 'Generation completed without an inspectable exact-output artifact.'}</small></span></div>
              : <div className="compiled-movement compiled-clear" role="status"><span className="spin-dot" /><strong>Strictly parsing and validating emitted KCode…</strong></div>}
        <PassGrid passes={passes} selected={selected} collapsed={collapsed} onToggle={(section) => setCollapsed((current) => { const next = new Set(current); next.has(section) ? next.delete(section) : next.add(section); return next; })} onSelect={selectPass} compiled />
        <section className="diagnostics-panel"><div className="panel-title"><span><ListChecks size={15} /> Exact-output checks</span><b>{outputWarningCount} warnings</b></div><div className="diagnostic-list">{findingGroups.length === 0 ? kcode?.ok ? <div className="compiled-clear"><CheckCircle2 size={18} /><strong>No exact-output findings</strong></div> : <div className="compiled-blocked" role="alert"><CircleAlert size={18} /><span><strong>Exact-output evidence unavailable</strong><small>{outputError ?? 'No completed strict KCode artifact is available.'}</small></span></div> : findingGroups.map(({ diagnostic, count }) => <button type="button" disabled={diagnostic.passIndex === null} onClick={() => { if (diagnostic.passIndex !== null) selectPass(diagnostic.passIndex); }} className={`compiled-finding severity-${diagnostic.severity}`} key={diagnostic.rule}>{diagnostic.severity === 'error' ? <CircleAlert size={15} /> : diagnostic.severity === 'warning' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}<span><strong>{diagnostic.rule}{count > 1 ? ` · ${count} occurrences` : ''}</strong><small>{diagnostic.message}</small></span></button>)}</div></section>
        <section className="source-dock"><div className="panel-title"><span><Code2 size={15} /> Generated K-code</span><b>{kcode ? `${kcode.passCount.toLocaleString()} passes · ${kcode.kcHash.slice(0, 12)}` : outputStatus === 'failed' || outputStatus === 'ready' ? 'Unavailable' : 'Converting'}</b></div><pre>{kcode ? sourceLines.slice(sourceFrom - 1, sourceTo).map((line, offset) => { const lineNumber = sourceFrom + offset; const highlighted = lineNumber >= (sourceSpan?.lineStart ?? 0) && lineNumber <= (sourceSpan?.lineEnd ?? 0); return <span className={highlighted ? 'source-line highlighted' : 'source-line'} key={lineNumber}><i>{lineNumber}</i><code>{line || ' '}</code></span>; }) : <span className="source-line"><i /><code>{outputStatus === 'failed' || outputStatus === 'ready' ? outputError ?? 'No exact KCode artifact was produced.' : 'Waiting for validated conversion…'}</code></span>}</pre></section>
      </div>
    </main>
  </div>;
}

function DiagnosticItem({ item, active, onClick }: { item: MachineDiagnostic; active: boolean; onClick: () => void }) {
  const Icon = item.severity === 'error' ? CircleAlert : item.severity === 'warning' ? AlertTriangle : CheckCircle2;
  return (
    <button className={`diagnostic-item severity-${item.severity}${active ? ' active' : ''}`} type="button" onClick={onClick}>
      <Icon size={16} />
      <span><strong>{item.title}</strong><small>{item.explanation}</small>{item.rawMessage !== item.explanation && <small className="raw-message">{item.rawMessage}</small>}</span>
      {(item.passIndex !== null || item.line !== null) && <b>{item.passIndex !== null ? `P${item.passIndex + 1}` : `L${item.line}`}</b>}
    </button>
  );
}

function Diagnostics({ document, selected, onSelect }: { document: MachineDocument; selected: number; onSelect: (pass: number, line: number | null) => void }) {
  return (
    <aside className="diagnostics-panel" aria-label="Diagnostics">
      <div className="panel-title"><span><ListChecks size={16} /> Diagnostics</span><b>{document.stats.errorCount} errors · {document.stats.warningCount} warnings</b></div>
      <div className="diagnostic-list">
        {document.diagnostics.length === 0 ? (
          <div className="diagnostic-clear"><CheckCircle2 size={22} /><strong>No validator findings</strong><span>Strict parse, trace projection, and replay completed cleanly.</span></div>
        ) : document.diagnostics.map((item) => <DiagnosticItem key={item.id} item={item} active={item.passIndex === selected} onClick={() => onSelect(item.passIndex ?? selected, item.line)} />)}
      </div>
    </aside>
  );
}

export function SourceDock({ document, selected, preferredLine }: { document: MachineDocument; selected: number; preferredLine: number | null }) {
  const pass = document.passes[selected];
  const focusLine = preferredLine ?? pass?.lineEnd ?? 1;
  const sourceIndex = useMemo(() => indexSourceLines(document.source), [document.source]);
  const window = useMemo(
    () => sourceWindow(document.source, focusLine, 8, 2_048, sourceIndex),
    [document.source, focusLine, sourceIndex],
  );
  const resourceLimited = document.kcode?.document?.metadata.recordMaterialization === 'resource-limited'
    || document.diagnostics.some((finding) => finding.rule === 'knitout-resource-limit');
  return (
    <section className="source-dock">
      <div className="panel-title"><span><Code2 size={16} /> Source</span><b>{document.format.toUpperCase()} · lines {window.from}-{window.to} of {window.totalLines.toLocaleString()}</b></div>
      <pre>{(resourceLimited || window.truncatedLineCount > 0) && <span className="source-preview-note">Preview bounded for safe inspection; the exact imported source remains retained for audit.</span>}{window.lines.map(({ lineNumber, text }) => {
        const highlighted = lineNumber >= (pass?.lineStart ?? focusLine) && lineNumber <= (pass?.lineEnd ?? focusLine);
        return <span className={highlighted ? 'source-line highlighted' : 'source-line'} key={lineNumber}><i>{lineNumber}</i><code>{text || ' '}</code></span>;
      })}</pre>
    </section>
  );
}

function VerdictPanel({ document, onClose }: { document: MachineDocument; onClose: () => void }) {
  return (
    <div className="popover verdict-panel">
      <div className="popover-head"><strong>Verdict</strong><button className="icon-button" type="button" onClick={onClose} aria-label="Close verdict"><X size={16} /></button></div>
      <div className={`verdict-summary verdict-${document.verdict.state}`}><span className="verdict-dot" /><strong>{document.verdict.label}</strong></div>
      <p>{document.verdict.annotation}</p>
      <ol className="verdict-ladder">
        <li className={document.verdict.state === 'blocked' ? 'current' : ''}><i />Blocked</li>
        <li className={document.verdict.state === 'surface' ? 'current' : ''}><i />Surface-proven</li>
        <li className={document.verdict.state === 'knit' ? 'current' : ''}><i />Knit-proven</li>
      </ol>
      <span className="profile-chip">7gg worsted · 252 needles</span>
    </div>
  );
}

function AuthoredVerdictPanel({ verdict, onClose }: { verdict: AuthoredVerdict; onClose: () => void }) {
  return <div className="popover verdict-panel">
    <div className="popover-head"><strong>Output verdict</strong><button className="icon-button" type="button" onClick={onClose} aria-label="Close verdict"><X size={16} /></button></div>
    <div className={`verdict-summary verdict-${verdict.state}`}><span className="verdict-dot" /><strong>{verdict.label}</strong></div>
    <p>{verdict.annotation}</p>
    <ol className="verdict-ladder"><li className={verdict.state === 'blocked' ? 'current' : ''}><i />Blocked</li><li className={verdict.state === 'surface' ? 'current' : ''}><i />Surface-proven</li><li className={verdict.state === 'knit' ? 'current' : ''}><i />Knit-proven</li></ol>
    <span className="profile-chip">7gg worsted / 252-needle bed</span>
  </div>;
}

function RunSheet({ document, onClose }: { document: MachineDocument; onClose: () => void }) {
  const dialogRef = useModalFocusTrap(onClose);
  return (
    <div className="modal-backdrop">
      <article className="run-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="machine-run-title" tabIndex={-1}>
        <div className="run-sheet-actions"><button className="secondary-button" type="button" onClick={onClose}><X size={16} /> Close</button><button className="primary-button" type="button" onClick={() => window.print()}><Printer size={16} /> Print</button></div>
        <header><span>KNITERATE STUDIO · RUN SHEET</span><h1 id="machine-run-title">{document.filename}</h1><div className={`print-verdict verdict-${document.verdict.state}`}>{document.verdict.label}</div></header>
        <p className="run-annotation">{document.verdict.annotation}</p>
        <section><h2>Machine program</h2><dl><div><dt>Profile</dt><dd>7gg worsted · 252-needle bed</dd></div><div><dt>Passes</dt><dd>{document.stats.passCount.toLocaleString()}</dd></div><div><dt>Needles</dt><dd>{document.stats.needleSpan}</dd></div><div><dt>Rack range</dt><dd>{document.stats.rackRange}</dd></div></dl></section>
        <section><h2>Carrier map</h2><div className="carrier-map">{document.stats.carriers.length ? document.stats.carriers.map((carrier) => <span key={carrier}><i style={{ background: CARRIER_COLORS[carrier] }} />C{carrier}<b>{carrier === '1' ? 'Draw thread' : carrier === '6' ? 'Waste yarn' : 'Pattern yarn'}</b></span>) : <em>No carriers found</em>}</div></section>
        {document.diagnostics.length > 0 && <section><h2>Known findings</h2><ul>{document.diagnostics.filter((item) => item.severity !== 'info').map((item) => <li key={item.id}><b>{item.severity.toUpperCase()}</b> {item.title}{item.passIndex !== null ? ` · pass ${item.passIndex + 1}` : ''}</li>)}</ul></section>}
        <section><h2>Pre-knit check</h2><ul className="checklist"><li>Correct yarns loaded in the carrier map above</li><li>Needle bed is clear and carriage moves freely</li><li>Waste yarn and draw thread are available</li><li>Machine settings match the 7gg worsted profile</li><li>Representative swatch has been knit and inspected</li></ul></section>
        <footer>Generated locally · {new Date().toLocaleDateString()}</footer>
      </article>
    </div>
  );
}

function AuthoredRunSheet({ project, compiled, kcode, verdict, onClose }: { project: ColorworkProjectV1; compiled: BlanketCompileArtifact; kcode: KCodeArtifact; verdict: AuthoredVerdict; onClose: () => void }) {
  const { state } = materializeColorworkProject(project);
  const dialogRef = useModalFocusTrap(onClose);
  const needleEnd = state.machine.needleOffset + state.chart.width - 1;
  const findings = [...new Map([...compiled.messages, ...kcode.messages].filter((message) => message.severity !== 'info').map((message) => [message.rule, message])).values()];
  return <div className="modal-backdrop"><article className="run-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="authored-run-title" tabIndex={-1}>
    <div className="run-sheet-actions"><button className="secondary-button" type="button" onClick={onClose}><X size={16} /> Close</button><button className="primary-button" type="button" onClick={() => window.print()}><Printer size={16} /> Print</button></div>
    <header><span>KNITERATE STUDIO · RUN SHEET</span><h1 id="authored-run-title">{project.title}</h1><div className={`print-verdict verdict-${verdict.state}`}>{verdict.label}</div></header>
    <p className="run-annotation">{verdict.annotation}</p>
    <section><h2>Machine program</h2><dl><div><dt>Profile</dt><dd>7gg worsted · 252-needle bed</dd></div><div><dt>Needles</dt><dd>{state.machine.needleOffset}–{needleEnd} ({state.chart.width})</dd></div><div><dt>Design rows</dt><dd>{state.chart.height}</dd></div><div><dt>Backing</dt><dd>{state.strategy.technique}</dd></div><div><dt>K-code passes</dt><dd>{kcode.passCount.toLocaleString()}</dd></div><div><dt>Estimated time</dt><dd>{compiled.stats.estimatedKnitTimeSeconds === null ? '—' : `${Math.ceil(compiled.stats.estimatedKnitTimeSeconds / 60)} min`}</dd></div></dl></section>
    <section><h2>Carrier map</h2><div className="carrier-map"><span><i style={{ background: CARRIER_COLORS['1'] }} />C1<b>{state.frame.drawThread ? 'Draw thread' : 'Not used'}</b></span>{state.machine.yarnAssignments.map((assignment) => { const color = state.chart.palette.find((entry) => entry.id === assignment.paletteId); return <span key={assignment.paletteId}><i style={{ background: color?.hex }} />C{assignment.carrier}<b>{assignment.yarnName}</b></span>; })}<span><i style={{ background: CARRIER_COLORS['6'] }} />C6<b>Waste yarn · {state.frame.wasteRows} rows</b></span></div></section>
    <section><h2>Finish and identity</h2><dl><div><dt>Bind-off</dt><dd>{state.frame.bindOff}</dd></div><div><dt>Project revision</dt><dd>{compiled.revision}</dd></div><div><dt>Compile hash</dt><dd>{compiled.inputHash}</dd></div><div><dt>K-code SHA-256</dt><dd>{kcode.kcHash.slice(0, 16)}</dd></div></dl></section>
    {findings.length > 0 && <section><h2>Known findings</h2><ul>{findings.map((finding) => <li key={finding.rule}><b>{finding.severity.toUpperCase()}</b> {finding.message}</li>)}</ul></section>}
    <section><h2>Pre-knit check</h2><ul className="checklist"><li>C1 draw thread, C6 waste, and C2–C5 pattern yarns match the carrier map</li><li>Needles {state.machine.needleOffset}–{needleEnd} are selected and the remaining bed is clear</li><li>Carriage moves freely and takedown is ready for {state.frame.wasteRows} waste rows</li><li>Machine profile is 7gg worsted and the finish is {state.frame.bindOff}</li><li>A representative swatch has been knit and inspected</li></ul></section>
    <footer>Generated locally · {new Date().toLocaleDateString()}</footer>
  </article></div>;
}

function DiffView({ base, compare, onOpenCompare, onSelect }: { base: MachineDocument; compare: MachineDocument | null; onOpenCompare: () => void; onSelect: (index: number) => void }) {
  const result = useMemo(() => compare && base.format === 'kc' && compare.format === 'kc' ? compareKcDocuments(base, compare) : null, [base, compare]);
  if (base.format !== 'kc') return <div className="diff-empty"><ArrowLeftRight size={26} /><h2>Pass diff requires a .kc file</h2></div>;
  if (!compare) return <div className="diff-empty"><FilePlus2 size={26} /><h2>Choose a comparison file</h2><button className="primary-button" type="button" onClick={onOpenCompare}><FilePlus2 size={16} /> Choose .kc</button></div>;
  if (!result) return null;
  const byteSummary = result.summary.byteIdentical === undefined
    ? null
    : result.summary.byteIdentical
      ? 'KCode bytes are identical.'
      : `KCode bytes differ${result.summary.firstLineDelta ? `; first source-line delta is line ${result.summary.firstLineDelta.index + 1}` : ''}.`;
  const capSummary = result.summary.status === 'compared' && result.summary.deltaCount > result.summary.deltas.length
    ? `Showing the first ${result.summary.deltas.length.toLocaleString()} of ${result.summary.deltaCount.toLocaleString()} exact field deltas; pass windows are limited to this cap, with exact raw pass fields retained for every rendered pass.`
    : result.summary.status === 'compared' && result.summary.deltaCount > 0
      ? `Showing all ${result.summary.deltaCount.toLocaleString()} exact field deltas across ${result.windows.length.toLocaleString()} changed pass${result.windows.length === 1 ? '' : 'es'}.`
      : null;
  return (
    <section className="diff-view">
      <header><div><span className="eyebrow">K-code pass diff</span><h2>{base.filename} <ArrowLeftRight size={16} /> {compare.filename}</h2></div><button className="secondary-button" type="button" onClick={onOpenCompare}><FilePlus2 size={15} /> Replace</button></header>
      <div className={`diff-summary${result.summary.identical ? ' identical' : ''}`}><strong>{result.summary.status === 'blocked' ? 'Strict comparison blocked' : result.summary.identical ? 'Machine-trace identical' : `${result.summary.deltaCount.toLocaleString()} field differences`}</strong><span>{result.summary.generatedPassCount.toLocaleString()} vs {result.summary.referencePassCount.toLocaleString()} passes</span></div>
      {(byteSummary || capSummary) && <div className="diff-disclosure" role="status">{byteSummary && <span>{byteSummary}</span>}{capSummary && <span>{capSummary}</span>}</div>}
      <div className="diff-list">{result.windows.map((window) => {
        const windowId = `strict-diff-window-${window.index}`;
        return <article className="diff-entry" key={window.index}>
          {result.summary.status === 'compared' && <button type="button" aria-label={`Open pass ${window.index + 1} in machine view`} onClick={() => onSelect(window.index)}><b>Inspect pass {window.index + 1}</b></button>}
          <pre id={windowId} tabIndex={0} aria-label={result.summary.status === 'blocked' ? 'Strict comparison blocked details' : `Exact field differences for pass ${window.index + 1}`}>{window.text}</pre>
        </article>;
      })}</div>
    </section>
  );
}

export function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const compareInput = useRef<HTMLInputElement>(null);
  const [document, setDocument] = useState<MachineDocument | null>(null);
  const [compare, setCompare] = useState<MachineDocument | null>(null);
  const [selected, setSelected] = useState(0);
  const [preferredLine, setPreferredLine] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'chart' | 'machine' | 'diff'>('chart');
  const [initial] = useState(initialProject);
  const [project, setProject] = useState<ColorworkProjectV1>(initial.project);
  const [mobileView, setMobileView] = useState<MobileView>('passes');
  const [showVerdict, setShowVerdict] = useState(false);
  const [showRunSheet, setShowRunSheet] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const requested = new URLSearchParams(window.location.search).get('theme');
    return requested === 'light' || requested === 'dark' ? requested : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'saving' | 'saved' | 'failed'>(initial.recoveredAt ? 'saved' : 'saving');
  const blanketCompile = useBlanketCompiler(project);
  const kcodeState = useKCodeArtifact(blanketCompile.artifact);
  const outputCurrent = blanketCompile.artifact?.inputHash != null
    && kcodeState.artifact?.inputHash === blanketCompile.artifact.inputHash;
  const displayedOutputStatus = outputCurrent || kcodeState.status === 'failed' || kcodeState.status === 'idle'
    ? kcodeState.status
    : 'converting';
  const outputReady = outputCurrent && kcodeState.artifact?.ok === true;
  const knitProvenMatch = matchKnitProvenArtifact(
    outputReady ? blanketCompile.artifact?.inputHash : null,
    outputReady ? kcodeState.artifact?.kcHash : null,
  );
  const authoredVerdict = resolveAuthoredVerdict({
    compileStatus: blanketCompile.status,
    compileOk: blanketCompile.artifact?.ok ?? null,
    compileError: blanketCompile.error,
    outputStatus: kcodeState.status,
    outputOk: kcodeState.artifact?.ok ?? null,
    outputCurrent,
    outputError: kcodeState.error,
    knitProvenEntryId: knitProvenMatch?.id ?? null,
  });
  const authoredExportReady = outputReady && authoredVerdict !== null && authoredVerdict.state !== 'blocked';
  const authoredState = useMemo(() => materializeColorworkProject(project).state, [project]);
  useEffect(() => {
    setAutosaveState('saving');
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(PROJECT_AUTOSAVE_KEY, serializeProjectAutosave(project));
        setAutosaveState('saved');
      } catch {
        setAutosaveState('failed');
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [project]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('theme', theme);
    window.history.replaceState(null, '', url);
  }, [theme]);
  const createProject = ({ title, width, height, colorCount }: NewProjectValues) => {
    const palette = DEFAULT_PROJECT_PALETTE.slice(0, colorCount).map((entry) => ({ ...entry }));
    setProject(createColorworkProjectV1({
      kind: 'knitlab-colorwork-chart', version: 1, title, width, height, rowNumbering: 'bottom-up', palette,
      cells: Array.from({ length: height }, () => Array.from({ length: width }, () => 0)),
    }, { id: projectId(title), title }));
    setDocument(null); setCompare(null); setView('chart'); setShowNewProject(false);
  };
  const saveProjectSettings = (title: string, palette: { id: string; name: string; hex: string }[]) => {
    let next = renameColorworkProject(project, title);
    const currentPalette = materializeColorworkProject(next).state.chart.palette;
    for (const entry of palette) {
      const current = currentPalette.find((item) => item.id === entry.id);
      if (current?.name === entry.name.trim() && current.hex.toUpperCase() === entry.hex.toUpperCase()) continue;
      next = appendProjectEdit(next, { id: `palette_${entry.id}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`, source: 'human', edit: { kind: 'set-palette-entry', paletteId: entry.id, name: entry.name.trim(), hex: entry.hex } });
    }
    setProject(next); setShowProjectSettings(false);
  };
  const downloadKCode = () => {
    if (!authoredExportReady || !kcodeState.artifact) return;
    const link = window.document.createElement('a');
    link.href = URL.createObjectURL(new Blob([kcodeState.artifact.kcText], { type: 'text/plain' }));
    link.download = `${project.id}.kc`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const showOpenedDocument = (opened: MachineDocument, comparison: boolean) => {
    if (comparison) { setCompare(opened); setView('diff'); }
    else { setDocument(opened); setCompare(null); setSelected(0); setPreferredLine(null); setMobileView(opened.kcode?.scene ? 'movement' : 'passes'); setView('machine'); }
  };
  const openFile = async (file: File | undefined, comparison = false) => {
    if (!file) return;
    showOpenedDocument(await readMachineFile(file), comparison);
  };
  const handleInput = (event: ChangeEvent<HTMLInputElement>, comparison = false) => {
    void openFile(event.target.files?.[0], comparison); event.target.value = '';
  };
  const select = (pass: number, line: number | null = null) => {
    setSelected(Math.max(0, Math.min(pass, (document?.passes.length ?? 1) - 1))); setPreferredLine(line); setView('machine');
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!document || showRunSheet) return;
      if (view === 'machine' && event.key === 'ArrowDown') { event.preventDefault(); select(selected + 1); }
      if (view === 'machine' && event.key === 'ArrowUp') { event.preventDefault(); select(selected - 1); }
      if (event.key === 'Escape') { setShowVerdict(false); setShowRunSheet(false); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [document, selected, showRunSheet, view]);

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-copy"><strong>Kniterate Studio</strong><small>{document ? document.filename : `${project.title} / ${authoredState.chart.width} needles / ${authoredState.chart.height} rows`}</small></span></div>
        {!document && <CompilePipeline project={project} compile={blanketCompile} kcode={kcodeState} />}
        <div className="topbar-actions">
          {document && <button className={`icon-button${view === 'chart' ? ' active-tool' : ''}`} type="button" onClick={() => { setDocument(null); setView('chart'); }} title="Return to authored project" aria-label="Return to authored project"><Grid3X3 size={17} /></button>}
          {!document && blanketCompile.artifact?.ok && <button className={`icon-button${view === 'machine' ? ' active-tool' : ''}`} type="button" onClick={() => setView(view === 'machine' ? 'chart' : 'machine')} title={view === 'machine' ? 'Return to chart' : 'Inspect exact emitted movement'} aria-label={view === 'machine' ? 'Return to chart' : 'Inspect exact emitted movement'}>{view === 'machine' ? <Grid3X3 size={17} /> : <PanelRight size={17} />}</button>}
          <button className="icon-button" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Toggle theme" aria-label="Toggle theme">{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button>
          {document && <Verdict document={document} onClick={() => setShowVerdict((value) => !value)} />}
          {!document && authoredVerdict && <AuthoredVerdictBadge verdict={authoredVerdict} onClick={() => setShowVerdict((value) => !value)} />}
          {(document || authoredExportReady) && <button className="icon-button" type="button" onClick={() => setShowRunSheet(true)} title="Run sheet" aria-label="Open run sheet"><Printer size={17} /></button>}
          {!document && <button className="primary-button top-export" type="button" onClick={downloadKCode} disabled={!authoredExportReady} title={authoredExportReady ? 'Export validated K-code' : kcodeState.status === 'converting' ? 'Validating K-code' : 'Resolve blocking findings before export'} aria-label="Export k-code"><Download size={16} /><span>Export .kc</span></button>}
          <button className="icon-button top-open" type="button" onClick={() => fileInput.current?.click()} title="Open machine file" aria-label="Open machine file"><FileUp size={16} /></button>
        </div>
      </header>
      <input ref={fileInput} className="file-input" type="file" accept=".kc,.k,text/plain" onChange={handleInput} />
      <input ref={compareInput} className="file-input" type="file" accept=".kc,text/plain" onChange={(event) => handleInput(event, true)} />

      {view === 'chart' ? <ChartWorkspace project={project} onProject={setProject} onNewProject={() => setShowNewProject(true)} onProjectSettings={() => setShowProjectSettings(true)} autosaveState={autosaveState} isDarkMode={theme === 'dark'} compile={blanketCompile} kcode={outputCurrent ? kcodeState.artifact : null} outputStatus={displayedOutputStatus} outputError={kcodeState.error} authoredVerdict={authoredVerdict} focusedRowId={focusedRowId} onFocusedRowId={setFocusedRowId} /> : !document && blanketCompile.artifact?.ok ? <CompiledMachineWorkspace artifact={blanketCompile.artifact} kcode={outputCurrent ? kcodeState.artifact : null} outputStatus={displayedOutputStatus} outputError={kcodeState.error} focusedRowId={focusedRowId} onFocusedRowId={setFocusedRowId} /> : !document ? <EmptyState active onOpen={() => fileInput.current?.click()} onDrop={(file) => void openFile(file)} /> : (
        <div className="workspace">
          <nav className="side-rail" aria-label="Workspace views">
            <button className={view === 'machine' ? 'active' : ''} type="button" onClick={() => setView('machine')} title="Machine passes"><Rows3 size={19} /></button>
            <button className={view === 'diff' ? 'active' : ''} type="button" onClick={() => setView('diff')} title="Pass diff"><ArrowLeftRight size={19} /></button>
          </nav>
          <main className="machine-workspace">
            <div className="workspace-head">
              <div><span className="eyebrow">Machine truth</span><h1>{view === 'machine' ? 'Pass grid' : 'Compare machine passes'}</h1></div>
              <div className="stat-strip"><span><b>{document.stats.passCount.toLocaleString()}</b> passes</span><span><b>{document.stats.carriers.length}</b> carriers</span><span><b>{document.stats.needleSpan}</b></span><span><b>rack {document.stats.rackRange}</b></span></div>
            </div>
            <div className="mobile-tabs">
              {document.kcode?.scene && <button className={mobileView === 'movement' ? 'active' : ''} type="button" onClick={() => setMobileView('movement')}>movement</button>}
              {(['passes', 'diagnostics', 'source'] as MobileView[]).map((item) => <button className={mobileView === item ? 'active' : ''} type="button" key={item} onClick={() => setMobileView(item)}>{item}</button>)}
            </div>
            {view === 'machine' ? (
              <div className={`machine-layout${document.kcode?.scene ? ' has-movement' : ''} mobile-${mobileView}`}>
                {document.kcode?.scene && <MachineMovementView className="machine-movement-panel" scene={document.kcode.scene} validation={document.kcode.validation} overallContext={documentOverallContext(document)} selectedPass={selected} onSelect={(pass) => select(pass)} />}
                <PassGrid passes={document.passes} selected={selected} collapsed={collapsed} onToggle={(section) => setCollapsed((current) => { const next = new Set(current); next.has(section) ? next.delete(section) : next.add(section); return next; })} onSelect={(pass) => select(pass)} />
                <Diagnostics document={document} selected={selected} onSelect={select} />
                <SourceDock document={document} selected={selected} preferredLine={preferredLine} />
              </div>
            ) : <DiffView base={document} compare={compare} onOpenCompare={() => compareInput.current?.click()} onSelect={(index) => select(index)} />}
          </main>
        </div>
      )}
      {document && showVerdict && <VerdictPanel document={document} onClose={() => setShowVerdict(false)} />}
      {!document && showVerdict && authoredVerdict && <AuthoredVerdictPanel verdict={authoredVerdict} onClose={() => setShowVerdict(false)} />}
      {document && showRunSheet && <RunSheet document={document} onClose={() => setShowRunSheet(false)} />}
      {!document && showRunSheet && authoredExportReady && authoredVerdict && blanketCompile.artifact && kcodeState.artifact && <AuthoredRunSheet project={project} compiled={blanketCompile.artifact} kcode={kcodeState.artifact} verdict={authoredVerdict} onClose={() => setShowRunSheet(false)} />}
      {showNewProject && <NewProjectDialog onCreate={createProject} onClose={() => setShowNewProject(false)} />}
      {showProjectSettings && <ProjectSettingsDialog project={project} onSave={saveProjectSettings} onClose={() => setShowProjectSettings(false)} />}
    </div>
  );
}
