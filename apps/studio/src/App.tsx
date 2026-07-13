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
import { matchKnitProvenArtifact, matchKnitProvenKCode, type KnitProvenMatch } from '@kniterate-studio/machine-lib/browser';
import { compareKcDocuments, openMachineDocument, type MachineDiagnostic, type MachineDocument, type MachinePass } from './engine';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject, renameColorworkProject, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { useBlanketCompiler } from './blanket/useBlanketCompiler';
import type { BlanketCompileArtifact } from './blanket/compileProject';
import { ChartWorkspace } from './chart/ChartWorkspace';
import { useKCodeArtifact } from './kcode/useKCodeArtifact';
import type { KCodeArtifact } from './kcode/kcodeProtocol';
import { sha256Text } from './kcode/sha256';
import { NewProjectDialog, ProjectSettingsDialog, DEFAULT_PROJECT_PALETTE, type NewProjectValues } from './chart/ProjectDialogs';
import { readProjectAutosave, serializeProjectAutosave, PROJECT_AUTOSAVE_KEY } from './chart/projectAutosave';

const ROW_HEIGHT = 44;
const CARRIER_COLORS: Record<string, string> = {
  '1': '#d95d48', '2': '#33866a', '3': '#d49b32', '4': '#4e75b8', '5': '#9b60a8', '6': '#67584c',
};

type MobileView = 'passes' | 'diagnostics' | 'source';

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

function CompilePipeline({ project, compile, kcodeStatus }: {
  project: ColorworkProjectV1;
  compile: ReturnType<typeof useBlanketCompiler>;
  kcodeStatus: ReturnType<typeof useKCodeArtifact>['status'];
}) {
  const state = materializeColorworkProject(project).state;
  const stages = [
    { label: 'Chart', detail: `${state.chart.width}x${state.chart.height} · ${state.chart.palette.length} colors`, state: 'ready' },
    { label: 'Plan', detail: state.strategy.technique, state: compile.status === 'failed' || compile.artifact?.ok === false ? 'blocked' : compile.status === 'compiling' ? 'working' : 'ready' },
    { label: 'Passes', detail: compile.artifact?.ok ? compile.artifact.stats.passCount.toLocaleString() : compile.status === 'compiling' ? 'calculating' : 'waiting', state: compile.artifact?.ok ? 'ready' : compile.artifact?.ok === false ? 'blocked' : 'working' },
    { label: 'K-code', detail: kcodeStatus === 'ready' ? 'validated' : kcodeStatus === 'failed' ? 'failed' : kcodeStatus === 'converting' ? 'validating' : 'waiting', state: kcodeStatus === 'ready' ? 'ready' : kcodeStatus === 'failed' ? 'blocked' : 'working' },
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
        <span>Pass</span><span>Direction</span><span>Carrier</span><span>Action</span><span>{compiled ? 'Status' : 'Bed'}</span><span>{compiled ? 'Design' : 'Needles'}</span><span>Rack</span><span>Speed</span><span>Roller</span>
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

function CompiledMachineWorkspace({ artifact, kcode, focusedRowId, onFocusedRowId }: { artifact: BlanketCompileArtifact; kcode: KCodeArtifact | null; focusedRowId: string | null; onFocusedRowId: (rowId: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const focusedPass = artifact.rowProvenance.find((row) => row.rowId === focusedRowId)?.passIndices[0] ?? 0;
  const [selected, setSelected] = useState(focusedPass);
  useEffect(() => setSelected(focusedPass), [focusedPass]);
  const passes = useMemo<MachinePass[]>(() => artifact.passes.map((pass, index) => {
    const designRows = [...new Set((pass.sourceRows ?? []).map((row) => row + 1))];
    return {
      index,
      direction: pass.direction,
      type: pass.type,
      carriers: pass.carriers,
      beds: pass.isAutoMove ? 'Auto move' : 'Predicted',
      needleSpan: designRows.length ? designRows.map((row) => `R${row}`).join(', ') : 'Frame',
      rack: null,
      speed: pass.speed,
      roller: pass.roller,
      lineStart: 0,
      lineEnd: 0,
      section: designRows.length ? 'Body' : 'Frame / finish',
      ghost: pass.isAutoMove,
    };
  }), [artifact]);
  const selectPass = (index: number) => {
    setSelected(index);
    const row = artifact.rowProvenance.find((item) => item.passIndices.includes(index));
    if (row) onFocusedRowId(row.rowId);
  };
  const errors = artifact.messages.filter((message) => message.severity === 'error');
  const warnings = artifact.messages.filter((message) => message.severity === 'warning');
  const findingGroups = [...artifact.diagnostics.reduce((groups, diagnostic) => {
    const group = groups.get(diagnostic.rule);
    if (group) group.count += 1;
    else groups.set(diagnostic.rule, { diagnostic, count: 1 });
    return groups;
  }, new Map<string, { diagnostic: BlanketCompileArtifact['diagnostics'][number]; count: number }>()).values()];
  const sourceLines = useMemo(() => kcode?.kcText.split(/\r?\n/) ?? [], [kcode]);
  const sourceSpan = kcode?.passLines[selected];
  const sourceFrom = Math.max(1, (sourceSpan?.lineStart ?? 1) - 6);
  const sourceTo = Math.min(sourceLines.length, (sourceSpan?.lineEnd ?? 1) + 6);
  return <div className="workspace">
    <nav className="side-rail" aria-label="Workspace views"><button className="active" type="button" title="Machine passes"><Rows3 size={19} /></button></nav>
    <main className="machine-workspace compiled-workspace">
      <div className="workspace-head"><div><span className="eyebrow">Compiled project</span><h1>Predicted pass grid</h1></div><div className="stat-strip"><span><b>{artifact.stats.passCount.toLocaleString()}</b> passes</span><span><b>{artifact.stats.patternColors}</b> pattern colors</span><span><b>{artifact.stats.needles}</b> needles</span><span><b>{errors.length}</b> errors</span></div></div>
      <div className="compiled-machine-layout">
        <PassGrid passes={passes} selected={selected} collapsed={collapsed} onToggle={(section) => setCollapsed((current) => { const next = new Set(current); next.has(section) ? next.delete(section) : next.add(section); return next; })} onSelect={selectPass} compiled />
        <section className="diagnostics-panel"><div className="panel-title"><span><ListChecks size={15} /> Checks</span><b>{warnings.length} warnings</b></div><div className="diagnostic-list">{artifact.messages.length === 0 ? <div className="compiled-clear"><CheckCircle2 size={18} /><strong>No compiler findings</strong></div> : findingGroups.map(({ diagnostic, count }) => <button type="button" disabled={diagnostic.passIndices.length === 0} onClick={() => { const pass = diagnostic.passIndices[0]; if (pass !== undefined) selectPass(pass); }} className={`compiled-finding severity-${diagnostic.severity}`} key={diagnostic.rule}>{diagnostic.severity === 'error' ? <CircleAlert size={15} /> : diagnostic.severity === 'warning' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}<span><strong>{diagnostic.rule}{count > 1 ? ` · ${count} occurrences` : ''}</strong><small>{diagnostic.message}</small></span></button>)}</div></section>
        <section className="source-dock"><div className="panel-title"><span><Code2 size={15} /> Generated K-code</span><b>{kcode ? `${kcode.passCount.toLocaleString()} passes · ${kcode.kcHash.slice(0, 12)}` : 'Converting'}</b></div><pre>{kcode ? sourceLines.slice(sourceFrom - 1, sourceTo).map((line, offset) => { const lineNumber = sourceFrom + offset; const highlighted = lineNumber >= (sourceSpan?.lineStart ?? 0) && lineNumber <= (sourceSpan?.lineEnd ?? 0); return <span className={highlighted ? 'source-line highlighted' : 'source-line'} key={lineNumber}><i>{lineNumber}</i><code>{line || ' '}</code></span>; }) : <span className="source-line"><i /><code>Waiting for validated conversion…</code></span>}</pre></section>
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
          <div className="diagnostic-clear"><CheckCircle2 size={22} /><strong>No validator findings</strong><span>Reconstruction completed cleanly.</span></div>
        ) : document.diagnostics.map((item) => <DiagnosticItem key={item.id} item={item} active={item.passIndex === selected} onClick={() => onSelect(item.passIndex ?? selected, item.line)} />)}
      </div>
    </aside>
  );
}

function SourceDock({ document, selected, preferredLine }: { document: MachineDocument; selected: number; preferredLine: number | null }) {
  const pass = document.passes[selected];
  const sourceLines = useMemo(() => document.source.split(/\r?\n/), [document.source]);
  const focusLine = preferredLine ?? pass?.lineEnd ?? 1;
  const from = Math.max(1, focusLine - 8);
  const to = Math.min(sourceLines.length, focusLine + 8);
  return (
    <section className="source-dock">
      <div className="panel-title"><span><Code2 size={16} /> Source</span><b>{document.format.toUpperCase()} · lines {from}-{to} of {sourceLines.length.toLocaleString()}</b></div>
      <pre>{sourceLines.slice(from - 1, to).map((line, index) => {
        const lineNumber = from + index;
        const highlighted = lineNumber >= (pass?.lineStart ?? focusLine) && lineNumber <= (pass?.lineEnd ?? focusLine);
        return <span className={highlighted ? 'source-line highlighted' : 'source-line'} key={lineNumber}><i>{lineNumber}</i><code>{line || ' '}</code></span>;
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
        <li><i />Experimental</li>
        <li className={document.verdict.state === 'surface' ? 'current' : ''}><i />Surface-proven</li>
        <li className={document.verdict.state === 'knit' ? 'current' : ''}><i />Knit-proven</li>
      </ol>
      <span className="profile-chip">7gg worsted · 252 needles</span>
    </div>
  );
}

function RunSheet({ document, onClose }: { document: MachineDocument; onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <article className="run-sheet">
        <div className="run-sheet-actions"><button className="secondary-button" type="button" onClick={onClose}><X size={16} /> Close</button><button className="primary-button" type="button" onClick={() => window.print()}><Printer size={16} /> Print</button></div>
        <header><span>KNITERATE STUDIO · RUN SHEET</span><h1>{document.filename}</h1><div className={`print-verdict verdict-${document.verdict.state}`}>{document.verdict.label}</div></header>
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

function AuthoredRunSheet({ project, compiled, kcode, knitProvenMatch, onClose }: { project: ColorworkProjectV1; compiled: BlanketCompileArtifact; kcode: KCodeArtifact; knitProvenMatch: KnitProvenMatch | null; onClose: () => void }) {
  const { state } = materializeColorworkProject(project);
  const needleEnd = state.machine.needleOffset + state.chart.width - 1;
  const findings = [...new Map(compiled.messages.filter((message) => message.severity !== 'info').map((message) => [message.rule, message])).values()];
  return <div className="modal-backdrop"><article className="run-sheet">
    <div className="run-sheet-actions"><button className="secondary-button" type="button" onClick={onClose}><X size={16} /> Close</button><button className="primary-button" type="button" onClick={() => window.print()}><Printer size={16} /> Print</button></div>
    <header><span>KNITERATE STUDIO · RUN SHEET</span><h1>{project.title}</h1><div className={`print-verdict verdict-${knitProvenMatch ? 'knit' : 'surface'}`}>{knitProvenMatch ? 'Knit-proven' : 'Surface-proven'}</div></header>
    <p className="run-annotation">{knitProvenMatch ? `Exact machine artifact match: ${knitProvenMatch.id}.` : 'Compiled and converted locally without blocking findings. Physical yarn, tension, and fabric behavior remain swatch-dependent.'}</p>
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
  return (
    <section className="diff-view">
      <header><div><span className="eyebrow">K-code pass diff</span><h2>{base.filename} <ArrowLeftRight size={16} /> {compare.filename}</h2></div><button className="secondary-button" type="button" onClick={onOpenCompare}><FilePlus2 size={15} /> Replace</button></header>
      <div className={`diff-summary${result.summary.identical ? ' identical' : ''}`}><strong>{result.summary.identical ? 'Pass-identical' : `${result.summary.deltaCount.toLocaleString()} changed passes`}</strong><span>{result.summary.generatedPassCount.toLocaleString()} vs {result.summary.referencePassCount.toLocaleString()} passes</span></div>
      <div className="diff-list">{result.windows.map((window) => <button type="button" key={window.index} onClick={() => onSelect(window.index)}><b>Pass {window.index + 1}</b><pre>{window.text}</pre></button>)}</div>
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
  const [theme, setTheme] = useState<'light' | 'dark'>(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'saving' | 'saved' | 'failed'>(initial.recoveredAt ? 'saved' : 'saving');
  const blanketCompile = useBlanketCompiler(project);
  const kcodeState = useKCodeArtifact(blanketCompile.artifact);
  const authoredExportReady = blanketCompile.artifact?.ok === true && kcodeState.artifact?.ok === true && kcodeState.artifact.inputHash === blanketCompile.artifact.inputHash;
  const knitProvenMatch = matchKnitProvenArtifact(
    authoredExportReady ? blanketCompile.artifact?.inputHash : null,
    authoredExportReady ? kcodeState.artifact?.kcHash : null,
  );
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

  const openFile = async (file: File | undefined, comparison = false) => {
    if (!file) return;
    const source = await file.text();
    const physicalMatch = file.name.toLowerCase().endsWith('.kc') ? matchKnitProvenKCode(await sha256Text(source)) : null;
    const opened = openMachineDocument(file.name, source, physicalMatch?.id ?? null);
    if (comparison) { setCompare(opened); setView('diff'); }
    else { setDocument(opened); setCompare(null); setSelected(0); setPreferredLine(null); setView('machine'); }
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
        <div className="brand-lockup"><span className="brand-mark"><Rows3 size={17} /></span><strong>Kniterate Studio</strong>{document && <span className="file-name">{document.filename}</span>}</div>
        {!document && <CompilePipeline project={project} compile={blanketCompile} kcodeStatus={kcodeState.status} />}
        <div className="topbar-actions">
          <button className={`icon-button${view === 'chart' ? ' active-tool' : ''}`} type="button" onClick={() => setView('chart')} title="Chart" aria-label="Open chart"><Grid3X3 size={17} /></button>
          <button className={`icon-button${view !== 'chart' ? ' active-tool' : ''}`} type="button" onClick={() => (document || blanketCompile.artifact?.ok) && setView('machine')} title="Machine" aria-label="Open machine" disabled={!document && !blanketCompile.artifact?.ok}><Rows3 size={17} /></button>
          {document && <Verdict document={document} onClick={() => setShowVerdict((value) => !value)} />}
          {!document && <button className="icon-button" type="button" onClick={() => setShowNewProject(true)} title="New project" aria-label="New project"><FilePlus2 size={17} /></button>}
          <button className="icon-button" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Toggle theme" aria-label="Toggle theme">{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button>
          {!document && <button className="primary-button top-export" type="button" onClick={downloadKCode} disabled={!authoredExportReady} title={authoredExportReady ? 'Export validated K-code' : kcodeState.status === 'converting' ? 'Validating K-code' : 'Resolve blocking findings before export'} aria-label="Export k-code"><Download size={16} /><span>Export .kc</span></button>}
          {(document || authoredExportReady) && <button className="icon-button" type="button" onClick={() => setShowRunSheet(true)} title="Run sheet" aria-label="Open run sheet"><Printer size={17} /></button>}
          <button className="primary-button top-open" type="button" onClick={() => fileInput.current?.click()}><FileUp size={16} /> Open</button>
        </div>
      </header>
      <input ref={fileInput} className="file-input" type="file" accept=".kc,.k,text/plain" onChange={handleInput} />
      <input ref={compareInput} className="file-input" type="file" accept=".kc,text/plain" onChange={(event) => handleInput(event, true)} />

      {view === 'chart' ? <ChartWorkspace project={project} onProject={setProject} onNewProject={() => setShowNewProject(true)} onProjectSettings={() => setShowProjectSettings(true)} autosaveState={autosaveState} isDarkMode={theme === 'dark'} compile={blanketCompile} outputStatus={kcodeState.status} outputError={kcodeState.error} knitProvenEntryId={knitProvenMatch?.id ?? null} focusedRowId={focusedRowId} onFocusedRowId={setFocusedRowId} /> : !document && blanketCompile.artifact?.ok ? <CompiledMachineWorkspace artifact={blanketCompile.artifact} kcode={kcodeState.artifact?.inputHash === blanketCompile.artifact.inputHash ? kcodeState.artifact : null} focusedRowId={focusedRowId} onFocusedRowId={setFocusedRowId} /> : !document ? <EmptyState active onOpen={() => fileInput.current?.click()} onDrop={(file) => void openFile(file)} /> : (
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
              {(['passes', 'diagnostics', 'source'] as MobileView[]).map((item) => <button className={mobileView === item ? 'active' : ''} type="button" key={item} onClick={() => setMobileView(item)}>{item}</button>)}
            </div>
            {view === 'machine' ? (
              <div className={`machine-layout mobile-${mobileView}`}>
                <PassGrid passes={document.passes} selected={selected} collapsed={collapsed} onToggle={(section) => setCollapsed((current) => { const next = new Set(current); next.has(section) ? next.delete(section) : next.add(section); return next; })} onSelect={(pass) => select(pass)} />
                <Diagnostics document={document} selected={selected} onSelect={select} />
                <SourceDock document={document} selected={selected} preferredLine={preferredLine} />
              </div>
            ) : <DiffView base={document} compare={compare} onOpenCompare={() => compareInput.current?.click()} onSelect={(index) => select(index)} />}
          </main>
        </div>
      )}
      {document && showVerdict && <VerdictPanel document={document} onClose={() => setShowVerdict(false)} />}
      {document && showRunSheet && <RunSheet document={document} onClose={() => setShowRunSheet(false)} />}
      {!document && showRunSheet && authoredExportReady && blanketCompile.artifact && kcodeState.artifact && <AuthoredRunSheet project={project} compiled={blanketCompile.artifact} kcode={kcodeState.artifact} knitProvenMatch={knitProvenMatch} onClose={() => setShowRunSheet(false)} />}
      {showNewProject && <NewProjectDialog onCreate={createProject} onClose={() => setShowNewProject(false)} />}
      {showProjectSettings && <ProjectSettingsDialog project={project} onSave={saveProjectSettings} onClose={() => setShowProjectSettings(false)} />}
    </div>
  );
}
