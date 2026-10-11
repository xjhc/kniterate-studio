import { useEffect, useMemo, useRef, useState } from 'react';
import { materializeColorworkProject, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { hasSwatch, swatchProject, type SwatchResponse } from './swatch';

export interface SwatchFile {
  /** Null when the project has no gauge to measure. */
  onDownload: (() => void) | null;
  writing: boolean;
  problem: string | null;
}

/**
 * The swatch's machine file, written and checked in a Worker when asked for,
 * then downloaded. It is offered only when its verdict lets it be exported.
 */
export function useSwatchFile(project: ColorworkProjectV1, enabled: boolean, download: (name: string, blob: Blob) => void): SwatchFile {
  const [state, setState] = useState<{ writing: boolean; problem: string | null; for: string }>({ writing: false, problem: null, for: '' });
  const workerRef = useRef<Worker | null>(null);
  const request = useRef(0);
  useEffect(() => () => workerRef.current?.terminate(), []);
  // A result belongs to the project it was asked for.
  const current = state.for === project.id;
  const available = useMemo(() => enabled && hasSwatch(materializeColorworkProject(project).state), [project, enabled]);
  const onDownload = !available ? null : () => {
    const swatch = swatchProject(project);
    if (swatch === null) return;
    const requestId = request.current + 1;
    request.current = requestId;
    workerRef.current?.terminate();
    const worker = new Worker(new URL('./swatch.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setState({ writing: true, problem: null, for: project.id });
    const fileName = `${project.id}-swatch.kc`;
    worker.onmessage = (event: MessageEvent<SwatchResponse>) => {
      const response = event.data;
      if (response.requestId !== request.current) return;
      worker.terminate();
      if (response.kind === 'swatch-failed') { setState({ writing: false, problem: response.error, for: project.id }); return; }
      if (!response.exportReady || response.kcText === null) { setState({ writing: false, problem: `The swatch can't be knitted: ${response.problem ?? response.verdictLabel}`, for: project.id }); return; }
      download(fileName, new Blob([response.kcText], { type: 'text/plain' }));
      setState({ writing: false, problem: null, for: project.id });
    };
    worker.onerror = (event) => setState({ writing: false, problem: event.message || 'The swatch could not be written.', for: project.id });
    worker.postMessage({ requestId, project: swatch });
  };
  return { onDownload, writing: current && state.writing, problem: current ? state.problem : null };
}
