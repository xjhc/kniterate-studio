import { useEffect, type ReactNode } from 'react';
import { Printer, X } from 'lucide-react';
import { svgDataUrl } from './ChangesPanel';

/** Inline **bold**, *italic* and `code` from the instructions Studio writes; text only, never HTML. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    parts.push(token.startsWith('**') ? <strong key={match.index}>{token.slice(2, -2)}</strong> : token.startsWith('`') ? <code key={match.index}>{token.slice(1, -1)}</code> : <em key={match.index}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Renders the subset of Markdown the instructions use: headings, bullet and numbered lists, paragraphs. */
export function InstructionsView({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, index) => <li key={index}>{inline(item)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const line of markdown.split('\n')) {
    const bullet = /^- (.*)$/.exec(line); const numbered = /^\d+\. (.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = numbered !== null;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    flush();
    if (line.startsWith('# ')) blocks.push(<h1 key={blocks.length}>{inline(line.slice(2))}</h1>);
    else if (line.startsWith('## ')) blocks.push(<h2 key={blocks.length}>{inline(line.slice(3))}</h2>);
    else if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="instructions-view">{blocks}</div>;
}

export function GarmentSheet({ markdown, schematic, onClose }: { markdown: string; schematic: string | null; onClose: () => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return <div className="modal-backdrop"><article className="run-sheet garment-sheet" role="dialog" aria-modal="true" aria-label="Knitting instructions">
    <div className="run-sheet-actions"><button className="secondary-button" type="button" onClick={onClose}><X size={16} /> Close</button><button className="primary-button" type="button" onClick={() => window.print()}><Printer size={16} /> Print</button></div>
    {schematic && <img className="sheet-schematic" src={svgDataUrl(schematic)} alt="Dimensioned schematic" />}
    <InstructionsView markdown={markdown} />
    <footer>Generated locally · {new Date().toLocaleDateString()}</footer>
  </article></div>;
}
