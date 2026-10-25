import { useEffect, useRef, useState } from 'react';
import type { ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import type { AuthoredVerdict } from '../engine';
import type { Finding, Readiness } from '../readiness';
import type { PieceId } from './draft';
import { readKnitFile, type KnitFile } from './knitFile';
import type { SweaterPipelineResult } from './sweaterPipeline';

/** What the browser keeps of a pipeline run: verdicts, findings and each piece's exact program. */
export interface SweaterRunSummary {
  verdict: AuthoredVerdict;
  exportReady: boolean;
  readiness: Readiness;
  findings: Finding[];
  pieces: {
    id: PieceId;
    name: string;
    copies: number;
    verdict: AuthoredVerdict;
    passCount: number | null;
    kcHash: string | null;
    kcText: string | null;
    /** The .kc read back pass by pass: what the machine will knit, for the browser to show. */
    file: KnitFile | null;
    knitoutText: string | null;
    error: string | null;
  }[];
}

export type SweaterRunResponse =
  | { kind: 'sweater-complete'; requestId: number; summary: SweaterRunSummary }
  | { kind: 'sweater-failed'; requestId: number; error: string };

export function summarizeSweaterRun(result: SweaterPipelineResult): SweaterRunSummary {
  return {
    verdict: result.verdict,
    exportReady: result.exportReady,
    readiness: result.readiness,
    findings: result.findings,
    pieces: result.pieces.map((piece) => ({
      id: piece.id,
      name: piece.name,
      copies: piece.copies,
      verdict: piece.verdict,
      passCount: piece.kcode?.passCount ?? null,
      kcHash: piece.kcode?.ok ? piece.kcode.kcHash : null,
      kcText: piece.kcode?.ok ? piece.kcode.kcText : null,
      file: (() => {
        const raster = result.plan.pieces.find((item) => item.id === piece.id)?.raster ?? null;
        if (!piece.kcode?.ok || raster === null) return null;
        return readKnitFile(piece.kcode, { zoneOfRow: (row) => raster.rows[row]?.zone ?? 'body', carriers: result.plan.carriers, kind: piece.id === 'sleeve' ? 'sleeve' : piece.id === 'neckband' ? 'band' : piece.id === 'panel' ? 'panel' : 'body' });
      })(),
      knitoutText: piece.compiled?.knitoutText ?? null,
      error: piece.compileError ?? piece.outputError,
    })),
  };
}

export interface SweaterRunState {
  status: 'checking' | 'ready' | 'failed';
  summary: SweaterRunSummary | null;
  /** The summary belongs to the current project revision. */
  current: boolean;
  error: string | null;
}

/**
 * Runs the sweater pipeline in a Worker after edits settle; the previous result stays visible, marked stale, while checking.
 * A check still running when a newer one is sent is for an older revision: its Worker is replaced rather than waited for.
 */
export function useSweaterRun(project: ColorworkProjectV1 | null, debounceMs = 250): SweaterRunState {
  const workerRef = useRef<Worker | null>(null);
  const activeRequest = useRef(0);
  const busy = useRef(false);
  const [state, setState] = useState<SweaterRunState>({ status: 'checking', summary: null, current: false, error: null });
  const enabled = project !== null;
  const spawn = useRef(() => {
    const worker = new Worker(new URL('./sweater.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<SweaterRunResponse>) => {
      busy.current = false;
      const response = event.data;
      if (response.requestId !== activeRequest.current) return;
      if (response.kind === 'sweater-failed') setState((current) => ({ ...current, status: 'failed', current: false, error: response.error }));
      else setState({ status: 'ready', summary: response.summary, current: true, error: null });
    };
    worker.onerror = (event) => {
      busy.current = false;
      setState((current) => ({ ...current, status: 'failed', current: false, error: event.message || 'The sweater checker stopped.' }));
    };
    return worker;
  }).current;
  useEffect(() => {
    if (!enabled) return;
    workerRef.current = spawn();
    return () => { workerRef.current?.terminate(); workerRef.current = null; busy.current = false; };
  }, [enabled, spawn]);
  useEffect(() => {
    if (project === null) return;
    const requestId = activeRequest.current + 1;
    activeRequest.current = requestId;
    setState((current) => ({ ...current, status: 'checking', current: false, error: null }));
    const timeout = window.setTimeout(() => {
      if (workerRef.current === null) return;
      if (busy.current) {
        workerRef.current.terminate();
        workerRef.current = spawn();
      }
      busy.current = true;
      workerRef.current.postMessage({ requestId, project });
    }, debounceMs);
    return () => window.clearTimeout(timeout);
  }, [project, debounceMs, spawn]);
  return state;
}
