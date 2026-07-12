/// <reference lib="webworker" />
import { browserKnitoutToKCode } from '@kniterate-studio/machine-lib/browser-converter';
import { inspectKcDocument, kcToKnitout, validateKnitoutProgram, type ValidationMessage } from '@kniterate-studio/machine-lib/browser';
import type { KCodeConversionRequest, KCodeConversionResponse } from './kcodeProtocol';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

scope.onmessage = async (event: MessageEvent<KCodeConversionRequest>) => {
  const request = event.data;
  if (request.kind !== 'convert-kcode') return;
  try {
    const converted = browserKnitoutToKCode(request.knitoutText, 'command.k');
    if (!converted.ok || !converted.kcode) throw new Error(converted.error ?? 'Vendored converter returned no k-code.');
    const passes = inspectKcDocument(converted.kcode);
    const reconstructed = kcToKnitout(converted.kcode);
    const report = validateKnitoutProgram(reconstructed.program);
    const messages: ValidationMessage[] = [
      ...(converted.warnings ?? []).map((message) => ({ severity: 'info' as const, rule: 'vendor-converter-note', message })),
      ...Object.entries(reconstructed.stats.unrecognizedTypes).map(([type, count]) => ({ severity: 'error' as const, rule: 'kc-reconstruction-unsupported-pass', message: `${count} generated pass${count === 1 ? '' : 'es'} use unsupported k-code type "${type}".` })),
      ...report.messages,
    ];
    const parityMismatches: string[] = [];
    if (passes.length !== request.predictedPasses.length) messages.push({ severity: 'info', rule: 'kc-preview-tail-delta', message: `Preview predicts ${request.predictedPasses.length} passes; the validated converter emitted ${passes.length}. Known-approximate frame/finish passes do not affect export.` });
    const shared = Math.min(passes.length, request.predictedPasses.length);
    for (let index = 0; index < shared; index += 1) {
      const actual = passes[index]!;
      const predicted = request.predictedPasses[index]!;
      if (!predicted.sourceRows?.length) continue;
      const carrier = predicted.carriers[0] ?? '0';
      if (actual.dir !== predicted.direction || actual.kind !== predicted.type || actual.carrier !== carrier) parityMismatches.push(`Pass ${index + 1}: predicted ${predicted.direction} ${predicted.type} ${carrier}; emitted ${actual.dir} ${actual.kind} ${actual.carrier}.`);
      if (parityMismatches.length >= 20) break;
    }
    const rowLines = request.rowProvenance.flatMap((row) => {
      const rowPasses = row.passIndices.map((index) => passes[index]).filter((pass) => pass !== undefined);
      if (rowPasses.length === 0) return [];
      return [{ rowId: row.rowId, lineStart: Math.min(...rowPasses.map((pass) => pass.lineStart)), lineEnd: Math.max(...rowPasses.map((pass) => pass.lineEnd)) }];
    });
    const artifact = {
      inputHash: request.inputHash,
      kcHash: await sha256(converted.kcode),
      kcText: converted.kcode,
      passCount: passes.length,
      messages,
      parityMismatches,
      passLines: passes.map((pass, passIndex) => ({ passIndex, lineStart: pass.lineStart, lineEnd: pass.lineEnd })),
      rowLines,
      ok: messages.every((message) => message.severity !== 'error') && parityMismatches.length === 0,
    };
    scope.postMessage({ kind: 'kcode-complete', requestId: request.requestId, artifact } satisfies KCodeConversionResponse);
  } catch (error) {
    scope.postMessage({ kind: 'kcode-failed', requestId: request.requestId, error: error instanceof Error ? error.message : String(error) } satisfies KCodeConversionResponse);
  }
};
