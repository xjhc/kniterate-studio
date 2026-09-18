import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import type {
  MachinePassStateSnapshotV1,
  MachineSceneActionGlyphV1,
  MachineScenePassV1,
  MachineSceneSelectionV1,
  MachineSceneV1,
  MachineValidationReportV1,
} from '@kniterate-studio/machine-lib/browser';
import './MachineMovementView.css';
import { ExecutionControls, ExecutionState } from './ExecutionControls';
import type { MachineExecutionController } from './useMachineExecution';

export interface MachineMovementViewProps {
  /** Renderer-ready exact KCode scene. No machine semantics are derived here. */
  scene: MachineSceneV1;
  /** Optional KCode-native validator state for loop counts and findings. */
  validation?: MachineValidationReportV1 | null;
  /** Optional product-boundary severities for display. Raw validator evidence
   * remains attached through `validation`; this only controls presentation. */
  displayDiagnostics?: readonly {
    readonly severity: 'error' | 'warning' | 'info';
    readonly passIndex: number | null;
    readonly actionIndex?: number | null;
    readonly rule: string;
    readonly message: string;
  }[];
  /** MachineScene passIndex, not array position. */
  selectedPass: number | null;
  onSelect: (passIndex: number) => void;
  /** Whole-artifact context from the compiler/verdict policy, not pass math. */
  overallContext?: {
    status: 'clear' | 'warning' | 'blocked';
    label: string;
  };
  className?: string;
  execution?: MachineExecutionController;
}

interface CoordinateDomain {
  min: number;
  max: number;
}

const PLOT = {
  width: 1000,
  left: 58,
  right: 942,
  carriageY: 27,
  guideY: 57,
  frontY: 105,
  rearY: 157,
} as const;

function plotX(coordinate: number, domain: CoordinateDomain): number {
  const span = domain.max - domain.min;
  if (span === 0) return (PLOT.left + PLOT.right) / 2;
  const ratio = (coordinate - domain.min) / span;
  return PLOT.left + Math.max(0, Math.min(1, ratio)) * (PLOT.right - PLOT.left);
}

function formatCoordinate(value: number): string {
  return Object.is(value, -0) ? '0' : String(value);
}

function passLabel(pass: MachineScenePassV1): string {
  return `Pass ${pass.passIndex + 1}, ${pass.direction === '>>' ? 'right' : 'left'}, ${pass.operation}, carrier ${pass.carrier}`;
}

function loopTransition(
  passState: MachinePassStateSnapshotV1 | undefined,
  selection: MachineSceneSelectionV1,
): string {
  if (passState === undefined) return 'loops not attached';
  const delta = passState.stackDeltas.find((candidate) =>
    candidate.bed === selection.bed
    && candidate.traceCoordinate === selection.traceCoordinate);
  return delta === undefined
    ? 'loop delta unavailable'
    : `${delta.beforeCount}→${delta.afterCount} loops`;
}

function selectionLabel(selection: MachineSceneSelectionV1): string {
  return `${selection.bed} K${formatCoordinate(selection.kcodeColumn)} / trace ${formatCoordinate(selection.traceCoordinate)}, selector ${selection.stitchSelector.token}`;
}

function rackBoundaryLabel(beforePassIndex: number, passCount: number): string {
  return beforePassIndex === passCount
    ? 'after final pass'
    : `before P${String(beforePassIndex + 1).padStart(4, '0')}`;
}

function actionLabel(
  action: MachineSceneActionGlyphV1,
  passState: MachinePassStateSnapshotV1 | undefined,
): { title: string; detail: string } {
  switch (action.geometry) {
    case 'point':
      return {
        title: action.semantic,
        detail: `${selectionLabel(action.at)} · ${loopTransition(passState, action.at)}`,
      };
    case 'edge':
      return {
        title: action.semantic === 'split' ? `split · C${action.carrier}` : 'transfer',
        detail: [
          `${selectionLabel(action.source)} (${loopTransition(passState, action.source)})`,
          `${selectionLabel(action.target)} (${loopTransition(passState, action.target)})`,
        ].join(' → '),
      };
    case 'travel':
      return {
        title: `move · C${action.carrier}`,
        detail: `carriage ${formatCoordinate(action.movement.carriage.fromStopCoordinate)}→${formatCoordinate(action.movement.carriage.toStopCoordinate)}`,
      };
    case 'unknown':
      return {
        title: `unknown · ${action.operation}`,
        detail: `${action.reason}; ${action.selections.length} encoded selection${action.selections.length === 1 ? '' : 's'}`,
      };
  }
}

function actionClass(action: MachineSceneActionGlyphV1): string {
  return `mmv-action-${action.semantic}`;
}

function PointGlyph({
  action,
  domain,
  passState,
}: {
  action: Extract<MachineSceneActionGlyphV1, { geometry: 'point' }>;
  domain: CoordinateDomain;
  passState: MachinePassStateSnapshotV1 | undefined;
}) {
  const x = plotX(action.at.kcodeColumn, domain);
  const y = action.at.bed === 'front' ? PLOT.frontY : PLOT.rearY;
  const label = actionLabel(action, passState);
  if (action.semantic === 'drop') {
    return <g className={actionClass(action)}>
      <title>{`${label.title}: ${label.detail}`}</title>
      <path d={`M ${x - 5} ${y - 5} L ${x + 5} ${y + 5} M ${x + 5} ${y - 5} L ${x - 5} ${y + 5}`} />
    </g>;
  }
  if (action.semantic === 'tuck') {
    return <g className={actionClass(action)}>
      <title>{`${label.title}: ${label.detail}`}</title>
      <path d={`M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z`} />
    </g>;
  }
  return <g className={actionClass(action)}>
    <title>{`${label.title}: ${label.detail}`}</title>
    <circle cx={x} cy={y} r="6" />
  </g>;
}

function EdgeGlyph({
  action,
  domain,
  markerId,
  passState,
}: {
  action: Extract<MachineSceneActionGlyphV1, { geometry: 'edge' }>;
  domain: CoordinateDomain;
  markerId: string;
  passState: MachinePassStateSnapshotV1 | undefined;
}) {
  const sourceY = action.source.bed === 'front' ? PLOT.frontY : PLOT.rearY;
  const targetY = action.target.bed === 'front' ? PLOT.frontY : PLOT.rearY;
  const label = actionLabel(action, passState);
  return <g className={actionClass(action)}>
    <title>{`${label.title}: ${label.detail}`}</title>
    <path
      className="mmv-edge-halo"
      d={`M ${plotX(action.source.kcodeColumn, domain)} ${sourceY} L ${plotX(action.target.kcodeColumn, domain)} ${targetY}`}
    />
    <path
      className="mmv-edge-line"
      markerEnd={`url(#${markerId})`}
      d={`M ${plotX(action.source.kcodeColumn, domain)} ${sourceY} L ${plotX(action.target.kcodeColumn, domain)} ${targetY}`}
    />
  </g>;
}

function UnknownGlyph({
  action,
  domain,
}: {
  action: Extract<MachineSceneActionGlyphV1, { geometry: 'unknown' }>;
  domain: CoordinateDomain;
}) {
  return <g className={actionClass(action)}>
    <title>{`${action.operation}: ${action.reason}`}</title>
    {action.selections.map((selection, index) => {
      const x = plotX(selection.kcodeColumn, domain);
      const y = selection.bed === 'front' ? PLOT.frontY : PLOT.rearY;
      return <rect key={`${selection.bed}-${selection.payloadIndex}-${index}`} x={x - 5} y={y - 5} width="10" height="10" />;
    })}
  </g>;
}

function MachinePlot({
  pass,
  domain,
  passState,
  visibleActions,
}: {
  pass: MachineScenePassV1;
  domain: CoordinateDomain;
  passState: MachinePassStateSnapshotV1 | undefined;
  visibleActions?: number;
}) {
  const id = useId().replaceAll(':', '');
  const carriageMarker = `mmv-carriage-${id}`;
  const guideMarker = `mmv-guide-${id}`;
  const transferMarker = `mmv-transfer-${id}`;
  const splitMarker = `mmv-split-${id}`;
  const carriage = pass.movement.carriage;
  const guide = pass.movement.carrierGuide;

  return <svg
    className="mmv-plot"
    viewBox={`0 0 ${PLOT.width} 190`}
    role="img"
    aria-label={`${passLabel(pass)}. Exact carriage, carrier guide, front bed, rear bed, and actions.`}
    preserveAspectRatio="none"
  >
    <title>{passLabel(pass)}</title>
    <defs>
      <marker id={carriageMarker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 Z" className="mmv-carriage-arrow" />
      </marker>
      <marker id={guideMarker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 Z" className="mmv-guide-arrow" />
      </marker>
      <marker id={transferMarker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 Z" className="mmv-transfer-arrow" />
      </marker>
      <marker id={splitMarker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 Z" className="mmv-split-arrow" />
      </marker>
    </defs>

    <rect x={PLOT.left} y="0" width={PLOT.right - PLOT.left} height="190" className="mmv-plot-field" />
    <text x="10" y={PLOT.carriageY + 4} className="mmv-axis-label">CAR</text>
    <text x="10" y={PLOT.guideY + 4} className="mmv-axis-label">C{pass.carrier}</text>
    <text x="10" y={PLOT.frontY + 4} className="mmv-axis-label">F</text>
    <text x="10" y={PLOT.rearY + 4} className="mmv-axis-label">R</text>

    <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.carriageY} y2={PLOT.carriageY} className="mmv-track" />
    <line
      x1={plotX(carriage.fromStopCoordinate, domain)}
      x2={plotX(carriage.toStopCoordinate, domain)}
      y1={PLOT.carriageY}
      y2={PLOT.carriageY}
      markerEnd={`url(#${carriageMarker})`}
      className="mmv-carriage-travel"
    />
    <circle cx={plotX(carriage.fromStopCoordinate, domain)} cy={PLOT.carriageY} r="4" className="mmv-carriage-stop" />
    <circle cx={plotX(carriage.toStopCoordinate, domain)} cy={PLOT.carriageY} r="4" className="mmv-carriage-stop" />

    <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.guideY} y2={PLOT.guideY} className="mmv-track" />
    {guide ? <>
      <line
        x1={plotX(guide.fromStopCoordinate, domain)}
        x2={plotX(guide.toStopCoordinate, domain)}
        y1={PLOT.guideY}
        y2={PLOT.guideY}
        markerEnd={`url(#${guideMarker})`}
        className="mmv-guide-travel"
      />
      <circle cx={plotX(guide.fromStopCoordinate, domain)} cy={PLOT.guideY} r="3.5" className="mmv-guide-stop" />
      <circle cx={plotX(guide.toStopCoordinate, domain)} cy={PLOT.guideY} r="3.5" className="mmv-guide-stop" />
    </> : <text x={PLOT.left + 7} y={PLOT.guideY - 7} className="mmv-no-guide">carrierless pass</text>}

    <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.frontY} y2={PLOT.frontY} className="mmv-bed mmv-bed-front" />
    <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.rearY} y2={PLOT.rearY} className="mmv-bed mmv-bed-rear" />

    {pass.beds.front.map((selection, index) => <g key={`front-${selection.payloadIndex}-${index}`} className="mmv-selection mmv-front-selection">
      <title>{`${selectionLabel(selection)}; ${loopTransition(passState, selection)}`}</title>
      <line x1={plotX(selection.kcodeColumn, domain)} x2={plotX(selection.kcodeColumn, domain)} y1={PLOT.frontY - 9} y2={PLOT.frontY + 9} />
    </g>)}
    {pass.beds.rear.map((selection, index) => <g key={`rear-${selection.payloadIndex}-${index}`} className="mmv-selection mmv-rear-selection">
      <title>{`${selectionLabel(selection)}; ${loopTransition(passState, selection)}`}</title>
      <line x1={plotX(selection.kcodeColumn, domain)} x2={plotX(selection.kcodeColumn, domain)} y1={PLOT.rearY - 9} y2={PLOT.rearY + 9} />
    </g>)}

    {pass.actionGlyphs.slice(0, visibleActions).map((action, index) => {
      if (action.geometry === 'point') {
        return <PointGlyph key={`point-${index}`} action={action} domain={domain} passState={passState} />;
      }
      if (action.geometry === 'edge') {
        return <EdgeGlyph
          key={`edge-${index}`}
          action={action}
          domain={domain}
          markerId={action.semantic === 'split' ? splitMarker : transferMarker}
          passState={passState}
        />;
      }
      if (action.geometry === 'unknown') {
        return <UnknownGlyph key={`unknown-${index}`} action={action} domain={domain} />;
      }
      return null;
    })}

    <text x={PLOT.left} y="184" className="mmv-domain-label">K{formatCoordinate(domain.min)}</text>
    <text x={PLOT.right} y="184" textAnchor="end" className="mmv-domain-label">K{formatCoordinate(domain.max)}</text>
  </svg>;
}

function PassTape({
  passes,
  selectedPass,
  onSelect,
}: {
  passes: readonly MachineScenePassV1[];
  selectedPass: number | null;
  onSelect: (passIndex: number) => void;
}) {
  const tapeRef = useRef<HTMLDivElement>(null);
  const selectedPosition = passes.findIndex((pass) => pass.passIndex === selectedPass);
  const visibleLimit = 61;
  const visibleStart = Math.max(0, Math.min(
    passes.length - visibleLimit,
    (selectedPosition === -1 ? 0 : selectedPosition) - Math.floor(visibleLimit / 2),
  ));
  const visibleEnd = Math.min(passes.length, visibleStart + visibleLimit);
  const visiblePasses = passes.slice(visibleStart, visibleEnd);
  useEffect(() => {
    const selected = tapeRef.current?.querySelector<HTMLElement>(
      `[data-pass-position="${selectedPosition}"]`,
    );
    selected?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [selectedPosition, visibleStart]);
  const move = (position: number) => {
    const target = passes[position];
    if (target !== undefined) onSelect(target.passIndex);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = selectedPosition === -1 ? 0 : selectedPosition;
    const targetPosition = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? passes.length - 1
        : event.key === 'ArrowLeft'
          ? Math.max(0, current - 1)
          : Math.min(passes.length - 1, current + 1);
    move(targetPosition);
    const tape = event.currentTarget;
    window.requestAnimationFrame(() => tape.querySelector<HTMLButtonElement>(
      `[data-pass-position="${targetPosition}"]`,
    )?.focus());
  };

  return <div className="mmv-pass-tape-shell">
    <button
      type="button"
      className="mmv-step-button"
      aria-label="Select previous pass"
      disabled={selectedPosition <= 0}
      onClick={() => move(selectedPosition - 1)}
    >←</button>
    <div ref={tapeRef} className="mmv-pass-tape" aria-label="Machine passes" onKeyDown={onKeyDown}>
      {passes.length > visibleLimit && <span className="mmv-pass-window" aria-label={`Showing pass controls ${visibleStart + 1} through ${visibleEnd} of ${passes.length}`}>
        {visibleStart + 1}–{visibleEnd}<small>/{passes.length}</small>
      </span>}
      {visiblePasses.map((pass, localPosition) => {
        const position = visibleStart + localPosition;
        return <button
        type="button"
        className={`mmv-pass-tab${pass.passIndex === selectedPass ? ' is-selected' : ''}`}
        aria-pressed={pass.passIndex === selectedPass}
        aria-label={passLabel(pass)}
        data-pass-position={position}
        key={pass.passIndex}
        onClick={() => onSelect(pass.passIndex)}
      >
        <span>P{String(pass.passIndex + 1).padStart(4, '0')}</span>
        <b>{pass.direction} {pass.operation}</b>
        <small>C{pass.carrier}</small>
      </button>})}
    </div>
    <button
      type="button"
      className="mmv-step-button"
      aria-label="Select next pass"
      disabled={selectedPosition === -1 || selectedPosition >= passes.length - 1}
      onClick={() => move(selectedPosition + 1)}
    >→</button>
  </div>;
}

function StateMetric({ label, before, after }: { label: string; before?: number; after?: number }) {
  const accessibleValue = before === undefined || after === undefined
    ? `${label}: validation state not attached`
    : `${label}: ${before} before, ${after} after`;
  return <div className="mmv-state-metric" aria-label={accessibleValue}>
    <dt>{label}</dt>
    <dd>{before === undefined || after === undefined ? '—' : <><span>{before}</span><i>→</i><b>{after}</b></>}</dd>
  </div>;
}

const RACK_LEDGER_WINDOW_SIZE = 101;

function rackLedgerWindow(
  commands: MachineSceneV1['rackCommands'],
  selectedPassIndex: number,
) {
  if (commands.length <= RACK_LEDGER_WINDOW_SIZE) {
    return { start: 0, end: commands.length, commands };
  }
  // beforePassIndex is monotone in the projected source stream. Anchor the
  // window on the last command effective at this pass boundary; earlier and
  // later commands remain in the exact scene and source, but not in the DOM.
  let low = 0;
  let high = commands.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (commands[middle]!.beforePassIndex <= selectedPassIndex) low = middle + 1;
    else high = middle;
  }
  const anchor = Math.max(0, low - 1);
  const start = Math.max(0, Math.min(
    commands.length - RACK_LEDGER_WINDOW_SIZE,
    anchor - Math.floor(RACK_LEDGER_WINDOW_SIZE / 2),
  ));
  const end = start + RACK_LEDGER_WINDOW_SIZE;
  return { start, end, commands: commands.slice(start, end) };
}

export function MachineMovementView({
  scene,
  validation = null,
  displayDiagnostics,
  selectedPass,
  onSelect,
  overallContext,
  className = '',
  execution,
}: MachineMovementViewProps) {
  const pass = scene.passes.find((candidate) => candidate.passIndex === selectedPass) ?? null;
  const passState = validation?.passStates.find((state) => state.passIndex === selectedPass);
  const passDiagnostics = (displayDiagnostics ?? validation?.diagnostics)?.filter(
    (diagnostic) => diagnostic.passIndex === selectedPass,
  ) ?? [];
  const passErrors = passDiagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const passWarnings = passDiagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
  const passInfos = passDiagnostics.filter((diagnostic) => diagnostic.severity === 'info').length;
  const validationState = validation === null || pass === null
    ? 'detached'
    : passErrors > 0
      ? 'error'
      : passWarnings > 0
        ? 'warning'
        : 'clear';
  const rackLedger = pass === null
    ? { start: 0, end: 0, commands: [] as MachineSceneV1['rackCommands'] }
    : rackLedgerWindow(scene.rackCommands, pass.passIndex);

  const currentEvent = execution?.snapshot?.event;
  const visibleActions = execution?.index ? currentEvent?.kind === 'action'
    ? currentEvent.actionIndex + 1 : currentEvent?.kind === 'pass-end' ? undefined : 0 : undefined;
  return <section className={`machine-movement-view ${className}`.trim()} aria-label="Exact machine movement">
    <header className="mmv-header">
      <div className="mmv-title-block">
        <span className="mmv-eyebrow">Emitted KCode / exact trace</span>
        <h2>Machine movement</h2>
      </div>
      <div className={`mmv-validation-state is-${validationState}`} role="status" aria-live="polite">
        <i aria-hidden="true" />
        {validation === null
          ? 'KCode replay not attached'
          : pass === null
            ? 'Select a pass for KCode replay findings'
          : passErrors > 0
            ? `${passErrors} KCode replay error${passErrors === 1 ? '' : 's'} on this pass`
            : passWarnings > 0
              ? `${passWarnings} KCode replay warning${passWarnings === 1 ? '' : 's'} on this pass`
              : passInfos > 0
                ? `${passInfos} informational KCode replay note${passInfos === 1 ? '' : 's'} on this pass`
                : 'No KCode replay findings on this pass'}
      </div>
      <div className="mmv-contract">
        <span>{scene.profileId}@{scene.profileVersion}</span>
        <span title={`Parser label: ${scene.dialect}`}>canonical raster v1</span>
      </div>
    </header>

    {execution && <ExecutionControls execution={execution} findings={displayDiagnostics ?? validation?.diagnostics ?? []} />}

    {scene.passes.length > 0
      ? <PassTape passes={scene.passes} selectedPass={selectedPass} onSelect={onSelect} />
      : null}

    {pass === null || scene.displayDomain === null
      ? <div className="mmv-empty" role="status">
          <b>{scene.passes.length === 0 ? 'No programmed passes' : 'Select a pass to inspect'}</b>
          <span>The view renders only projected MachineScene data.</span>
        </div>
      : <div className="mmv-body">
          <aside className="mmv-command-bank" aria-label="Selected pass commands">
            <div className="mmv-pass-identity">
              <span>P{String(pass.passIndex + 1).padStart(4, '0')}</span>
              <b>{pass.direction === '>>' ? '→' : '←'}</b>
              <strong>{pass.operation}</strong>
              <em>C{pass.carrier}</em>
            </div>
            <dl className="mmv-command-grid">
              <div><dt>Rack</dt><dd>{formatCoordinate(pass.rack)}</dd></div>
              <div><dt>Speed</dt><dd>{pass.speed.raw}<small>numeric {pass.speed.value}</small></dd></div>
              <div><dt>Roller</dt><dd>{pass.roller.raw}<small>numeric {pass.roller.value}</small></dd></div>
            </dl>
            <dl className="mmv-stop-list">
              <div>
                <dt>Carriage stops</dt>
                <dd>{formatCoordinate(pass.movement.carriage.fromStopCoordinate)} <i>→</i> {formatCoordinate(pass.movement.carriage.toStopCoordinate)}</dd>
              </div>
              <div>
                <dt>Carrier guide</dt>
                <dd>{pass.movement.carrierGuide
                  ? <>{formatCoordinate(pass.movement.carrierGuide.fromStopCoordinate)} <i>→</i> {formatCoordinate(pass.movement.carrierGuide.toStopCoordinate)}</>
                  : '—'}</dd>
              </div>
            </dl>
            <section className="mmv-rack-ledger" aria-label="Ordered rack command stream">
              <header><span>Rack command stream</span><b>{scene.rackCommands.length}</b></header>
              {scene.rackCommands.length === 0
                ? <p>No explicit RACK commands.</p>
                : <>{scene.rackCommands.length > rackLedger.commands.length && <p className="mmv-rack-window">Showing commands #{rackLedger.start + 1}–#{rackLedger.end} of {scene.rackCommands.length.toLocaleString()}; the exact ordered stream remains retained.</p>}<ol>
                    {rackLedger.commands.map((command) => <li className={command.beforePassIndex === pass.passIndex ? 'is-selected-boundary' : ''} key={command.index}>
                      <span><i>#{command.index}</i><b>{rackBoundaryLabel(command.beforePassIndex, scene.passes.length)}</b></span>
                      <button type="button" disabled={!execution?.index} aria-label={`Inspect rack command ${command.index + 1}`} onClick={() => { const event = execution?.index?.events.find((event) => event.kind === 'rack' && event.rackCommandIndex === command.index); if (event) execution?.selectEvent(event.index); }}><code>{command.valueRaw}</code></button>
                      <small>{formatCoordinate(command.fromRack)}→{formatCoordinate(command.toRack)}</small>
                    </li>)}
                  </ol></>}
            </section>
          </aside>

          <div className="mmv-instrument">
            <div className="mmv-instrument-head">
              <span>Carriage + guide</span>
              <span>Front / rear beds</span>
              <span>{pass.actionGlyphs.length} action{pass.actionGlyphs.length === 1 ? '' : 's'}</span>
            </div>
            <MachinePlot
              pass={pass}
              domain={scene.displayDomain.kcodeCoordinate}
              passState={passState}
              visibleActions={visibleActions}
            />
            <dl className="mmv-loop-state">
              <StateMetric label="Loops" before={passState?.before.totalLoops} after={passState?.after.totalLoops} />
              <StateMetric label="Occupied" before={passState?.before.occupiedNeedles} after={passState?.after.occupiedNeedles} />
              <StateMetric label="Max stack" before={passState?.before.maxStack} after={passState?.after.maxStack} />
            </dl>
          </div>

          <aside className="mmv-action-ledger" aria-label="Exact pass actions">
            <div className="mmv-ledger-head">
              <span>Action ledger</span>
              <b>{pass.actionGlyphs.length}</b>
            </div>
            {pass.actionGlyphs.length === 0
              ? <p className="mmv-no-actions">No action glyphs in this pass.</p>
              : <ol>
                  {pass.actionGlyphs.map((action, index) => {
                    const label = actionLabel(action, passState);
                    return <li className={`${actionClass(action)}${currentEvent?.kind === 'action' && currentEvent.actionIndex === index ? ' is-current' : visibleActions !== undefined && index >= visibleActions ? ' is-future' : ''}`} key={index}>
                      <i aria-hidden="true">{index + 1}</i>
                      <button type="button" disabled={!execution?.index} aria-label={`Inspect action ${index + 1}`} onClick={() => execution?.selectAction(pass.passIndex, index)}><b>{label.title}</b><small>{label.detail}</small></button>
                    </li>;
                  })}
                </ol>}
          </aside>
        </div>}

    {execution?.snapshot && <ExecutionState snapshot={execution.snapshot} />}
    <footer className="mmv-footer">
      <p><strong>Coordinate contract</strong> KCode coordinates; physical needle labels unverified.</p>
      {overallContext && <p className={`mmv-overall-context is-${overallContext.status}`}><strong>Whole output</strong> {overallContext.label}</p>}
      {validation && <details className="mmv-assurance" open>
        <summary>Software validation limits · operational assurance not established</summary>
        <p>Carrier lifecycle is not encoded in KCode; loop replay assumes an empty-bed job start.</p>
        <ul aria-label="Operational limitations">
          {validation.operationalAssurance.limitations.map((limitation) => <li key={limitation.code}><b>{limitation.code}</b><span>{limitation.message}</span></li>)}
        </ul>
      </details>}
      {passDiagnostics.length > 0
        ? <ul aria-label="Selected pass validation findings">
            {passDiagnostics.map((diagnostic, index) => <li className={`is-${diagnostic.severity}`} key={`${diagnostic.rule}-${index}`}>
              <b>{diagnostic.rule}</b><span>{diagnostic.message}</span>
            </li>)}
          </ul>
        : null}
    </footer>
  </section>;
}
