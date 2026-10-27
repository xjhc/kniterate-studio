import { useEffect, useMemo, useRef, useState } from 'react';
import { materializeColorworkProject, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { hasSwatch, swatchKey, swatchProject, type SwatchResponse } from './swatch';

export interface SwatchFile {
  /** Null when the project has no gauge to measure. */
  onDownload: (() => void) | null;
  writing: boolean;
  problem: string | null;
  /** The swatch for the settings as they are now has been downloaded. */
  downloaded: boolean;
}

/**
 * The swatch's machine file, written and checked in a Worker when asked for,
 * then downloaded. It is offered only when its verdict lets it be exported,
 * and only for the settings it was asked for.
 */
export function useSwatchFile(project: ColorworkProjectV1, enabled: boolean, download: (name: string, blob: Blob) => void): SwatchFile {
  const [state, setState] = useState<{ writing: boolean; problem: string | null; for: string; downloaded: string | null }>({ writing: false, problem: null, for: '', downloaded: null });
  const workerRef = useRef<Worker | null>(null);
  const request = useRef(0);
  // The project as it is now, for a result that arrives after it changed.
  const latest = useRef(project);
  latest.current = project;
  useEffect(() => () => workerRef.current?.terminate(), []);
  // A result belongs to the project it was asked for.
  const current = state.for === project.id;
  const available = useMemo(() => enabled && hasSwatch(materializeColorworkProject(project).state), [project, enabled]);
  // Worked out only once a swatch was downloaded: it stays downloaded until what it is made from changes.
  const key = useMemo(() => (available && state.downloaded !== null ? swatchKey(project) : null), [project, available, state.downloaded]);
  const onDownload = !available ? null : () => {
    const swatch = swatchProject(project);
    if (swatch === null) return;
    const requested = swatchKey(project);
    const requestId = request.current + 1;
    request.current = requestId;
    workerRef.current?.terminate();
    const worker = new Worker(new URL('./swatch.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setState((previous) => ({ ...previous, writing: true, problem: null, for: project.id }));
    const fileName = `${project.id}-swatch.kc`;
    const done = (problem: string | null, downloaded?: string | null) => setState((previous) => ({ writing: false, problem, for: project.id, downloaded: downloaded === undefined ? previous.downloaded : downloaded }));
    worker.onmessage = (event: MessageEvent<SwatchResponse>) => {
      const response = event.data;
      if (response.requestId !== request.current) return;
      worker.terminate();
      if (response.kind === 'swatch-failed') { done(response.error); return; }
      if (!response.exportReady || response.kcText === null) { done(`The swatch can't be knitted: ${response.problem ?? response.verdictLabel}`); return; }
      // Settings changed while it was written: it would knit the old ones under the same name.
      if (swatchKey(latest.current) !== requested) { done('The settings changed while the swatch was being written. Download it again.'); return; }
      download(fileName, new Blob([response.kcText], { type: 'text/plain' }));
      done(null, requested);
    };
    worker.onerror = (event) => done(event.message || 'The swatch could not be written.');
    worker.postMessage({ requestId, project: swatch });
  };
  return { onDownload, writing: current && state.writing, problem: current ? state.problem : null, downloaded: current && key !== null && state.downloaded === key };
}
