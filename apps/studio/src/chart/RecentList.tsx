import { useState } from 'react';
import { X } from 'lucide-react';
import type { RecentKind, RecentProject } from './recentProjects';

const KIND_WORDS: Record<RecentKind, string> = { sweater: 'Sweater', beanie: 'Beanie', panel: 'Scarf or blanket', chart: 'Colour chart' };

const when = (savedAt: string) => {
  const date = new Date(savedAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** The projects kept on this device, newest first. Removing one asks twice: it cannot be undone. */
export function RecentList({ recent, current = null, onOpen, onRemove }: {
  recent: readonly RecentProject[];
  /** The open project's slot: it is marked, not offered. */
  current?: string | null;
  onOpen: (slot: string) => void;
  onRemove: (slot: string) => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  return <ul className="recent-list" aria-label="Recent projects">{recent.map((item) => {
    const open = item.slot === current;
    return <li key={item.slot}>
      <button type="button" className="recent-open" disabled={open} onClick={() => onOpen(item.slot)}>
        <b>{item.title}</b>
        <small>{KIND_WORDS[item.kind]} · {open ? 'open now' : when(item.savedAt)}</small>
      </button>
      {!open && (removing === item.slot
        ? <span className="recent-confirm"><button type="button" className="danger-link" onClick={() => { setRemoving(null); onRemove(item.slot); }}>Remove for good</button><button type="button" className="link-button" onClick={() => setRemoving(null)}>Keep</button></span>
        : <button type="button" className="icon-button recent-remove" onClick={() => setRemoving(item.slot)} title="Remove from this device" aria-label={`Remove ${item.title}`}><X size={14} /></button>)}
    </li>;
  })}</ul>;
}
