import { Wrench } from 'lucide-react';
import type { ProjectEdit } from '@kniterate-studio/project-contract';
import { noteWords, storyNotes, type StoryItem } from '../handoff';
import { MEASUREMENT_RULES } from '../readiness';
import type { StatusNote } from './StatusPanel';

/**
 * The notes under Design for every kind of project: one per thing to check,
 * in the readiness story's words, what it leads to on hover, and buttons to
 * show the problem or apply its fix where the workspace offers them. While a
 * swatch step stands, the gauge is its, not a note.
 */
export function statusNotes(items: readonly StoryItem[], { swatchStep, goTo, operate }: {
  swatchStep: boolean;
  goTo?: (target: string) => void;
  operate?: (label: string, edits: ProjectEdit[]) => void;
}): StatusNote[] {
  return storyNotes(items.filter((item) => !(swatchStep && MEASUREMENT_RULES.has(item.rule)))).map((item) => {
    const words = noteWords(item);
    const show = goTo && item.target ? item.target : null;
    const fixes = operate ? item.fixes : [];
    return {
      severity: item.severity,
      text: words.text,
      why: words.why,
      actions: show || fixes.length > 0 ? <>
        {show && <button type="button" className="secondary-button" onClick={() => goTo!(show)}>Show</button>}
        {fixes.map((fix) => <button type="button" className="primary-button" key={fix.label} onClick={() => operate!(fix.label, fix.edits)}><Wrench size={13} /> {fix.label}</button>)}
      </> : undefined,
    };
  });
}
