import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check } from 'lucide-react';

/** The app's actions, in one place: File, Edit and View. */

export type MenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** A setting that is on or off, or one choice of several. */
  checked?: boolean;
  shortcut?: string;
} | 'separator';

export interface Menu {
  label: string;
  items: MenuItem[];
}

export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const away = (event: PointerEvent) => { if (!bar.current?.contains(event.target as Node)) setOpen(null); };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);
  const keys = (event: ReactKeyboardEvent) => {
    if (open === null) return;
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const at = items.indexOf(window.document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); const index = open; setOpen(null); bar.current?.querySelectorAll<HTMLButtonElement>('.menu-title')[index]?.focus(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); items[(at + 1) % items.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); setOpen((open + 1) % menus.length); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); setOpen((open - 1 + menus.length) % menus.length); }
  };
  return <nav className="menu-bar" ref={bar} aria-label="Menu" onKeyDown={keys}>
    {menus.map((menu, index) => <div className="menu" key={menu.label}>
      <button type="button" className={`menu-title${open === index ? ' open' : ''}`} aria-haspopup="menu" aria-expanded={open === index}
        onClick={() => setOpen(open === index ? null : index)} onPointerEnter={() => { if (open !== null && open !== index) setOpen(index); }}>{menu.label}</button>
      {open === index && <div className="menu-list" role="menu" aria-label={menu.label} ref={list}>
        {menu.items.map((item, k) => item === 'separator'
          ? <hr key={`separator-${k}`} />
          : <button key={item.label} type="button" role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={item.checked} disabled={item.disabled}
              onClick={() => { setOpen(null); bar.current?.querySelectorAll<HTMLButtonElement>('.menu-title')[index]?.focus(); item.onSelect(); }}>
              <span className="menu-check" aria-hidden="true">{item.checked ? <Check size={14} /> : null}</span>
              <span>{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>)}
      </div>}
    </div>)}
  </nav>;
}
