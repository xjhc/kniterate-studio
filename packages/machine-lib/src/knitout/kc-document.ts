import { parseKc, type KcPass } from './sophie/loop-stack-sim.js';

export interface KcDocumentPass extends KcPass {
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly section: string;
}

const SECTION_HINT = /\b(waste|draw|cast[- ]?on|body|pattern|bind[- ]?off|finish)\b/i;

/** Parse `.kc` passes and attach exact source spans and best-effort authored section labels. */
export function inspectKcDocument(text: string): readonly KcDocumentPass[] {
  const parsed = parseKc(text);
  const lines = text.split(/\r?\n/);
  const footerLines: number[] = [];
  const sections: string[] = [];
  let section = 'Imported program';
  for (const [index, raw] of lines.entries()) {
    const hint = raw.match(SECTION_HINT)?.[1];
    if (hint) section = hint.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (/^(>>|<<)\s+\S+\s+\S+/.test(raw.trim())) {
      footerLines.push(index + 1);
      sections.push(section);
    }
  }
  return parsed.map((pass, index) => ({
    ...pass,
    lineStart: index === 0 ? 1 : footerLines[index - 1]! + 1,
    lineEnd: footerLines[index]!,
    section: sections[index] ?? 'Imported program',
  }));
}
