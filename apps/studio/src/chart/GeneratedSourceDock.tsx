import { ChevronDown, ChevronUp, Code2 } from 'lucide-react';
import { useMemo } from 'react';
import type { BlanketCompileArtifact } from '../blanket/compileProject';
import type { KCodeArtifact } from '../kcode/kcodeProtocol';
import { indexSourceLines, sourceWindow } from '../sourceWindow';

export type SourceFormat = 'knitout' | 'kcode';

export function GeneratedSourceDock({ artifact, kcode, selectedPass, format, collapsed, onFormat, onCollapsed }: {
  artifact: BlanketCompileArtifact | null;
  kcode: KCodeArtifact | null;
  selectedPass: number | null;
  format: SourceFormat;
  collapsed: boolean;
  onFormat: (format: SourceFormat) => void;
  onCollapsed: (collapsed: boolean) => void;
}) {
  const text = format === 'knitout' ? artifact?.knitoutText ?? '' : kcode?.kcText ?? '';
  const span = format === 'kcode' && selectedPass !== null ? kcode?.passLines[selectedPass] : null;
  const sourceIndex = useMemo(() => indexSourceLines(text), [text]);
  const focusLine = span ? Math.floor((span.lineStart + span.lineEnd) / 2) : 30;
  const radius = span ? Math.ceil((span.lineEnd - span.lineStart) / 2) + 7 : 30;
  const visible = useMemo(
    () => sourceWindow(text, focusLine, radius, 2_048, sourceIndex),
    [focusLine, radius, sourceIndex, text],
  );
  const meta = format === 'kcode'
    ? kcode ? `${kcode.passCount.toLocaleString()} passes / ${kcode.kcHash.slice(0, 12)}` : 'converting validated K-code'
    : artifact?.knitoutText ? `${artifact.stats.opCount.toLocaleString()} operations / compiler source` : 'waiting for compile';

  return <footer className={`generated-source${collapsed ? ' collapsed' : ''}`}>
    <div className="generated-source-bar">
      <span className="eyebrow"><Code2 size={13} /> Generated source</span>
      <div className="source-tabs" role="tablist" aria-label="Generated source format">
        {(['knitout', 'kcode'] as SourceFormat[]).map((item) => <button type="button" role="tab" id={`source-${item}-tab`} aria-controls="generated-source-content" aria-selected={format === item} className={format === item ? 'active' : ''} key={item} onClick={() => { onFormat(item); onCollapsed(false); }}>{item === 'knitout' ? 'Knitout .k' : 'K-code .kc'}</button>)}
      </div>
      <span className="generated-source-meta">{meta}</span>
      <button className="source-toggle" type="button" onClick={() => onCollapsed(!collapsed)} aria-label={collapsed ? 'Show generated source' : 'Hide generated source'} aria-expanded={!collapsed} aria-controls="generated-source-content" title={collapsed ? 'Show generated source' : 'Hide generated source'}>{collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}<span>{collapsed ? 'Show' : 'Hide'}</span></button>
    </div>
    <pre id="generated-source-content" className="generated-source-content" role="tabpanel" aria-labelledby={`source-${format}-tab`} tabIndex={0}>{text ? visible.lines.map((line) => {
      const lineNumber = line.lineNumber;
      const highlighted = Boolean(span && lineNumber >= span.lineStart && lineNumber <= span.lineEnd);
      return <span className={`generated-source-line${highlighted ? ' highlighted' : ''}`} key={lineNumber}><i>{lineNumber}</i><code>{line.text || ' '}</code></span>;
    }) : <span className="source-waiting">{format === 'kcode' ? 'Waiting for validated conversion...' : 'Waiting for compiler output...'}</span>}</pre>
  </footer>;
}
