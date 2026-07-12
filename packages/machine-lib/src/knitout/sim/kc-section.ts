/**
 * Section extraction over .kc text. The vendor doesn't emit semantic
 * section markers, only `// row: N` / `// rows: A-B` comments. Sections
 * are defined by caller-supplied line patterns that anchor on those
 * comments (or other stable lines like `HOME` / pass footers).
 *
 * Used by the reference-.kc parity harness (`test/knitout/reference-kc/`)
 * to compare generated kc output against captured reference fixtures
 * section-by-section instead of whole-file.
 */

import { parseKcPasses, type ParsedKcPass } from './kc-parse.js';

export interface KcSectionAnchor {
  /** First line whose text matches this pattern (inclusive) starts the
   *  section. */
  readonly startPattern: RegExp;
  /** First line AFTER `startPattern` whose text matches this pattern
   *  (exclusive) ends the section. `'EOF'` means "to end of file". */
  readonly endPattern: RegExp | 'EOF';
}

export interface KcSection {
  /** 1-indexed line number where the section begins (inclusive). */
  readonly lineStart: number;
  /** 1-indexed line number where the section ends (exclusive). */
  readonly lineEndExclusive: number;
  /** Section body joined with `\n`. Does not include a trailing newline. */
  readonly text: string;
  /** Pass footers parsed from the section body. */
  readonly passes: readonly ParsedKcPass[];
}

export class KcSectionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KcSectionNotFoundError';
  }
}

export function extractKcSection(
  kcText: string,
  anchor: KcSectionAnchor,
): KcSection {
  const lines = kcText.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (anchor.startPattern.test(lines[i]!)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    throw new KcSectionNotFoundError(
      `startPattern ${anchor.startPattern} did not match any line`,
    );
  }
  let endIdx: number;
  if (anchor.endPattern === 'EOF') {
    endIdx = lines.length;
  } else {
    endIdx = -1;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (anchor.endPattern.test(lines[i]!)) {
        endIdx = i;
        break;
      }
    }
    if (endIdx === -1) {
      throw new KcSectionNotFoundError(
        `endPattern ${anchor.endPattern} did not match any line after line ${startIdx + 1}`,
      );
    }
  }
  const sliceLines = lines.slice(startIdx, endIdx);
  const text = sliceLines.join('\n');
  const passes = parseKcPasses(text);
  return {
    lineStart: startIdx + 1,
    lineEndExclusive: endIdx + 1,
    text,
    passes,
  };
}
