export interface SourceWindowLine {
  readonly lineNumber: number;
  readonly text: string;
  readonly originalCodeUnits: number;
  readonly truncated: boolean;
}

export interface SourceWindow {
  readonly from: number;
  readonly to: number;
  readonly totalLines: number;
  readonly lines: readonly SourceWindowLine[];
  readonly truncatedLineCount: number;
}

export interface SourceLineIndex {
  readonly sourceCodeUnits: number;
  readonly totalLines: number;
  readonly stride: number;
  readonly checkpoints: readonly {
    readonly lineNumber: number;
    readonly offset: number;
  }[];
}

const DEFAULT_LINE_PREVIEW_CODE_UNITS = 2_048;
const DEFAULT_INDEX_STRIDE = 1_024;

function nextLineOffset(source: string, terminatorOffset: number): number {
  return source.charCodeAt(terminatorOffset) === 0x0d
    && source.charCodeAt(terminatorOffset + 1) === 0x0a
    ? terminatorOffset + 2
    : terminatorOffset + 1;
}

/** Build a sparse, bounded-memory line index once per retained source. */
export function indexSourceLines(
  source: string,
  stride = DEFAULT_INDEX_STRIDE,
): SourceLineIndex {
  const safeStride = Math.max(1, Math.trunc(stride));
  const checkpoints: Array<{ lineNumber: number; offset: number }> = [{ lineNumber: 1, offset: 0 }];
  let lineNumber = 1;
  let offset = 0;
  while (offset < source.length) {
    const code = source.charCodeAt(offset);
    if (code !== 0x0a && code !== 0x0d) {
      offset++;
      continue;
    }
    offset = nextLineOffset(source, offset);
    lineNumber++;
    if ((lineNumber - 1) % safeStride === 0) checkpoints.push({ lineNumber, offset });
  }
  return {
    sourceCodeUnits: source.length,
    totalLines: lineNumber,
    stride: safeStride,
    checkpoints,
  };
}

function checkpointAtOrBefore(index: SourceLineIndex, lineNumber: number) {
  let low = 0;
  let high = index.checkpoints.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (index.checkpoints[middle]!.lineNumber <= lineNumber) low = middle;
    else high = middle - 1;
  }
  return index.checkpoints[low]!;
}

/**
 * Scan an exact source string into one bounded display window without
 * materializing an array for every line. CRLF, CR, and LF each count as one
 * terminator. Individual DOM text nodes are capped independently.
 */
export function sourceWindow(
  source: string,
  focusLine: number,
  radius = 8,
  linePreviewCodeUnits = DEFAULT_LINE_PREVIEW_CODE_UNITS,
  suppliedIndex?: SourceLineIndex,
): SourceWindow {
  const index = suppliedIndex?.sourceCodeUnits === source.length
    ? suppliedIndex
    : indexSourceLines(source);
  const targetLine = Math.min(index.totalLines, Math.max(1, Math.trunc(focusLine)));
  const targetFrom = Math.max(1, targetLine - radius);
  const targetTo = Math.min(index.totalLines, targetLine + radius);
  const lines: SourceWindowLine[] = [];
  let truncatedLineCount = 0;
  const checkpoint = checkpointAtOrBefore(index, targetFrom);
  let lineNumber = checkpoint.lineNumber;
  let lineStart = checkpoint.offset;

  const visitLine = (lineEnd: number): void => {
    if (lineNumber < targetFrom || lineNumber > targetTo) return;
    const originalCodeUnits = lineEnd - lineStart;
    const truncated = originalCodeUnits > linePreviewCodeUnits;
    if (truncated) truncatedLineCount++;
    const previewEnd = truncated ? lineStart + linePreviewCodeUnits : lineEnd;
    const raw = source.slice(lineStart, previewEnd);
    lines.push({
      lineNumber,
      text: truncated
        ? `${raw}… [${originalCodeUnits.toLocaleString('en-US')} code units total]`
        : raw,
      originalCodeUnits,
      truncated,
    });
  };

  let offset = lineStart;
  while (offset < source.length && lineNumber <= targetTo) {
    const code = source.charCodeAt(offset);
    if (code !== 0x0a && code !== 0x0d) {
      offset++;
      continue;
    }
    visitLine(offset);
    offset = nextLineOffset(source, offset);
    lineNumber++;
    lineStart = offset;
  }
  if (lineNumber <= targetTo) visitLine(source.length);

  return {
    from: targetFrom,
    to: targetTo,
    totalLines: index.totalLines,
    lines,
    truncatedLineCount,
  };
}
