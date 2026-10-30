import { Wrench } from 'lucide-react';
import type { ProjectEdit } from '@kniterate-studio/project-contract';
import { BIRDSEYE_FIXES, statusWords, storyNotes, type StoryItem } from '../handoff';
import { MEASUREMENT_RULES } from '../readiness';
import type { StatusNote } from './StatusPanel';

/**
 * One note per thing to check: what is wrong in a few words, buttons that fix
 * it or show it, and the next step in words only where no button takes it.
 * What it leads to waits in Why?. Gauge notes belong in the swatch section.
 */
export function statusNotes(items: readonly StoryItem[], { swatchStep, goTo, operate, birdseye }: {
  swatchStep: boolean;
  goTo?: (target: string) => void;
  operate?: (label: string, edits: ProjectEdit[]) => void;
  /** Switches the body to a birdseye back, where that can be knitted. */
  birdseye?: (() => void) | null;
}): StatusNote[] {
  return storyNotes(items.filter((item) => !(swatchStep && MEASUREMENT_RULES.has(item.rule)))).map((item) => {
    const words = statusWords(item);
    const show = goTo && item.target ? item.target : null;
    const fixes = operate ? item.fixes : [];
    const switchBacking = birdseye && BIRDSEYE_FIXES.has(item.rule) ? birdseye : null;
    const fixed = fixes.length > 0 || switchBacking !== null;
    return {
      severity: item.severity,
      text: words.text,
      // A fix button takes the next step; its words, with the other ways, stay in Why?.
      action: fixed ? null : words.action,
      why: [words.why, fixed ? words.action : null].filter(Boolean).join(' ') || null,
      actions: show || fixed ? <>
        {fixes.map((fix) => <button type="button" className="primary-button" key={fix.label} onClick={() => operate!(fix.label, fix.edits)}><Wrench size={13} aria-hidden="true" /> {fix.label}</button>)}
        {switchBacking && <button type="button" className="primary-button" onClick={switchBacking}><Wrench size={13} aria-hidden="true" /> Use a birdseye back</button>}
        {show && <button type="button" className="secondary-button" onClick={() => goTo!(show)}>Show</button>}
      </> : undefined,
    };
  });
}
