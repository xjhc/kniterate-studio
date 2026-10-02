import { AlertTriangle, CheckCircle2, CircleAlert, Ruler, Wrench } from 'lucide-react';
import type { ProjectEdit } from '@kniterate-studio/project-contract';
import type { ReadinessStory } from '../handoff';

/**
 * The readiness story the CLI, the printed sheet and the package also tell:
 * a headline, what it rests on, and each unresolved item with its part of the
 * piece, its consequence, the next step, a way to get there and any fix.
 */
export function ReadinessCard({ story, pending, onTarget, onFix }: {
  story: ReadinessStory | null;
  pending: boolean;
  onTarget: (target: string) => void;
  onFix: (label: string, edits: ProjectEdit[]) => void;
}) {
  if (story === null) return <section className="readiness-card pending" role="status"><strong>{pending ? 'Checking…' : 'Not checked yet'}</strong></section>;
  const Icon = story.status === 'ready' ? CheckCircle2 : story.status === 'needs-measurements' ? Ruler : story.status === 'blocked' ? CircleAlert : AlertTriangle;
  return <section className={`readiness-card readiness-${story.status}`} aria-label="Readiness" aria-live="polite">
    <header><Icon size={16} /><div><strong data-testid="readiness-headline">{story.headline}</strong><p>{story.detail}</p></div></header>
    <p className="readiness-evidence" data-testid="readiness-evidence">{story.evidence}</p>
    {story.items.length > 0 && <ul className="readiness-items">{story.items.map((item, index) => <li key={`${item.rule}-${index}`} className={`severity-${item.severity}`}>
      <div className="readiness-item-head"><b>{item.part}</b><small>{item.owner === 'operator' ? 'at the machine' : item.owner === 'compiler' ? 'engine' : 'design'}</small></div>
      <p>{item.consequence}</p>
      <p className="readiness-action">{item.action}</p>
      <details><summary>Details</summary><p>{item.message}</p></details>
      <div className="readiness-buttons">
        {item.target && <button type="button" className="secondary-button" onClick={() => onTarget(item.target!)}>Show</button>}
        {item.fixes.map((fix) => <button type="button" className="primary-button" key={fix.label} onClick={() => onFix(fix.label, fix.edits)}><Wrench size={13} /> {fix.label}</button>)}
      </div>
    </li>)}</ul>}
    {story.operatorChecks.length > 0 && <details className="readiness-checks"><summary>{story.operatorChecks.length} check{story.operatorChecks.length === 1 ? '' : 's'} at the machine</summary><ul>{story.operatorChecks.map((check) => <li key={check}>{check}</li>)}</ul></details>}
  </section>;
}
