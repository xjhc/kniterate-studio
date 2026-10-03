import { useMemo, useState } from 'react';
import { Bot, History, Undo2, User, X } from 'lucide-react';
import { materializeColorworkProject, undoProjectEdit, type ColorworkProjectV1, type ProjectEditEntry } from '@kniterate-studio/project-contract';
import { schematicSvg } from '../handoff';
import { planProject, type ProjectPlan } from '../plan';

/**
 * Operations in the project's history, newest first, each reviewable: what it
 * changed in measurements, placements and plan findings, with before/after
 * schematics, and one step to undo it (and everything after it).
 */

export interface Operation {
  start: number;
  end: number;
  source: ProjectEditEntry['source'];
  label: string;
  undone: boolean;
}

const EDIT_LABELS: Record<string, string> = {
  'paint-cells': 'Paint stitches', 'insert-row': 'Insert a row', 'delete-row': 'Delete a row', 'set-width': 'Change width', 'set-height': 'Change height',
  'set-needle-offset': 'Move on the bed', 'set-strategy': 'Change backing', 'set-frame': 'Change frame', 'set-yarn-assignment': 'Change a yarn',
  'remove-yarn-assignment': 'Remove a yarn', 'set-palette-entry': 'Change a color', 'add-override': 'Add an override', 'remove-override': 'Remove an override',
  'set-gauge': 'Change gauge', 'set-target': 'Change target size', 'set-object': 'Change the garment', 'set-placement': 'Change a motif',
  'remove-placement': 'Remove a motif', 'record-trial': 'Record a trial',
};

/**
 * Where an opened project continues this one: the index of its first new
 * entry, or null when it does not. Only the active history (up to the cursor)
 * counts, since an undone branch may have been replaced by the new edits.
 */
export function continuationFrom(current: ColorworkProjectV1, opened: ColorworkProjectV1): number | null {
  const active = current.history.entries.slice(0, current.history.cursor);
  const continues = opened.id === current.id && opened.history.cursor > active.length
    && active.every((entry, index) => opened.history.entries[index]?.id === entry.id);
  return continues ? active.length : null;
}

export function operationsOf(project: ColorworkProjectV1): Operation[] {
  const entries = project.history.entries;
  const operations: Operation[] = [];
  for (let index = 0; index < entries.length;) {
    const entry = entries[index]!;
    let end = index + 1;
    if (entry.group !== undefined) while (end < entries.length && entries[end]!.group === entry.group) end += 1;
    const kinds = [...new Set(entries.slice(index, end).map((item) => EDIT_LABELS[item.edit.kind] ?? item.edit.kind))];
    operations.push({ start: index, end, source: entry.source, label: entry.label ?? kinds.join(', '), undone: index >= project.history.cursor });
    index = end;
  }
  return operations.reverse();
}

/** SVG shown as an image: it cannot run script, whatever an opened project contains. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function atCursor(project: ColorworkProjectV1, cursor: number): ColorworkProjectV1 {
  return { ...project, history: { ...project.history, cursor, checkpoints: project.history.checkpoints.filter((item) => item.cursor <= cursor) } };
}

function planAt(project: ColorworkProjectV1): ProjectPlan {
  const { state, placements } = materializeColorworkProject(project);
  return planProject(state, placements);
}

interface Change { what: string; before: string; after: string }

export function describeOperation(project: ColorworkProjectV1, operation: Operation): { changes: Change[]; added: string[]; resolved: string[]; before: string | null; after: string | null } {
  const beforeProject = atCursor(project, operation.start);
  const afterProject = atCursor(project, operation.end);
  const before = planAt(beforeProject); const after = planAt(afterProject);
  const changes: Change[] = [];
  const push = (what: string, a: string | number | undefined | null, b: string | number | undefined | null) => { if (String(a ?? '—') !== String(b ?? '—')) changes.push({ what, before: String(a ?? '—'), after: String(b ?? '—') }); };
  push('Needles', before.stitches.value, after.stitches.value);
  push('Rows', before.rows.value, after.rows.value);
  push('Finished circumference', before.predicted?.widthCm.value && `${before.predicted.widthCm.value} cm`, after.predicted?.widthCm.value && `${after.predicted.widthCm.value} cm`);
  push('Cuff', before.sections?.cuff?.visibleCm && `${before.sections.cuff.visibleCm.value} cm`, after.sections?.cuff?.visibleCm && `${after.sections.cuff.visibleCm.value} cm`);
  push('Body', before.sections?.body.cm && `${before.sections.body.cm.value} cm`, after.sections?.body.cm && `${after.sections.body.cm.value} cm`);
  push('Finished height', before.sections?.finishedHeightCm && `${before.sections.finishedHeightCm.value} cm`, after.sections?.finishedHeightCm && `${after.sections.finishedHeightCm.value} cm`);
  push('Gauge', before.gauge && `${before.gauge.stitchesPer10cm}/${before.gauge.rowsPer10cm} (${before.gauge.source})`, after.gauge && `${after.gauge.stitchesPer10cm}/${after.gauge.rowsPer10cm} (${after.gauge.source})`);
  push('Backing', before.backing.technique, after.backing.technique);
  const motifs = (p: ColorworkProjectV1) => materializeColorworkProject(p).placements.map((item) => `${item.placement.id} ${item.placement.motif.width}×${item.placement.motif.height}${item.status === 'conflict' ? ' (does not fit)' : ''}`).join(', ');
  push('Motifs', motifs(beforeProject) || 'none', motifs(afterProject) || 'none');
  const rules = (plan: ProjectPlan) => new Set(plan.findings.map((finding) => finding.rule));
  const beforeRules = rules(before); const afterRules = rules(after);
  return {
    changes,
    added: [...afterRules].filter((rule) => !beforeRules.has(rule)),
    resolved: [...beforeRules].filter((rule) => !afterRules.has(rule)),
    before: schematicSvg(beforeProject, before),
    after: schematicSvg(afterProject, after),
  };
}

export function ChangesPanel({ project, highlightFrom, onProject, onClose }: {
  project: ColorworkProjectV1;
  /** Operations starting at or after this history index are new (e.g. arrived from a file an assistant changed). */
  highlightFrom: number | null;
  onProject: (project: ColorworkProjectV1) => void;
  onClose: () => void;
}) {
  const operations = useMemo(() => operationsOf(project), [project]);
  const [open, setOpen] = useState<number | null>(() => operations.find((item) => highlightFrom !== null && item.start >= highlightFrom && !item.undone)?.start ?? null);
  const opened = operations.find((item) => item.start === open) ?? null;
  const detail = useMemo(() => (opened ? describeOperation(project, opened) : null), [project, opened]);
  const undoTo = (cursor: number) => { let next = project; while (next.history.cursor > cursor) next = undoProjectEdit(next); onProject(next); };
  return <aside className="changes-panel" aria-label="Changes">
    <header><span><History size={15} /> Changes</span><button className="icon-button" type="button" onClick={onClose} aria-label="Close changes"><X size={15} /></button></header>
    <ol className="change-list">{operations.map((operation) => {
      const fresh = highlightFrom !== null && operation.start >= highlightFrom;
      return <li key={operation.start} className={`${operation.undone ? 'undone' : ''}${fresh ? ' fresh' : ''}${open === operation.start ? ' open' : ''}`}>
        <button type="button" onClick={() => setOpen(open === operation.start ? null : operation.start)}>
          {operation.source === 'assistant' ? <Bot size={13} aria-label="Assistant" /> : operation.source === 'human' ? <User size={13} aria-label="You" /> : <History size={13} aria-label="System" />}
          <span>{operation.label}</span>{operation.undone && <small>undone</small>}{fresh && !operation.undone && <small>new</small>}
        </button>
        {open === operation.start && detail && <div className="change-detail">
          {detail.changes.length === 0 ? <p className="garment-help">No change to size, gauge, backing or motifs (stitches or yarns only).</p>
            : <table><thead><tr><th>Measure</th><th>Before</th><th>After</th></tr></thead><tbody>{detail.changes.map((change) => <tr key={change.what}><td>{change.what}</td><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table>}
          {(detail.added.length > 0 || detail.resolved.length > 0) && <p className="change-findings">{detail.added.length > 0 && <span>New findings: {detail.added.join(', ')}. </span>}{detail.resolved.length > 0 && <span>Resolved: {detail.resolved.join(', ')}.</span>}</p>}
          {detail.before && detail.after && <div className="change-previews"><figure><figcaption>Before</figcaption><img src={svgDataUrl(detail.before)} alt="Schematic before the change" /></figure><figure><figcaption>After</figcaption><img src={svgDataUrl(detail.after)} alt="Schematic after the change" /></figure></div>}
          {!operation.undone && <button type="button" className="secondary-button" onClick={() => undoTo(operation.start)}><Undo2 size={13} /> Undo this{operation.start < project.history.cursor - (operation.end - operation.start) ? ' and everything after it' : ''}</button>}
        </div>}
      </li>;
    })}</ol>
  </aside>;
}
