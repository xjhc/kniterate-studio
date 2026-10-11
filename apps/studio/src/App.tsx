import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
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
  FilePlus2,
  ListChecks,
  LoaderCircle,
  Network,
  Printer,
  Rows3,
  X,
} from 'lucide-react';
import { KNITERATE_7GG_KCODE_PROFILE_V2, deriveMachineTraceProgrammedMotionV1, matchKnitProvenArtifact, type MachineTraceProgrammedMotionV1 } from '@kniterate-studio/machine-lib/browser';
import { MACHINE_PASS_ORIGIN_LABELS, VERDICT_WORDS, formatPassRoleCounts, machinePassRoleLabel, resolveAuthoredVerdict, type AuthoredVerdict, type MachineDiagnostic, type MachineDiff, type MachinePass } from './engine';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject, redoProjectEdit, renameColorworkProject, serializeColorworkProjectV1, undoProjectEdit, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import type { AuthoredPipelineResult } from './authoredPipeline';
import { createBeanieProject, withSizingFixes, type BeanieIntent } from './beanie';
import { createSweaterProject, planSweater, type SweaterIntent } from './sweater/sweater';
import type { PieceId } from './sweater/draft';
import { sweaterInstructions, sweaterPackageFiles } from './sweater/sweaterHandoff';
import { sweaterSchematicSvg } from './sweater/schematic';
import { MenuBar, type Menu } from './workspace/MenuBar';
import type { WorkspaceView } from './workspace/ViewSwitch';
import { openStudioProjectFile } from './chart/projectFile';
import './workspace/workspace.css';
import { useSweaterRun } from './sweater/sweaterRun';
import { SweaterWorkspace } from './sweater/SweaterWorkspace';
import { PanelWorkspace } from './sweater/PanelWorkspace';
import { createPanelProject, planPanel, type PanelIntent } from './sweater/panel';
import { panelInstructions, panelPackageFiles } from './sweater/panelHandoff';
import { StartScreen } from './StartScreen';
import { handoffFiles, instructionsMarkdown, readinessStory, schematicSvg } from './handoff';
import { planProject } from './plan';
import { collectFindings, resolveReadiness } from './readiness';
import { zipStore } from './zip';
import { ChangesPanel, continuationFrom } from './garment/ChangesPanel';
import { GarmentSheet } from './garment/GarmentSheet';
import { sha256Hex } from './garment/MotifPanel';
import { useBlanketCompiler } from './blanket/useBlanketCompiler';
import type { BlanketCompileArtifact } from './blanket/compileProject';
import { ChartWorkspace } from './chart/ChartWorkspace';
import { TYPICAL_COLOURWORK_GAUGE } from './chart/ChartSizeSection';
import { authoredKnitoutNeedleRange } from './kcode/kcodeProtocol';
import { useKCodeArtifact } from './kcode/useKCodeArtifact';
import { useSwatchFile } from './useSwatchFile';
import type { KCodeArtifact } from './kcode/kcodeProtocol';
import { MachineMovementView, type MachineMovementViewProps } from './kcode/MachineMovementView';
import { programRegionForPass } from './chart/AuthoredMachinePanel';
import { NewProjectDialog, ProjectSettingsDialog, DEFAULT_PROJECT_PALETTE, type NewProjectValues } from './chart/ProjectDialogs';
import { readProjectAutosave, serializeProjectAutosave, PROJECT_AUTOSAVE_KEY } from './chart/projectAutosave';
import { indexSourceLines, sourceWindow } from './sourceWindow';
import { formatForeignRunSheetFindingAnchor, groupForeignRunSheetFindings } from './foreignRunSheetFindings';
import { ForeignFabricView, MachineTopologyView } from './fabric/ForeignFabricView';
import { useMachineExecution } from './kcode/useMachineExecution';
import { readMachineFile, disposeMachineDocument, machineSession } from './machine/readMachineFile';
import type { MachineDocumentView as MachineDocument } from './machine/inspection';
import { useImportedMachineExecution } from './machine/useImportedMachineExecution';
export { readMachineFile } from './machine/readMachineFile';

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


function defaultProject(): ColorworkProjectV1 {
  return createColorworkProjectV1({
    kind: 'knitlab-colorwork-chart', version: 1, title: 'Untitled colourwork', width: 200, height: 300, rowNumbering: 'bottom-up',
    palette: DEFAULT_PROJECT_PALETTE.map((entry) => ({ ...entry })),
    cells: Array.from({ length: 300 }, () => Array.from({ length: 200 }, () => 0)),
  }, { id: 'studio-default', title: 'Untitled colourwork' });
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

/** The chart at knitted proportions (stitches are wider than rows are tall), as a PNG for the package. */
async function chartPng(state: ReturnType<typeof materializeColorworkProject>['state']): Promise<Uint8Array> {
  const cell = Math.max(1, Math.floor(1200 / Math.max(state.chart.width, state.chart.height)));
  const ratio = state.gauge ? state.gauge.stitchesPer10cm / state.gauge.rowsPer10cm : 1;
  const canvas = window.document.createElement('canvas');
  canvas.width = state.chart.width * cell; canvas.height = Math.round(state.chart.height * cell * ratio);
  const context = canvas.getContext('2d')!;
  state.chart.cells.forEach((row, top) => row.forEach((index, column) => {
    context.fillStyle = state.chart.palette[index]!.hex;
    context.fillRect(column * cell, Math.round(top * cell * ratio), cell, Math.ceil(cell * ratio));
  }));
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not render the chart.'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

function download(name: string, blob: Blob) {
  const link = window.document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function projectId(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'colorwork';
  return `${slug}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function Verdict({ document, onClick }: { document: MachineDocument; onClick: () => void }) {
  return (
    <button className={`verdict verdict-${document.verdict.state}`} type="button" onClick={onClick} title={document.verdict.label} aria-label={`Verdict: ${VERDICT_WORDS[document.verdict.state].name}`}>
      <span className="verdict-dot" />
      {VERDICT_WORDS[document.verdict.state].name}
      <ChevronDown size={14} />
    </button>
  );
}

export function AuthoredVerdictBadge({ verdict, pending, onClick }: { verdict: AuthoredVerdict | null; pending: 'compiling' | 'checking'; onClick: () => void }) {
  // A null verdict means lowering is still in progress; the badge is the top bar's single progress and verdict signal.
  if (!verdict) return <span className="verdict authored-verdict verdict-pending" role="status" aria-label={pending === 'compiling' ? 'Writing the machine file' : 'Checking the machine file'}><LoaderCircle size={12} className="spin" />{pending === 'compiling' ? 'Writing' : 'Checking'}</span>;
  return <button className={`verdict authored-verdict verdict-${verdict.state}`} type="button" title={`${verdict.label}: ${verdict.annotation}`} aria-label={`Verdict: ${VERDICT_WORDS[verdict.state].name}${verdict.evidenceId ? ' / Exact physical match' : ''}`} onClick={onClick}><span className="verdict-dot" />{VERDICT_WORDS[verdict.state].name}</button>;
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
            const roleLabel = machinePassRoleLabel(pass);
            return (
              <button
                className={`pass-row${pass.index === selected ? ' selected' : ''}${pass.ghost ? ' ghost' : ''}`}
                style={{ top: rowIndex * ROW_HEIGHT }} key={pass.index} type="button" onClick={() => onSelect(pass.index)}
                title={roleLabel === null ? undefined : `${roleLabel} pass${pass.origin === undefined ? '' : ` · ${MACHINE_PASS_ORIGIN_LABELS[pass.origin]}`}`}
              >
                <span className="pass-number">{pass.index + 1}</span>
                <span className="direction">{pass.direction ?? '•'}</span>
                <span>{pass.carriers.length ? pass.carriers.map((carrier) => <i className="carrier-chip" style={{ '--carrier': CARRIER_COLORS[carrier] } as CSSProperties} key={carrier}>C{carrier}</i>) : <em>none</em>}</span>
                <span><code>{pass.type}</code></span><span>{pass.ghost && roleLabel !== null ? roleLabel : pass.beds}</span><span>{pass.needleSpan}</span>
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
  const [topology, setTopology] = useState(false);
  const focusOrigin = useRef({ kcode, row: focusedRowId });
  const execution = useMachineExecution(kcode?.trace ?? null, kcode?.validation ?? null, selected, (pass) => {
    setSelected(pass);
    const row = kcode?.passProvenance[pass]?.rowIds[0];
    if (row) { focusOrigin.current = { kcode, row }; onFocusedRowId(row); }
  });
  useEffect(() => {
    if (focusOrigin.current.kcode !== kcode || focusOrigin.current.row !== focusedRowId) {
      setSelected(focusedPass);
      focusOrigin.current = { kcode, row: focusedRowId };
    }
  }, [kcode, focusedPass, focusedRowId]);
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
  const selectPass = (index: number) => execution.selectAction(index);
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
  const sourceSpan = kcode?.passLines[selected];
  const sourceIndex = useMemo(() => indexSourceLines(kcode?.kcText ?? ''), [kcode?.kcText]);
  const eventLine = execution.snapshot?.event?.sourceSpan.start.line ?? null;
  const sourceFocus = eventLine ?? (sourceSpan
    ? Math.floor((sourceSpan.lineStart + sourceSpan.lineEnd) / 2)
    : 1);
  const sourceRadius = sourceSpan
    ? Math.ceil((sourceSpan.lineEnd - sourceSpan.lineStart) / 2) + 6
    : 6;
  const sourcePreview = useMemo(
    () => sourceWindow(kcode?.kcText ?? '', sourceFocus, sourceRadius, 2_048, sourceIndex),
    [kcode?.kcText, sourceFocus, sourceIndex, sourceRadius],
  );
  return <div className="workspace">
    <nav className="side-rail" aria-label="Workspace views"><button className={!topology ? 'active' : ''} type="button" title="Machine passes" onClick={() => setTopology(false)}><Rows3 size={19} /></button><button className={topology ? 'active' : ''} type="button" title="Schematic topology" onClick={() => setTopology(true)}><Network size={19} /></button></nav>
    <main className="machine-workspace compiled-workspace">
      <div className="workspace-head"><div><span className="eyebrow">Compiled project</span><h1>Exact emitted machine trace</h1></div><div className="stat-strip"><span><b>{(kcode?.passCount ?? 0).toLocaleString()}</b> passes</span><span><b>{artifact.stats.patternColors}</b> pattern colours</span><span><b>{artifact.stats.needles}</b> design columns</span><span><b>{errorCount + (outputStatus === 'failed' ? 1 : 0)}</b> errors</span></div></div>
      {topology ? <MachineTopologyView trace={kcode?.trace ?? null} eligible={kcode?.ok === true && kcode.validation?.ok === true} blockedReason="Topology requires current validated output." selectedPass={selected} onSelect={(pass, action) => execution.selectAction(pass, action)} /> : <div className="compiled-machine-layout">
        {kcode?.scene ? <MachineMovementView className="compiled-movement" execution={execution} scene={kcode.scene} validation={kcode.validation} overallContext={kcodeOverallContext(kcode)} selectedPass={selected} onSelect={(pass) => execution.selectAction(pass)} />
          : kcode ? <div className="compiled-movement compiled-blocked" role="alert"><CircleAlert size={18} /><span><strong>Exact machine scene blocked</strong><small>{outputMessages.find((message) => message.severity === 'error')?.message ?? 'Strict parsing or MachineTrace projection did not produce an inspectable scene.'}</small></span></div>
            : outputStatus === 'failed' || outputStatus === 'ready' ? <div className="compiled-movement compiled-blocked" role="alert"><CircleAlert size={18} /><span><strong>KCode generation failed</strong><small>{outputError ?? 'Generation completed without an inspectable exact-output artifact.'}</small></span></div>
              : <div className="compiled-movement compiled-clear" role="status"><span className="spin-dot" /><strong>Strictly parsing and validating emitted KCode…</strong></div>}
        <PassGrid passes={passes} selected={selected} collapsed={collapsed} onToggle={(section) => setCollapsed((current) => { const next = new Set(current); next.has(section) ? next.delete(section) : next.add(section); return next; })} onSelect={selectPass} compiled />
        <section className="diagnostics-panel"><div className="panel-title"><span><ListChecks size={15} /> Exact-output checks</span><b>{outputWarningCount} warnings</b></div><div className="diagnostic-list">{findingGroups.length === 0 ? kcode?.ok ? <div className="compiled-clear"><CheckCircle2 size={18} /><strong>No exact-output findings</strong></div> : <div className="compiled-blocked" role="alert"><CircleAlert size={18} /><span><strong>Exact-output evidence unavailable</strong><small>{outputError ?? 'No completed strict KCode artifact is available.'}</small></span></div> : findingGroups.map(({ diagnostic, count }) => <button type="button" disabled={diagnostic.passIndex === null} onClick={() => { if (diagnostic.passIndex !== null) selectPass(diagnostic.passIndex); }} className={`compiled-finding severity-${diagnostic.severity}`} key={diagnostic.rule}>{diagnostic.severity === 'error' ? <CircleAlert size={15} /> : diagnostic.severity === 'warning' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}<span><strong>{diagnostic.rule}{count > 1 ? ` · ${count} occurrences` : ''}</strong><small>{diagnostic.message}</small></span></button>)}</div></section>
        <section className="source-dock"><div className="panel-title"><span><Code2 size={15} /> Generated K-code</span><b>{kcode ? `${kcode.passCount.toLocaleString()} passes · ${kcode.kcHash.slice(0, 12)}` : outputStatus === 'failed' || outputStatus === 'ready' ? 'Unavailable' : 'Converting'}</b></div><pre>{kcode ? sourcePreview.lines.map((line) => { const highlighted = eventLine !== null ? line.lineNumber === eventLine : line.lineNumber >= (sourceSpan?.lineStart ?? 0) && line.lineNumber <= (sourceSpan?.lineEnd ?? 0); return <span className={highlighted ? 'source-line highlighted' : 'source-line'} key={line.lineNumber}><i>{line.lineNumber}</i><code>{line.text || ' '}</code></span>; }) : <span className="source-line"><i /><code>{outputStatus === 'failed' || outputStatus === 'ready' ? outputError ?? 'No exact KCode artifact was produced.' : 'Waiting for validated conversion…'}</code></span>}</pre></section>
      </div>}
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
      <div className="panel-title"><span><ListChecks size={16} /> Diagnostics</span><b>{document.stats.errorCount} errors · {document.stats.warningCount} warnings · {document.stats.infoCount} notes</b></div>
      <div className="diagnostic-list">
        {document.diagnostics.length === 0 ? (
          <div className="diagnostic-clear"><CheckCircle2 size={22} /><strong>No validator findings</strong><span>Strict parse, trace projection, and replay completed cleanly.</span></div>
        ) : document.diagnostics.map((item) => <DiagnosticItem key={item.id} item={item} active={item.passIndex === selected} onClick={() => onSelect(item.passIndex ?? selected, item.line)} />)}
      </div>
    </aside>
  );
}

export function SourceDock({ document, selected, preferredLine, emitted = false, onOriginalSource }: { document: MachineDocument; selected: number; preferredLine: number | null; emitted?: boolean; onOriginalSource?: () => void }) {
  const pass = document.passes[selected];
  const source = emitted ? document.kcode?.document?.rawText ?? document.source : document.source;
  const focusLine = preferredLine ?? (emitted ? 1 : pass?.lineEnd) ?? 1;
  const sourceIndex = useMemo(() => indexSourceLines(source), [source]);
  const window = useMemo(
    () => sourceWindow(source, focusLine, 8, 2_048, sourceIndex),
    [source, focusLine, sourceIndex],
  );
  const resourceLimited = document.kcode?.document?.metadata.recordMaterialization === 'resource-limited'
    || document.diagnostics.some((finding) => finding.rule === 'knitout-resource-limit');
  return (
    <section className="source-dock">
      <div className="panel-title"><span><Code2 size={16} /> Source</span>{emitted && document.format === 'k' && onOriginalSource && <button className="secondary-button source-toggle" type="button" onClick={onOriginalSource}>Show original Knitout</button>}<b>{emitted ? 'Emitted KCode' : document.format.toUpperCase()} · lines {window.from}-{window.to} of {window.totalLines.toLocaleString()}</b></div>
      <pre>{(resourceLimited || window.truncatedLineCount > 0) && <span className="source-preview-note">Preview bounded for safe inspection; the exact imported source remains retained for audit.</span>}{window.lines.map(({ lineNumber, text }) => {
        const highlighted = preferredLine !== null || emitted ? lineNumber === focusLine : lineNumber >= (pass?.lineStart ?? focusLine) && lineNumber <= (pass?.lineEnd ?? focusLine);
        return <span className={highlighted ? 'source-line highlighted' : 'source-line'} key={lineNumber}><i>{lineNumber}</i><code>{text || ' '}</code></span>;
      })}</pre>
    </section>
  );
}

/** The three rungs, each in plain words with what it means; the ladder's own name is kept small beside it. */
function VerdictLadder({ state }: { state: AuthoredVerdict['state'] }) {
  const names = { blocked: 'Blocked', surface: 'Surface-proven', knit: 'Knit-proven' } as const;
  return <ol className="verdict-ladder">{(['blocked', 'surface', 'knit'] as const).map((rung) => <li key={rung} className={state === rung ? 'current' : ''}>
    <i /><span><b>{VERDICT_WORDS[rung].name}</b> <small>{names[rung]}</small><em>{VERDICT_WORDS[rung].meaning}</em></span>
  </li>)}</ol>;
}

function VerdictPanel({ document, onClose }: { document: MachineDocument; onClose: () => void }) {
  return (
    <div className="popover verdict-panel">
      <div className="popover-head"><strong>Verdict</strong><button className="icon-button" type="button" onClick={onClose} aria-label="Close verdict"><X size={16} /></button></div>
      <div className={`verdict-summary verdict-${document.verdict.state}`}><span className="verdict-dot" /><strong>{VERDICT_WORDS[document.verdict.state].name}</strong></div>
      <p>{document.verdict.annotation}</p>
      <p><strong>Format evidence</strong> {document.sourceDisclosure.summary}</p>
      <VerdictLadder state={document.verdict.state} />
      <span className="profile-chip">7gg worsted · 252 needles</span>
    </div>
  );
}

function AuthoredVerdictPanel({ verdict, onClose }: { verdict: AuthoredVerdict; onClose: () => void }) {
  return <div className="popover verdict-panel">
    <div className="popover-head"><strong>Can it be knitted?</strong><button className="icon-button" type="button" onClick={onClose} aria-label="Close verdict"><X size={16} /></button></div>
    <div className={`verdict-summary verdict-${verdict.state}`}><span className="verdict-dot" /><strong>{VERDICT_WORDS[verdict.state].name}</strong></div>
    <VerdictLadder state={verdict.state} />
    <details className="verdict-detail"><summary>What was checked</summary><p>{verdict.annotation}</p></details>
    <span className="profile-chip">7gg worsted / 252-needle bed</span>
  </div>;
}

function formattedMetric(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function idealizedMotionLabel(motion: MachineTraceProgrammedMotionV1 | null): string {
  if (motion === null) return 'Unavailable · no strict KCode trace';
  if (motion.assumptionModel.status === 'available') {
    return `${formattedMetric(motion.assumptionModel.idealizedSeconds!)} s · assumption-derived`;
  }
  const reason = motion.assumptionModel.unavailableReason!;
  return `Unavailable · ${reason.code} at pass ${reason.firstPassIndex + 1}`;
}

export function RunSheet({ document, onClose }: { document: MachineDocument; onClose: () => void }) {
  const dialogRef = useModalFocusTrap(onClose);
  const findingGroups = groupForeignRunSheetFindings(document.diagnostics);
  const strictPassMetrics = document.stats.passMetricProvenance === 'strict-kcode-trace';
  const motion = document.stats.programmedMotion;
  return (
    <div className="modal-backdrop">
      <article className="run-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="machine-run-title" tabIndex={-1}>
        <div className="run-sheet-actions"><button className="secondary-button" type="button" onClick={onClose}><X size={16} /> Close</button><button className="primary-button" type="button" onClick={() => window.print()}><Printer size={16} /> Print</button></div>
        <header><span>KNITERATE STUDIO · RUN SHEET</span><h1 id="machine-run-title">{document.filename}</h1><div className={`print-verdict verdict-${document.verdict.state}`}>{document.verdict.label}</div></header>
        <p className="run-annotation">{document.verdict.annotation}</p>
        <section><h2>Format evidence</h2><p>{document.sourceDisclosure.summary}</p></section>
        <section><h2>Machine program</h2><dl><div><dt>Profile</dt><dd>7gg worsted · 252-needle bed</dd></div><div><dt>Programmed passes</dt><dd>{strictPassMetrics ? document.stats.passCount.toLocaleString() : 'Unavailable'}</dd></div><div><dt>Loop-forming passes</dt><dd>{strictPassMetrics ? document.stats.loopFormingPassCount!.toLocaleString() : 'Unavailable'}</dd></div><div><dt>Pass roles</dt><dd>{document.stats.passRoles === null ? 'Unavailable' : formatPassRoleCounts(document.stats.passRoles)}</dd></div><div><dt>Authored design rows</dt><dd>Unavailable · foreign file has no row provenance</dd></div><div><dt>Programmed travel</dt><dd>{motion === null ? 'Unavailable' : `${formattedMetric(motion.coordinateMetric.programmedTravelUnits)} encoded stop-coordinate units`}</dd></div><div><dt>Assumption-derived travel</dt><dd>{motion === null ? 'Unavailable' : `${formattedMetric(motion.assumptionModel.assumedTravelMm)} mm · ${motion.assumptionModel.assumedPitchMmPerCoordinateUnit} mm/unit`}</dd></div><div><dt>Idealized constant-speed term</dt><dd>{idealizedMotionLabel(motion)}</dd></div><div><dt>Needles</dt><dd>{document.stats.needleSpan}</dd></div><div><dt>Rack range</dt><dd>{document.stats.rackRange}</dd></div></dl><p>Only the encoded stop-coordinate total is exact. Millimetres assume one coordinate unit equals one 3.63 mm needle pitch; the time term additionally assumes each encoded speed is constant mm/s. Neither is physical elapsed time or a physical lower bound.</p></section>
        <section><h2>Carrier map</h2><div className="carrier-map">{document.stats.carriers.length ? document.stats.carriers.map((carrier) => <span key={carrier}><i style={{ background: CARRIER_COLORS[carrier] }} />C{carrier}<b>Role unspecified</b></span>) : <em>No carriers found</em>}</div></section>
        {findingGroups.length > 0 && <section><h2>Known findings</h2><ul className="run-sheet-findings">{findingGroups.map((group) => <li key={group.key}>
          <div><b>{group.severity.toUpperCase()}</b><strong>{group.title}</strong><span> · {group.occurrences.toLocaleString()} occurrence{group.occurrences === 1 ? '' : 's'}</span></div>
          <p>{group.explanation}</p>
          <ul className="run-sheet-finding-anchors">{group.representatives.map((representative, index) => <li key={`${formatForeignRunSheetFindingAnchor(representative)}-${index}`}><b>{formatForeignRunSheetFindingAnchor(representative)}</b>{representative.detail !== group.explanation ? ` — ${representative.detail}` : ''}</li>)}</ul>
        </li>)}</ul></section>}
        <section><h2>Pre-knit check</h2><ul className="checklist"><li>Carrier yarns and roles confirmed against the original program setup</li><li>Needle bed is clear and carriage moves freely</li><li>Required waste yarn and draw thread confirmed from the original setup</li><li>Encoded per-pass speed and roller values have machine-side review; editor/profile checks are not physical safety approval</li><li>Representative swatch has been knit and inspected</li></ul></section>
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
  const motion = kcode.trace === null ? null : deriveMachineTraceProgrammedMotionV1(kcode.trace, {
    assumedPitchMmPerCoordinateUnit: KNITERATE_7GG_KCODE_PROFILE_V2.machine.needlePitchMm,
  });
  return <div className="modal-backdrop"><article className="run-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="authored-run-title" tabIndex={-1}>
    <div className="run-sheet-actions"><button className="secondary-button" type="button" onClick={onClose}><X size={16} /> Close</button><button className="primary-button" type="button" onClick={() => window.print()}><Printer size={16} /> Print</button></div>
    <header><span>KNITERATE STUDIO · RUN SHEET</span><h1 id="authored-run-title">{project.title}</h1><div className={`print-verdict verdict-${verdict.state}`}>{verdict.label}</div></header>
    <p className="run-annotation">{verdict.annotation}</p>
    <section><h2>Machine program</h2><dl><div><dt>Profile</dt><dd>7gg worsted · 252-needle bed</dd></div><div><dt>Needles</dt><dd>{state.machine.needleOffset}–{needleEnd} ({state.chart.width})</dd></div><div><dt>Authored design rows</dt><dd>{state.chart.height}</dd></div><div><dt>Backing</dt><dd>{state.strategy.technique}</dd></div><div><dt>Emitted machine passes</dt><dd>{kcode.passCount.toLocaleString()}</dd></div><div><dt>Authored-plan heuristic</dt><dd>{compiled.stats.estimatedKnitTimeSeconds === null ? '—' : `${Math.ceil(compiled.stats.estimatedKnitTimeSeconds / 60)} min`}</dd></div><div><dt>Emitted programmed travel</dt><dd>{motion === null ? 'Unavailable' : `${formattedMetric(motion.coordinateMetric.programmedTravelUnits)} encoded stop-coordinate units`}</dd></div><div><dt>Assumption-derived travel</dt><dd>{motion === null ? 'Unavailable' : `${formattedMetric(motion.assumptionModel.assumedTravelMm)} mm · ${motion.assumptionModel.assumedPitchMmPerCoordinateUnit} mm/unit`}</dd></div><div><dt>Idealized constant-speed term</dt><dd>{idealizedMotionLabel(motion)}</dd></div></dl><p>The authored-plan heuristic and emitted KCode term describe this same candidate but use different models. Only programmed stop-coordinate travel is exact; assumed millimetres and constant-speed seconds are not physical elapsed time or a physical lower bound.</p></section>
    <section><h2>Carrier map</h2><div className="carrier-map">{(compiled.frame?.frameCarriers ?? []).map((carrier) => <span key={`frame-${carrier}`}><i style={{ background: CARRIER_COLORS[carrier] }} />C{carrier}<b>Frame yarn (Customist draw/cameo)</b></span>)}{state.machine.yarnAssignments.map((assignment) => { const color = state.chart.palette.find((entry) => entry.id === assignment.paletteId); return <span key={assignment.paletteId}><i style={{ background: color?.hex }} />C{assignment.carrier}<b>{assignment.yarnName}</b></span>; })}{compiled.frame?.wasteCarrier && <span><i style={{ background: CARRIER_COLORS[compiled.frame.wasteCarrier] }} />C{compiled.frame.wasteCarrier}<b>Waste yarn · {compiled.frame.wastePasses ?? '-'} passes</b></span>}</div></section>
    <section><h2>Finish and identity</h2><dl><div><dt>Frame</dt><dd>Matched to Customist {compiled.frame?.reference.replace('reference/', '') ?? '-'} ({compiled.frame?.preset ?? '-'})</dd></div><div><dt>Finish</dt><dd>{compiled.frame?.bindOff ?? '-'}</dd></div><div><dt>Project revision</dt><dd>{compiled.revision}</dd></div><div><dt>Compile hash</dt><dd>{compiled.inputHash}</dd></div><div><dt>K-code SHA-256</dt><dd>{kcode.kcHash.slice(0, 16)}</dd></div></dl></section>
    {findings.length > 0 && <section><h2>Known findings</h2><ul>{findings.map((finding) => <li key={finding.rule}><b>{finding.severity.toUpperCase()}</b> {finding.message}</li>)}</ul></section>}
    <section><h2>Pre-knit check</h2><ul className="checklist"><li>Every carrier in the carrier map is loaded: frame yarns, waste, and C2–C5 pattern yarns</li><li>Needles {state.machine.needleOffset}–{needleEnd} are selected and the remaining bed is clear</li><li>Carriage moves freely and takedown is ready for {compiled.frame?.wastePasses ?? '-'} waste passes</li><li>The exact compiled settings recipe has machine-side review; Surface-proven does not establish physical setting safety</li><li>Machine profile is 7gg worsted and the finish is {compiled.frame?.bindOff ?? '-'}</li><li>A representative swatch has been knit and inspected</li></ul></section>
    <footer>Generated locally · {new Date().toLocaleDateString()}</footer>
  </article></div>;
}

function DiffView({ base, compare, onOpenCompare, onSelect }: { base: MachineDocument; compare: MachineDocument | null; onOpenCompare: () => void; onSelect: (index: number) => void }) {
  const [response, setResponse] = useState<{ base: MachineDocument; compare: MachineDocument; result: MachineDiff | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!compare || base.format !== 'kc' || compare.format !== 'kc') return;
    let active = true;
    void machineSession(base).compare(compare).then(
      (result) => { if (active) setResponse({ base, compare, result, error: null }); },
      (error) => { if (active) setResponse({ base, compare, result: null, error: error instanceof Error ? error.message : String(error) }); },
    );
    return () => { active = false; };
  }, [base, compare]);
  const result = response?.base === base && response.compare === compare ? response.result : null;
  if (base.format !== 'kc') return <div className="diff-empty"><ArrowLeftRight size={26} /><h2>Pass diff requires a .kc file</h2></div>;
  if (!compare) return <div className="diff-empty"><FilePlus2 size={26} /><h2>Choose a comparison file</h2><button className="primary-button" type="button" onClick={onOpenCompare}><FilePlus2 size={16} /> Choose .kc</button></div>;
  if (compare.format !== 'kc') return <div className="diff-empty" role="status">Choose a .kc comparison file.</div>;
  if (!result) return <div className="diff-empty" role="status">{response?.base === base && response.compare === compare && response.error ? response.error : 'Comparing exact KCode off-thread…'}</div>;
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
  useEffect(() => () => disposeMachineDocument(document), [document]);
  useEffect(() => () => disposeMachineDocument(compare), [compare]);
  const importController = useRef<AbortController | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  useEffect(() => () => importController.current?.abort(), []);
  const [selected, setSelected] = useState(0);
  const [preferredLine, setPreferredLine] = useState<number | null>(null);
  const [emittedSource, setEmittedSource] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'chart' | 'machine' | 'diff' | 'fabric'>('chart');
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
  const [newProjectKind, setNewProjectKind] = useState<'sweater' | 'beanie' | 'rectangle' | null>(null);
  // A first visit starts by choosing what to make, not on a blank machine chart; so does a return
  // visit that only ever saved the untouched blank chart.
  const [showStart, setShowStart] = useState(() => initial.recoveredAt === null
    || (initial.project.id === 'studio-default' && initial.project.history.entries.length === defaultProject().history.entries.length));
  // The project's controls show once there is a project to work on.
  const projectChrome = !document && !showStart;
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('design');
  const projectInput = useRef<HTMLInputElement>(null);
  const [appError, setAppError] = useState<string | null>(null);
  // Each opened file is a new document session, even with the same project id: pending work from the last one is dropped.
  const [openGeneration, setOpenGeneration] = useState(0);
  const [autosaveState, setAutosaveState] = useState<'saving' | 'saved' | 'failed'>(initial.recoveredAt ? 'saved' : 'saving');
  const blanketCompile = useBlanketCompiler(project);
  const materializedProject = useMemo(() => materializeColorworkProject(project), [project]);
  const authoredState = materializedProject.state;
  const isSweater = authoredState.object?.kind === 'sweater';
  // A one-yarn scarf or blanket: one flat piece, through the same piece pipeline as a sweater.
  const isPanel = authoredState.object?.kind === 'panel';
  const isPieces = isSweater || isPanel;
  const sweaterRun = useSweaterRun(isPieces ? project : null);
  const sweaterPlan = useMemo(() => (isSweater ? planSweater(authoredState) : null), [isSweater, authoredState]);
  const panelPlan = useMemo(() => (isPanel ? planPanel(authoredState) : null), [isPanel, authoredState]);
  const plan = useMemo(() => planProject(materializedProject.state, materializedProject.placements), [materializedProject]);
  const [showChanges, setShowChanges] = useState(false);
  const [changesFrom, setChangesFrom] = useState<number | null>(null);
  const [packaging, setPackaging] = useState(false);
  // The design as it is now: its files count as downloaded until the next change.
  const revision = `${project.id}@${project.history.entries[project.history.cursor - 1]?.id ?? ''}`;
  const [downloadedRevision, setDownloadedRevision] = useState<string | null>(null);
  const downloaded = downloadedRevision === revision;
  const swatchFile = useSwatchFile(project, !document && !showStart, download);
  const authoredNeedleRange = useMemo(() => authoredKnitoutNeedleRange(authoredState), [authoredState]);
  const kcodeState = useKCodeArtifact(blanketCompile.artifact, authoredNeedleRange);
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
  // The same plan, findings and readiness story the CLI, the printed sheet and the package tell.
  const verdictKey = authoredVerdict === null ? null : `${authoredVerdict.state}|${authoredVerdict.label}|${authoredVerdict.evidenceId ?? ''}`;
  const authoredStory = useMemo(() => {
    if (authoredVerdict === null) return null;
    const result: AuthoredPipelineResult = { compiled: blanketCompile.artifact, compileError: blanketCompile.error, kcode: outputCurrent ? kcodeState.artifact : null, outputError: kcodeState.error, verdict: authoredVerdict, exportReady: authoredExportReady };
    const findings = collectFindings(plan, result);
    const readiness = resolveReadiness({ verdict: authoredVerdict, findings });
    return { result, findings, readiness, story: readinessStory(plan, findings, readiness, authoredVerdict, materializedProject.state.trials ?? []) };
  }, [plan, blanketCompile.artifact, blanketCompile.error, kcodeState.artifact, kcodeState.error, outputCurrent, verdictKey, authoredExportReady]);
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
  // A colour chart is sized in cm at a typical gauge, until a swatch is measured.
  const createProject = ({ title, widthCm, heightCm, colorCount }: NewProjectValues) => {
    const palette = DEFAULT_PROJECT_PALETTE.slice(0, colorCount).map((entry) => ({ ...entry }));
    const width = Math.max(1, Math.round(widthCm * TYPICAL_COLOURWORK_GAUGE.stitchesPer10cm / 10));
    const height = Math.max(1, Math.round(heightCm * TYPICAL_COLOURWORK_GAUGE.rowsPer10cm / 10));
    const created = createColorworkProjectV1({
      kind: 'knitlab-colorwork-chart', version: 1, title, width, height, rowNumbering: 'bottom-up', palette,
      cells: Array.from({ length: height }, () => Array.from({ length: width }, () => 0)),
    }, { id: projectId(title), title });
    const group = `create_${crypto.randomUUID().replace(/-/g, '')}`;
    const edits = withSizingFixes(created, [{ kind: 'set-gauge', gauge: { ...TYPICAL_COLOURWORK_GAUGE } }, { kind: 'set-target', target: { widthCm, heightCm } }]);
    setProject(edits.reduce((current, edit, index) => appendProjectEdit(current, { id: `${group}-${index}`, source: 'human', edit, group, ...(index === 0 ? { label: `Create ${title}` } : {}) }), created));
    setDocument(null); setCompare(null); setView('chart'); setShowNewProject(false); setShowStart(false); setWorkspaceView('design');
  };
  const createBeanie = (intent: BeanieIntent) => {
    setProject(createBeanieProject(intent, { id: projectId(intent.title), source: 'human', group: `create_${crypto.randomUUID().replace(/-/g, '')}` }));
    setDocument(null); setCompare(null); setView('chart'); setShowNewProject(false); setChangesFrom(null); setShowStart(false); setWorkspaceView('design');
  };
  const createPanel = (intent: PanelIntent) => {
    setProject(createPanelProject(intent, { id: projectId(intent.title), source: 'human', group: `create_${crypto.randomUUID().replace(/-/g, '')}` }));
    setDocument(null); setCompare(null); setView('chart'); setShowNewProject(false); setChangesFrom(null); setShowStart(false); setWorkspaceView('design');
  };
  const createSweater = (intent: SweaterIntent) => {
    setProject(createSweaterProject(intent, { id: projectId(intent.title), source: 'human', group: `create_${crypto.randomUUID().replace(/-/g, '')}` }));
    setDocument(null); setCompare(null); setView('chart'); setShowNewProject(false); setChangesFrom(null); setShowStart(false); setWorkspaceView('design');
  };
  /** An opened project that continues this one (same id, this history as its prefix) arrives as new changes to review. */
  const openProjectFile = (opened: ColorworkProjectV1) => {
    const from = continuationFrom(project, opened);
    setProject(opened);
    setOpenGeneration((value) => value + 1);
    setShowStart(false);
    setWorkspaceView('design');
    if (from !== null) { setChangesFrom(from); setShowChanges(true); } else setChangesFrom(null);
  };
  const downloadPackage = async () => {
    if (!authoredExportReady || !authoredStory) return;
    setPackaging(true);
    try {
      const files = await handoffFiles({ project, serializedProject: serializeColorworkProjectV1(project), plan, result: authoredStory.result, findings: authoredStory.findings, readiness: authoredStory.readiness, extra: { 'chart.png': await chartPng(authoredState) }, sha256: sha256Hex });
      const link = window.document.createElement('a');
      link.href = URL.createObjectURL(new Blob([zipStore(files)], { type: 'application/zip' }));
      link.download = `${project.id}-package.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
      setDownloadedRevision(revision);
    } finally { setPackaging(false); }
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
    download(`${project.id}.kc`, new Blob([kcodeState.artifact.kcText], { type: 'text/plain' }));
    setDownloadedRevision(revision);
  };

  // One place for every project action: the menu and the panels call these.
  const canUndo = project.history.cursor > 0;
  const canRedo = project.history.cursor < project.history.entries.length;
  const undo = () => { if (canUndo) setProject(undoProjectEdit(project)); };
  const redo = () => { if (canRedo) setProject(redoProjectEdit(project)); };
  const saveProject = () => download(`${project.id}.kniterate-studio.json`, new Blob([serializeColorworkProjectV1(project)], { type: 'application/json' }));
  const openProjectInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { openProjectFile((await openStudioProjectFile(file)).project); setDocument(null); setAppError(null); } catch (error) { setAppError(error instanceof Error ? error.message : String(error)); }
  };
  const sweaterReady = isPieces && sweaterRun.current && sweaterRun.summary !== null;
  const downloadSweaterPackage = async () => {
    if (!(sweaterPlan || panelPlan) || !sweaterRun.current || !sweaterRun.summary?.exportReady) return;
    setPackaging(true);
    try {
      const input = { project, serializedProject: serializeColorworkProjectV1(project), summary: sweaterRun.summary, sha256: sha256Hex };
      const files = panelPlan ? await panelPackageFiles({ ...input, plan: panelPlan }) : await sweaterPackageFiles({ ...input, plan: sweaterPlan! });
      download(`${project.id}-${panelPlan ? 'panel' : 'sweater'}.zip`, new Blob([zipStore(files)], { type: 'application/zip' }));
      setDownloadedRevision(revision);
    } catch (error) { setAppError(error instanceof Error ? error.message : String(error)); } finally { setPackaging(false); }
  };
  const downloadSweaterPiece = (id: PieceId) => {
    // Only a file compiled from the design as it is now.
    const piece = sweaterRun.current ? sweaterRun.summary?.pieces.find((item) => item.id === id) : undefined;
    if (piece?.kcText) download(`${project.id}-${id}.kc`, new Blob([piece.kcText], { type: 'text/plain' }));
    // A one-piece project's file is all of it.
    if (piece?.kcText && sweaterRun.summary?.pieces.length === 1) setDownloadedRevision(revision);
  };
  const downloadSweaterFiles = () => {
    const pieces = sweaterRun.current && sweaterRun.summary?.exportReady ? sweaterRun.summary.pieces.filter((piece) => piece.kcText) : [];
    if (pieces.length === 0) return;
    download(`${project.id}-machine-files.zip`, new Blob([zipStore(Object.fromEntries(pieces.map((piece) => [`${piece.id}.kc`, piece.kcText!])))], { type: 'application/zip' }));
    setDownloadedRevision(revision);
  };
  const canPackage = isPieces ? Boolean(sweaterReady && sweaterRun.summary?.exportReady) : authoredExportReady;
  const canPrint = isPieces ? Boolean(sweaterReady) : authoredExportReady;
  const packageProject = () => void (isPieces ? downloadSweaterPackage() : downloadPackage());
  const printSheet = () => { if (document || canPrint) setShowRunSheet(true); };

  const showOpenedDocument = (opened: MachineDocument, comparison: boolean) => {
    if (comparison) { setCompare(opened); setView('diff'); }
    else { setShowStart(false); setDocument(opened); setCompare(null); setSelected(0); setPreferredLine(null); setEmittedSource(false); setMobileView(opened.kcode?.inspection?.hasScene ? 'movement' : 'passes'); setView('machine'); }
  };
  const openFile = async (file: File | undefined, comparison = false) => {
    if (!file) return;
    importController.current?.abort();
    const controller = new AbortController();
    importController.current = controller;
    setImporting(file.name);
    try {
      const opened = await readMachineFile(file, controller.signal);
      if (!controller.signal.aborted) showOpenedDocument(opened, comparison);
      else disposeMachineDocument(opened);
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      if (importController.current === controller) setImporting(null);
    }
  };
  const handleInput = (event: ChangeEvent<HTMLInputElement>, comparison = false) => {
    void openFile(event.target.files?.[0], comparison); event.target.value = '';
  };
  const select = (pass: number, line: number | null = null) => {
    const bounded = Math.max(0, Math.min(pass, (document?.passes.length ?? 1) - 1));
    if (line !== null) { setSelected(bounded); setPreferredLine(line); setEmittedSource(false); }
    else execution.selectAction(bounded);
    setView('machine');
  };

  const execution = useImportedMachineExecution(document, selected, (pass, line) => {
    setSelected(pass); setPreferredLine(line); setEmittedSource(true);
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!document || showRunSheet || event.defaultPrevented || (event.target as HTMLElement | null)?.closest('input, textarea, select, button')) return;
      if (view === 'machine' && event.key === 'ArrowDown') { event.preventDefault(); select(selected + 1); }
      if (view === 'machine' && event.key === 'ArrowUp') { event.preventDefault(); select(selected - 1); }
      if (event.key === 'Escape') { setShowVerdict(false); setShowRunSheet(false); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [document, selected, showRunSheet, view]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!projectChrome || event.defaultPrevented || !(event.ctrlKey || event.metaKey) || (event.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  });

  const viewItems = document
    ? (['machine', 'fabric', 'diff'] as const).map((item) => ({ label: item === 'machine' ? 'Passes' : item === 'fabric' ? 'Fabric' : 'Compare with another file', checked: view === item, onSelect: () => setView(item) }))
    : (['design', 'schematic', 'file'] as const).map((item) => ({ label: item === 'design' ? 'Design' : item === 'schematic' ? 'Schematic' : 'Machine file', checked: workspaceView === item, disabled: !projectChrome, onSelect: () => setWorkspaceView(item) }));
  const menus: Menu[] = [
    { label: 'File', items: [
      { label: 'New project…', onSelect: () => { setNewProjectKind(null); setShowNewProject(true); } },
      { label: 'Open project…', onSelect: () => projectInput.current?.click() },
      { label: 'Save project', onSelect: saveProject, disabled: !projectChrome },
      ...(document ? [{ label: 'Back to your project', onSelect: () => { setDocument(null); setView('chart'); } }] : []),
      'separator',
      { label: 'Download knitting package', onSelect: packageProject, disabled: !projectChrome || !canPackage || packaging },
      { label: isSweater ? 'Download machine files' : 'Download machine file', onSelect: isSweater ? downloadSweaterFiles : isPanel ? () => downloadSweaterPiece('panel') : downloadKCode, disabled: !projectChrome || !canPackage },
      { label: 'Print knitting sheet', onSelect: printSheet, disabled: document ? false : !projectChrome || !canPrint },
      'separator',
      { label: 'Check a machine file…', onSelect: () => fileInput.current?.click() },
    ] },
    { label: 'Edit', items: [
      { label: 'Undo', onSelect: undo, disabled: !projectChrome || !canUndo, shortcut: 'Ctrl+Z' },
      { label: 'Redo', onSelect: redo, disabled: !projectChrome || !canRedo, shortcut: 'Ctrl+Shift+Z' },
      'separator',
      { label: 'Name and colours…', onSelect: () => setShowProjectSettings(true), disabled: !projectChrome },
    ] },
    { label: 'View', items: [
      ...viewItems,
      'separator',
      { label: 'History', onSelect: () => setShowChanges((value) => !value), checked: showChanges, disabled: !projectChrome || isPieces },
      { label: 'Dark mode', onSelect: () => setTheme(theme === 'light' ? 'dark' : 'light'), checked: theme === 'dark' },
    ] },
  ];

  return (
    <div className="app-shell" data-theme={theme} data-autosave={autosaveState}>
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-copy"><strong>Kniterate Studio</strong><small>{document ? document.filename : project.title}{projectChrome && autosaveState === 'failed' ? ' · not saved on this device' : ''}</small></span></div>
        <MenuBar menus={menus} />
        <span className="topbar-spacer" />
        {document && <Verdict document={document} onClick={() => setShowVerdict((value) => !value)} />}
        {projectChrome && isPieces && <AuthoredVerdictBadge verdict={sweaterRun.current ? sweaterRun.summary?.verdict ?? null : null} pending="checking" onClick={() => setShowVerdict((value) => !value)} />}
        {projectChrome && !isPieces && <AuthoredVerdictBadge verdict={authoredVerdict} pending={blanketCompile.status === 'ready' ? 'checking' : 'compiling'} onClick={() => setShowVerdict((value) => !value)} />}
      </header>
      {appError && <div className="machine-import-status" role="alert"><span>{appError}</span><button className="secondary-button" type="button" onClick={() => setAppError(null)}>Dismiss</button></div>}
      <input ref={projectInput} className="file-input" type="file" accept=".json,application/json" aria-label="Project file to open" onChange={(event) => void openProjectInput(event)} />
      {importing && <div className="machine-import-status" role="status"><span>Checking {importing}…</span><button className="secondary-button" type="button" onClick={() => { importController.current?.abort(); setImporting(null); }}>Cancel import</button></div>}
      <input ref={fileInput} className="file-input" type="file" accept=".kc,.k,text/plain" onChange={handleInput} />
      <input ref={compareInput} className="file-input" type="file" accept=".kc,text/plain" onChange={(event) => handleInput(event, true)} />

      {!document && isSweater && sweaterPlan ? <SweaterWorkspace project={project} onProject={setProject} plan={sweaterPlan} run={sweaterRun} view={workspaceView} onView={setWorkspaceView} onPackage={packageProject} onPrint={printSheet} onDownloadPiece={downloadSweaterPiece} packaging={packaging} downloaded={downloaded} swatchFile={swatchFile} />
        : !document && isPanel && panelPlan ? <PanelWorkspace project={project} onProject={setProject} plan={panelPlan} run={sweaterRun} view={workspaceView} onView={setWorkspaceView} onPackage={packageProject} onPrint={printSheet} onDownloadPiece={downloadSweaterPiece} packaging={packaging} downloaded={downloaded} swatchFile={swatchFile} />
        : !document ? <ChartWorkspace project={project} onProject={setProject} generation={openGeneration} plan={plan} story={authoredStory?.story ?? null} storyPending={blanketCompile.status !== 'ready' || displayedOutputStatus === 'converting'} candidateSha256={authoredExportReady ? kcodeState.artifact?.kcHash ?? null : null} isDarkMode={theme === 'dark'} compile={blanketCompile} kcode={outputCurrent ? kcodeState.artifact : null} outputError={kcodeState.error} view={workspaceView} onView={setWorkspaceView}
            status={{ verdict: authoredVerdict, exportReady: authoredExportReady, packaging, downloaded, swatchFile, onPackage: packageProject, onPrint: printSheet, onDownloadKc: downloadKCode }}
            stepThrough={blanketCompile.artifact?.ok ? <CompiledMachineWorkspace artifact={blanketCompile.artifact} kcode={outputCurrent ? kcodeState.artifact : null} outputStatus={displayedOutputStatus} outputError={kcodeState.error} focusedRowId={focusedRowId} onFocusedRowId={setFocusedRowId} /> : null} />
        : (
        <div className="workspace">
          <nav className="side-rail" aria-label="Workspace views">
            <button className={view === 'machine' ? 'active' : ''} type="button" onClick={() => setView('machine')} title="Machine passes"><Rows3 size={19} /></button>
            <button className={view === 'fabric' ? 'active' : ''} type="button" onClick={() => setView('fabric')} title="Schematic topology"><Network size={19} /></button>
            <button className={view === 'diff' ? 'active' : ''} type="button" onClick={() => setView('diff')} title="Pass diff"><ArrowLeftRight size={19} /></button>
          </nav>
          <main className={`machine-workspace${view === 'machine' ? '' : ' compact-workspace'}`}>
            <div className="workspace-head">
              <div><span className="eyebrow">Machine file</span><h1>{view === 'machine' ? 'Passes' : view === 'fabric' ? 'Fabric' : 'Compare with another file'}</h1></div>
              <div className="stat-strip"><span><b>{document.stats.passMetricProvenance === 'strict-kcode-trace' ? document.stats.passCount.toLocaleString() : '—'}</b> programmed passes</span><span><b>{document.stats.loopFormingPassCount === null ? '—' : document.stats.loopFormingPassCount.toLocaleString()}</b> loop-forming</span>{document.stats.passRoles !== null && <span><b>{(document.stats.passRoles['carrier-move'] + document.stats.passRoles['carriage-move']).toLocaleString()}</b> carrier/carriage moves</span>}<span><b>{document.stats.carriers.length}</b> carriers</span><span><b>{document.stats.needleSpan}</b></span><span><b>rack {document.stats.rackRange}</b></span></div>
            </div>
            {view === 'machine' && <div className="mobile-tabs">
              {document.kcode?.inspection?.hasScene && <button className={mobileView === 'movement' ? 'active' : ''} type="button" onClick={() => setMobileView('movement')}>movement</button>}
              {(['passes', 'diagnostics', 'source'] as MobileView[]).map((item) => <button className={mobileView === item ? 'active' : ''} type="button" key={item} onClick={() => setMobileView(item)}>{item}</button>)}
            </div>}
            {view === 'machine' ? (
              <div className={`machine-layout${document.kcode?.inspection?.hasScene ? ' has-movement' : ''} mobile-${mobileView}`}>
                {execution.inspection?.scene && <MachineMovementView className="machine-movement-panel" execution={execution} scene={execution.inspection!.scene!} validation={execution.inspection!.validation} navigationPasses={document.kcode?.inspection?.passNavigation} displayDiagnostics={document.diagnostics.map(({ severity, passIndex, actionIndex, rule, rawMessage }) => ({ severity, passIndex, actionIndex, rule, message: rawMessage }))} overallContext={documentOverallContext(document)} selectedPass={selected} onSelect={(pass) => select(pass)} />}
                <PassGrid passes={document.passes} selected={selected} collapsed={collapsed} onToggle={(section) => setCollapsed((current) => { const next = new Set(current); next.has(section) ? next.delete(section) : next.add(section); return next; })} onSelect={(pass) => select(pass)} />
                <Diagnostics document={document} selected={selected} onSelect={select} />
                <SourceDock document={document} selected={selected} preferredLine={preferredLine} emitted={emittedSource} onOriginalSource={() => { setEmittedSource(false); setPreferredLine(null); }} />
              </div>
            ) : view === 'fabric'
              ? <ForeignFabricView document={document} selectedPass={selected} onSelect={(pass, action) => { execution.selectAction(pass, action); }} />
              : <DiffView base={document} compare={compare} onOpenCompare={() => compareInput.current?.click()} onSelect={(index) => select(index)} />}
          </main>
        </div>
      )}
      {document && showVerdict && <VerdictPanel document={document} onClose={() => setShowVerdict(false)} />}
      {!document && showVerdict && !isPieces && authoredVerdict && <AuthoredVerdictPanel verdict={authoredVerdict} onClose={() => setShowVerdict(false)} />}
      {!document && showVerdict && isPieces && sweaterRun.current && sweaterRun.summary && <AuthoredVerdictPanel verdict={sweaterRun.summary.verdict} onClose={() => setShowVerdict(false)} />}
      {document && showRunSheet && <RunSheet document={document} onClose={() => setShowRunSheet(false)} />}
      {!document && showRunSheet && isPanel && panelPlan && <GarmentSheet markdown={panelInstructions(project, panelPlan, sweaterRun.current ? sweaterRun.summary : null)} schematic={null} onClose={() => setShowRunSheet(false)} />}
      {!document && showRunSheet && isSweater && sweaterPlan && <GarmentSheet markdown={sweaterInstructions(project, sweaterPlan, sweaterRun.current ? sweaterRun.summary : null)} schematic={sweaterSchematicSvg(sweaterPlan, authoredState.chart.palette[0]!.hex)} onClose={() => setShowRunSheet(false)} />}
      {!document && showRunSheet && authoredExportReady && authoredStory && authoredState.object?.kind === 'beanie' && <GarmentSheet markdown={instructionsMarkdown(project, plan, authoredStory.result, authoredStory.findings, authoredStory.readiness)} schematic={schematicSvg(project, plan)} onClose={() => setShowRunSheet(false)} />}
      {!document && showRunSheet && !isPieces && authoredExportReady && authoredVerdict && blanketCompile.artifact && kcodeState.artifact && authoredState.object?.kind !== 'beanie' && <AuthoredRunSheet project={project} compiled={blanketCompile.artifact} kcode={kcodeState.artifact} verdict={authoredVerdict} onClose={() => setShowRunSheet(false)} />}
      {showStart && !document && <StartScreen onNew={(kind) => { setNewProjectKind(kind); setShowNewProject(true); }} onOpenProject={openProjectFile} onOpenMachineFile={() => fileInput.current?.click()} onBlank={() => setShowStart(false)} />}
      {showNewProject && <NewProjectDialog onCreate={createProject} onCreateBeanie={createBeanie} onCreateSweater={createSweater} onCreatePanel={createPanel} initialKind={newProjectKind ?? (isSweater ? 'sweater' : 'rectangle')} onClose={() => { setShowNewProject(false); setNewProjectKind(null); }} />}
      {!document && !isPieces && showChanges && <ChangesPanel project={project} highlightFrom={changesFrom} onProject={setProject} onClose={() => { setShowChanges(false); setChangesFrom(null); }} />}
      {showProjectSettings && <ProjectSettingsDialog project={project} onSave={saveProjectSettings} onClose={() => setShowProjectSettings(false)} />}
    </div>
  );
}
