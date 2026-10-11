/** The three views of every project, always in the same place: what you design, its measured drawing, and what the machine knits. */

export type WorkspaceView = 'design' | 'schematic' | 'file';

export const VIEW_LABELS: Record<WorkspaceView, string> = { design: 'Design', schematic: 'Schematic', file: 'Machine file' };

export function ViewSwitch({ view, onView }: { view: WorkspaceView; onView: (view: WorkspaceView) => void }) {
  return <div className="view-switch" role="tablist" aria-label="View">
    {(['design', 'schematic', 'file'] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} className={view === item ? 'active' : ''} onClick={() => onView(item)}>{VIEW_LABELS[item]}</button>)}
  </div>;
}
