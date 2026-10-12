import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** The pieces every design panel is built from: a collapsible section, a number field and a row of choices. */

export function Section({ id, title, children, defaultOpen = true, aside }: { id?: string; title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section id={id} className={`design-section${open ? ' open' : ''}`}>
    <button type="button" className="design-section-head" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span>{title}</span>{aside}<ChevronDown size={15} />
    </button>
    {open && <div className="design-section-body">{children}</div>}
  </section>;
}

/** A number that commits on Enter or blur; invalid input is shown, never applied. */
export function NumberInput({ value, min, max, step = 0.5, onCommit, label, suffix }: { value: number; min: number; max: number; step?: number; onCommit: (value: number) => void; label: string; suffix?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const parsed = Number(text);
  const invalid = text.trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max;
  const commit = () => { if (!invalid && parsed !== value) onCommit(Math.round(parsed * 10) / 10); else if (invalid) setText(String(value)); };
  return <span className="number-input">
    <input type="number" inputMode="decimal" min={min} max={max} step={step} value={text} aria-label={label} aria-invalid={invalid}
      onChange={(event) => setText(event.currentTarget.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setText(String(value)); event.currentTarget.blur(); } }} />
    {suffix && <i>{suffix}</i>}
  </span>;
}

export function Chips<T extends string>({ value, options, onPick, label }: { value: T | null; options: readonly { id: T; name: string; note?: string }[]; onPick: (id: T) => void; label: string }) {
  return <div className="chips" role="radiogroup" aria-label={label}>
    {options.map((option) => <button key={option.id} type="button" role="radio" aria-checked={value === option.id} className={value === option.id ? 'active' : ''} title={option.note} onClick={() => onPick(option.id)}>{option.name}</button>)}
  </div>;
}

/** Opens a left-panel section if it is folded, scrolls to it and puts the cursor in its first field. */
export function revealSection(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  if (section.classList.contains('design-section') && !section.classList.contains('open')) section.querySelector<HTMLButtonElement>('.design-section-head')?.click();
  requestAnimationFrame(() => {
    section.scrollIntoView({ block: 'center', behavior: 'smooth' });
    section.querySelector<HTMLElement>('input, select')?.focus({ preventScroll: true });
  });
}
