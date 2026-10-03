import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, ImagePlus, Layers, RefreshCw, Trash2, X } from 'lucide-react';
import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';
import type { ProjectEdit, ProjectPlacement, ProjectState, ResolvedProjectPlacement } from '@kniterate-studio/project-contract';
import { convertPlacementImage, defaultPlacementColors, nextPlacementId, placementToStitchesEdits, refreshedPlacement, type PlacementConversion, type PlacementImage } from '../placements';

/**
 * Motifs as objects: each placement is listed, selectable, and edited through
 * its saved intent (size from its stored image, position, colors), never by
 * painting over its stitches. Converting to stitches is a deliberate,
 * undoable operation.
 */

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export async function sha256Hex(bytes: string | Uint8Array): Promise<string> {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Decodes image bytes to RGBA without color-space conversion, so the CLI's PNG decoder sees the same pixels. */
export async function decodeImage(blob: Blob): Promise<PlacementImage['pixels']> {
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  bitmap.close();
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(data.buffer.slice(0)) };
}

/** A PNG's own bytes are kept (its hash names the supplied file); other formats are re-encoded to PNG. */
async function placementImageFromFile(file: File): Promise<PlacementImage> {
  let blob: Blob = file;
  if (file.type !== 'image/png') {
    const pixels = await decodeImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = pixels.width; canvas.height = pixels.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
    blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not encode the image as PNG.'))), 'image/png'));
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { pixels: await decodeImage(blob), bytesBase64: base64(bytes), sha256: await sha256Hex(bytes) };
}

export async function placementPixels(placement: ProjectPlacement): Promise<PlacementImage['pixels']> {
  const bytes = Uint8Array.from(atob(placement.source!.bytesBase64), (char) => char.charCodeAt(0));
  return decodeImage(new Blob([bytes], { type: 'image/png' }));
}

function MotifPreview({ motif, colors, palette, rowsPer10cm, stitchesPer10cm }: { motif: ColorworkChartV1; colors: Record<string, string>; palette: ProjectState['chart']['palette']; rowsPer10cm: number; stitchesPer10cm: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    // Knitted proportions: a stitch is wider than it is tall.
    const unit = Math.max(2, Math.floor(220 / Math.max(motif.width, motif.height)));
    const cellW = unit; const cellH = unit * (stitchesPer10cm / rowsPer10cm);
    element.width = Math.ceil(motif.width * cellW); element.height = Math.ceil(motif.height * cellH);
    const context = element.getContext('2d')!;
    context.fillStyle = '#e7e5df'; context.fillRect(0, 0, element.width, element.height);
    motif.cells.forEach((row, top) => row.forEach((color, column) => {
      const id = colors[String(color)];
      if (id === undefined) return;
      context.fillStyle = palette.find((entry) => entry.id === id)?.hex ?? '#000';
      context.fillRect(column * cellW, top * cellH, cellW + 0.5, cellH + 0.5);
    }));
  }, [motif, colors, palette, rowsPer10cm, stitchesPer10cm]);
  return <canvas ref={canvas} className="motif-preview" aria-label={`Converted motif, ${motif.width} by ${motif.height} stitches`} />;
}

export function ImageIntakeDialog({ state, replacing, onPlace, onClose }: {
  state: ProjectState;
  /** When set, the image replaces this placement's image; its anchor and id stay. */
  replacing: ProjectPlacement | null;
  onPlace: (placement: ProjectPlacement, label: string) => void;
  onClose: () => void;
}) {
  const [image, setImage] = useState<PlacementImage | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversion, setConversion] = useState<PlacementConversion>({ heightCm: replacing?.source?.heightCm ?? 8, colors: replacing?.source?.colors ?? 2, pooling: replacing?.source?.pooling ?? 'mean' });
  const [rowsAboveCuff, setRowsAboveCuff] = useState(replacing?.rowsAboveCuff ?? 3);
  const gauge = state.gauge;
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  const converted = useMemo(() => {
    if (!image || !gauge) return null;
    try { return convertPlacementImage(image, conversion, gauge); } catch (problem) { setError(problem instanceof Error ? problem.message : String(problem)); return null; }
  }, [image, conversion, gauge]);
  const colors = converted ? replacing?.colors ?? defaultPlacementColors(state, converted.motif) : {};
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!converted) return;
    const placement: ProjectPlacement = replacing
      ? { ...replacing, motif: converted.motif, source: converted.source }
      : { id: nextPlacementId(state), motif: converted.motif, x: 'center', rowsAboveCuff, colors, source: converted.source };
    onPlace(placement, replacing ? `Replace the image of ${replacing.id}` : `Place ${placement.id}`);
  };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const next = await placementImageFromFile(file);
      setImage(next); setObjectUrl(URL.createObjectURL(file));
    } catch (problem) { setError(problem instanceof Error ? problem.message : String(problem)); }
  };
  return <div className="modal-backdrop project-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="project-dialog image-intake" role="dialog" aria-modal="true" aria-labelledby="image-intake-title">
      <header><h2 id="image-intake-title">{replacing ? `Replace the image of ${replacing.id}` : 'Place an image'}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
      <form onSubmit={submit}>
        {!gauge && <p className="setup-error" role="alert">Record the body gauge first: the image is converted to stitches at it.</p>}
        <label>Image (PNG or JPEG)<input type="file" accept="image/png,image/jpeg" aria-label="Image file" onChange={(event) => void pick(event.currentTarget.files?.[0])} /></label>
        <div className="project-dialog-grid">
          <label>Visible height (cm)<input type="number" min="0.5" max="60" step="0.5" value={conversion.heightCm} onChange={(event) => setConversion({ ...conversion, heightCm: Number(event.currentTarget.value) || conversion.heightCm })} /></label>
          <label>Colors<select value={conversion.colors} onChange={(event) => setConversion({ ...conversion, colors: Number(event.currentTarget.value) })}>{[2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          <label>Sampling<select value={conversion.pooling} onChange={(event) => setConversion({ ...conversion, pooling: event.currentTarget.value as 'mean' | 'mode' })}><option value="mean">Smooth (thin lines)</option><option value="mode">Majority (bold shapes)</option></select></label>
          {!replacing && <label>Rows above the {state.object?.construction === 'rib-cuff-jersey-body' ? 'cuff' : 'cast-on'}<input type="number" min="0" max="200" value={rowsAboveCuff} onChange={(event) => setRowsAboveCuff(Math.max(0, Math.round(Number(event.currentTarget.value))))} /></label>}
        </div>
        {image && <div className="image-compare">
          <figure><figcaption>Original</figcaption>{objectUrl && <img src={objectUrl} alt="The supplied image" />}</figure>
          <figure><figcaption>{converted ? `${converted.motif.width} × ${converted.motif.height} stitches · background left out` : 'Converting…'}</figcaption>{converted && gauge && <MotifPreview motif={converted.motif} colors={colors} palette={state.chart.palette} rowsPer10cm={gauge.rowsPer10cm} stitchesPer10cm={gauge.stitchesPer10cm} />}</figure>
        </div>}
        <p className="garment-help">The image is cropped to its artwork: the height is the visible motif's, measured to its lowest stitch. The background color is left as the ground.</p>
        {error && <p className="setup-error" role="alert">{error}</p>}
        <footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={!converted}><Check size={16} /> {replacing ? 'Replace' : 'Place'}</button></footer>
      </form>
    </section>
  </div>;
}

export function MotifSection({ state, placements, selected, staleIds, onSelect, onOperation, onAddImage, onReplaceImage }: {
  state: ProjectState;
  placements: readonly ResolvedProjectPlacement[];
  selected: string | null;
  staleIds: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  onOperation: (label: string, edits: ProjectEdit[]) => void;
  onAddImage: () => void;
  onReplaceImage: (placement: ProjectPlacement) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const current = placements.find((item) => item.placement.id === selected) ?? null;
  const update = (placement: ProjectPlacement, label: string) => onOperation(label, [{ kind: 'set-placement', placement }]);
  const reconvert = async (placement: ProjectPlacement, conversion: Partial<PlacementConversion>, label: string) => {
    if (!placement.source || !state.gauge) return;
    setBusy(placement.id); setProblem(null);
    try { update(refreshedPlacement(placement, await placementPixels(placement), state.gauge, conversion), label); }
    catch (error) { setProblem(`Could not re-convert ${placement.id}: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(null); }
  };
  const motifColors = current ? [...new Set(current.placement.motif.cells.flat())].sort((a, b) => a - b) : [];
  return <section className="garment-section motif-section" id="placements" tabIndex={-1}><h2><Layers size={12} /> Motifs</h2>
    <div className="motif-list">{placements.length === 0 ? <p className="garment-help">No motifs yet.</p> : placements.map((item) => <button type="button" key={item.placement.id} className={`motif-row${item.placement.id === selected ? ' active' : ''}${item.status === 'conflict' ? ' conflict' : ''}`} id={`placement:${item.placement.id}`} onClick={() => onSelect(item.placement.id)}>
      <b>{item.placement.id}</b><small>{item.status === 'conflict' ? item.problem === 'color' ? 'Color has no yarn' : 'Does not fit' : `${item.placement.motif.width} × ${item.placement.motif.height} st${staleIds.has(item.placement.id) ? ' · needs refresh' : ''}`}</small>
    </button>)}</div>
    <button type="button" className="secondary-button motif-add" onClick={onAddImage}><ImagePlus size={14} /> Add image</button>
    {current && <div className="motif-inspector" aria-label={`Motif ${current.placement.id}`}>
      {current.status === 'conflict' && <p className="setup-error" role="alert">{current.reason} It is left out until it fits.</p>}
      {problem && <p className="setup-error" role="alert">{problem}</p>}
      {current.placement.source && <label className="strategy-field"><span>Visible height</span><span className="garment-input"><input type="number" min="0.5" max="60" step="0.5" defaultValue={current.placement.source.heightCm} key={`h-${current.placement.id}-${current.placement.source.heightCm}`} disabled={busy !== null} onBlur={(event) => { const heightCm = Number(event.currentTarget.value); if (heightCm > 0 && heightCm !== current.placement.source!.heightCm) void reconvert(current.placement, { heightCm }, `Resize ${current.placement.id} to ${heightCm} cm`); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><i>cm</i></span></label>}
      <label className="check-label">Centred on the front<input type="checkbox" checked={current.placement.x === 'center'} onChange={(event) => update({ ...current.placement, x: event.currentTarget.checked ? 'center' : Math.max(0, Math.floor((state.chart.width - current.placement.motif.width) / 2)) }, event.currentTarget.checked ? `Centre ${current.placement.id}` : `Pin ${current.placement.id} to a column`)} /></label>
      {current.placement.x !== 'center' && <label className="strategy-field"><span>From stitch</span><input type="number" min="1" max={state.chart.width} defaultValue={current.placement.x + 1} key={`x-${current.placement.x}`} onBlur={(event) => { const column = Math.round(Number(event.currentTarget.value)) - 1; if (column >= 0 && column !== current.placement.x) update({ ...current.placement, x: column }, `Move ${current.placement.id}`); }} /></label>}
      <label className="strategy-field"><span>Rows above the {state.object?.construction === 'rib-cuff-jersey-body' ? 'cuff' : 'cast-on'}</span><input type="number" min="0" max="1200" defaultValue={current.placement.rowsAboveCuff} key={`r-${current.placement.rowsAboveCuff}`} onBlur={(event) => { const rows = Math.round(Number(event.currentTarget.value)); if (rows >= 0 && rows !== current.placement.rowsAboveCuff) update({ ...current.placement, rowsAboveCuff: rows }, `Move ${current.placement.id}`); }} /></label>
      <fieldset className="motif-colors"><legend>Colors</legend>{motifColors.map((color) => <label key={color}><span>Image color {color}{color === 0 ? ' (background)' : ''}</span><select value={current.placement.colors[String(color)] ?? ''} onChange={(event) => {
        const colors = { ...current.placement.colors };
        if (event.currentTarget.value === '') delete colors[String(color)]; else colors[String(color)] = event.currentTarget.value;
        update({ ...current.placement, colors }, `Recolor ${current.placement.id}`);
      }}><option value="">Leave the ground</option>{state.chart.palette.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>)}</fieldset>
      <div className="readiness-buttons">
        {current.placement.source && <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void reconvert(current.placement, {}, `Refresh ${current.placement.id} at the current gauge`)}><RefreshCw size={13} /> Refresh</button>}
        <button type="button" className="secondary-button" onClick={() => onReplaceImage(current.placement)}><ImagePlus size={13} /> Replace image</button>
        <button type="button" className="secondary-button" disabled={current.status !== 'placed'} title="Paint its stitches into the chart so you can edit them one by one; it no longer follows resizes." onClick={() => { onOperation(`Convert ${current.placement.id} to stitches`, placementToStitchesEdits(state, current)); onSelect(null); }}>Convert to stitches</button>
        <button type="button" className="secondary-button danger" onClick={() => { onOperation(`Remove ${current.placement.id}`, [{ kind: 'remove-placement', placementId: current.placement.id }]); onSelect(null); }}><Trash2 size={13} /> Remove</button>
      </div>
    </div>}
  </section>;
}
