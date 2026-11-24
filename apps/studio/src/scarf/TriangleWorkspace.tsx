import { useEffect, useMemo, useState } from 'react';
import type { PixelCell } from '@knitlab/colorwork-core';
import { ScarfPixelEditor } from './ScarfPixelEditor';
import { ArrowLeft, Download, Ruler } from 'lucide-react';
import artwork from '../../../../designs/atelier-paisley/composition-master.svg?raw';
import { acrylicGauge, bedColumns, cashmereGauge, figCamelPalette, figCamelTarget, paisleyPalette, planTriangle, triangleCells, triangleDraft, triangleTarget, type TriangleDesignId, type TrianglePalette, type TrianglePlan } from './triangle';
import { type PaisleyRowCount, figCamelMask, paintFigCamelDetails } from './figCamelArtwork';
import { TriangleKnitLayout } from './TriangleKnitLayout';
import type { TriangleProject } from './triangleProjectFile';
import './triangle.css';

const gaugeOf = (sample: typeof acrylicGauge) => ({
  stitches: sample.stitches * 10 / sample.widthCm,
  rows: sample.rows * 10 / sample.heightCm,
});
const acrylic = gaugeOf(acrylicGauge);
const cashmere = gaugeOf(cashmereGauge);

const designs = {
  'atelier-paisley': {
    title: 'Atelier paisley triangle', target: triangleTarget, palette: paisleyPalette,
    description: 'floral paisleys and a vine border',
    mask: () => artwork.replaceAll(paisleyPalette[0].hex, '#000000').replaceAll(paisleyPalette[1].hex, '#ffffff'),
  },
  'fig-camel': {
    title: 'Fig / Camel paisley', target: figCamelTarget, palette: figCamelPalette,
    description: 'a running stitch edge, ornamental border, and staggered paisley field',
    mask: figCamelMask,
  },
} as const;
type ScarfCrop = 'full' | 'centre' | 'tip' | 'motifs';
const cropLabels = { full: 'Full scarf', centre: 'Centre detail', tip: 'Tie and edge', motifs: 'Paisley close-up' } as const;
const cropFraction = { full: 1, centre: 0.37, tip: 0.2, motifs: 0.21 } as const;

async function loadChart(plan: TrianglePlan, mask: string, contrastSelvedge: boolean, fieldRows: PaisleyRowCount): Promise<number[][]> {
  const url = URL.createObjectURL(new Blob([mask], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = plan.rows;
    canvas.height = plan.columns;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const cells = triangleCells(plan, context.getImageData(0, 0, canvas.width, canvas.height).data, contrastSelvedge);
    if (contrastSelvedge) paintFigCamelDetails(plan, cells, fieldRows);
    return cells;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function chartImage(plan: TrianglePlan, cells: number[][], reverse: boolean, view: ScarfCrop, palette: TrianglePalette, showEdges = false): string {
  const canvas = document.createElement('canvas');
  canvas.width = plan.rows;
  canvas.height = plan.columns;
  const context = canvas.getContext('2d')!;
  const background = palette[reverse ? 1 : 0].hex;
  const foreground = palette[reverse ? 0 : 1].hex;
  for (let row = 0; row < plan.rows; row++) {
    const x = reverse ? plan.rows - 1 - row : row;
    context.fillStyle = background;
    context.fillRect(x, 0, 1, plan.widths[row]!);
    context.fillStyle = foreground;
    cells[row]!.forEach((color, column) => {
      if (color === 1) context.fillRect(x, column, 1, 1);
    });
    if (showEdges) {
      context.fillStyle = 'rgba(252, 209, 128, .72)';
      const width = plan.widths[row]!;
      context.fillRect(x, 0, 1, Math.min(2, width));
      if (width > 2) context.fillRect(x, Math.max(2, width - 2), 1, Math.min(2, width - 2));
    }
  }
  if (view === 'full') return canvas.toDataURL();
  const crop = document.createElement('canvas');
  crop.width = Math.ceil(plan.rows * cropFraction[view]);
  crop.height = cropHeight(plan, view, crop.width);
  const left = view === 'centre'
    ? Math.floor((plan.rows - crop.width) / 2)
    : view === 'motifs' ? Math.floor(plan.rows * 0.477) : 0;
  crop.getContext('2d')!.drawImage(canvas, -left, 0);
  return crop.toDataURL();
}

function cropHeight(plan: TrianglePlan, view: ScarfCrop, columnsInImage: number) {
  if (view === 'motifs') return Math.ceil(plan.columns * 0.34);
  return view === 'tip' ? plan.widths[columnsInImage - 1]! : plan.columns;
}

function saveDraft(plan: TrianglePlan, cells: number[][], stitches: number, rows: number, design: Parameters<typeof triangleDraft>[4]) {
  const blob = new Blob([JSON.stringify(triangleDraft(plan, cells, stitches, rows, design)) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${design.id}.kniterate-studio.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TriangleWorkspace({ id, opened, onClose }: { id: TriangleDesignId; opened?: TriangleProject; onClose?: () => void }) {
  const fieldRows: PaisleyRowCount = new URLSearchParams(window.location.search).get('fieldRows') === '11' ? 11 : 9;
  const design = useMemo(() => {
    if (opened) return { ...designs[id], title: opened.title, target: opened.target, palette: opened.palette };
    if (id === 'fig-camel' && fieldRows === 9) return { ...designs[id], title: 'Fig / Camel paisley · 9 rows' };
    return designs[id];
  }, [id, opened, fieldRows]);
  const c3Decrease = opened ? opened.c3Decrease : id === 'fig-camel' && fieldRows === 9;
  const defaultGauge = id === 'fig-camel' ? cashmere : acrylic;
  const startingStitches = defaultGauge.stitches.toFixed(2);
  const startingRows = String(defaultGauge.rows);
  const [stitches, setStitches] = useState(() => opened?.stitchesPer10cm.toFixed(2) ?? startingStitches);
  const [rows, setRows] = useState(() => opened?.rowsPer10cm.toFixed(2) ?? startingRows);
  const [reverse, setReverse] = useState(false);
  const [crop, setCrop] = useState<ScarfCrop>(() =>
    id === 'fig-camel' && new URLSearchParams(window.location.search).get('detail') === 'motifs' ? 'motifs' : 'full');
  const [view, setView] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('view');
    return requested === 'knit' || requested === 'pixels' ? requested : 'scarf';
  });
  const [chart, setChart] = useState<{ plan: TrianglePlan; cells: number[][]; past?: number[][][]; future?: number[][][]; saved?: number[][] } | null>(() => opened ?? null);
  const [error, setError] = useState<string | null>(null);
  const stitchGauge = opened?.stitchesPer10cm ?? (stitches === startingStitches ? defaultGauge.stitches : Number(stitches));
  const rowGauge = opened?.rowsPer10cm ?? (rows === startingRows ? defaultGauge.rows : Number(rows));
  const valid = stitchGauge >= 5 && stitchGauge <= 100 && rowGauge >= 5 && rowGauge <= 120;
  const plan = useMemo(() => opened?.plan ?? (valid ? planTriangle(stitchGauge, rowGauge, design.target) : null), [stitchGauge, rowGauge, valid, design, opened]);

  useEffect(() => {
    if (!plan || opened) return;
    let current = true;
    setError(null);
    void loadChart(plan, design.mask(), id === 'fig-camel', fieldRows).then(
      (cells) => { if (current) setChart({ plan, cells }); },
      () => { if (current) setError('The paisley artwork could not be loaded. Reload Studio to try again.'); },
    );
    return () => { current = false; };
  }, [plan, design, id, opened, fieldRows]);

  const preview = useMemo(() => chart ? chartImage(chart.plan, chart.cells, reverse, view === 'pixels' ? 'full' : crop, design.palette) : null, [chart, reverse, view, crop, design]);
  const edited = Boolean(chart?.past?.length || chart?.future?.length);
  const dirty = edited && chart?.saved !== chart?.cells;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  function paint(stroke: PixelCell[]) {
    setChart(current => {
      if (!current || current.plan !== plan) return current;
      const cells = current.cells.slice();
      let changed = false;
      for (const {row, column, paletteIndex} of stroke) {
        if (column < 2 || column >= (current.plan.widths[row] ?? 0) - 2 || cells[row]![column] === paletteIndex) continue;
        if (cells[row] === current.cells[row]) cells[row] = cells[row]!.slice();
        cells[row]![column] = paletteIndex;
        changed = true;
      }
      return changed ? { ...current, cells, saved: current.saved ?? current.cells, past: [...(current.past ?? []).slice(-63), current.cells], future: [] } : current;
    });
  }
  function history(direction: 'past' | 'future') {
    setChart(current => {
      const stack = current?.[direction];
      if (!current || !stack?.length) return current;
      const other = direction === 'past' ? 'future' : 'past';
      return { ...current, cells: stack[stack.length - 1]!, [direction]: stack.slice(0,-1), [other]: [...(current[other] ?? []), current.cells] };
    });
  }
  const layoutImage = useMemo(() => view === 'knit' && chart
    ? chartImage(chart.plan, chart.cells, false, 'full', design.palette, true) : null, [chart, view, design]);
  const setScarfView = (next: 'scarf' | 'knit' | 'pixels') => {
    if (!opened) {
      const url = new URL(window.location.href);
      if (next === 'scarf') url.searchParams.delete('view');
      else url.searchParams.set('view', next);
      window.history.replaceState(null, '', url);
    }
    setView(next);
  };
  const isCashmere = stitchGauge === cashmere.stitches && rowGauge === cashmere.rows;
  const isAcrylic = stitchGauge === acrylic.stitches && rowGauge === acrylic.rows;
  const theme = new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light';
  const face = design.palette[reverse ? 1 : 0].name;
  const cropWidth = chart ? Math.ceil(chart.plan.rows * cropFraction[crop]) : 1;
  const cropDepth = chart ? cropHeight(chart.plan, crop, cropWidth) / chart.plan.columns : 1;
  const previewAspect = chart ? `${chart.plan.lengthCm * cropWidth / chart.plan.rows} / ${chart.plan.depthCm * cropDepth}` : undefined;

  return <div className="app-shell triangle-shell" data-theme={theme}>
    <header className="topbar">
      {onClose
        ? <button className="secondary-button" type="button" onClick={() => { if (!dirty || window.confirm('Leave this scarf and discard unsaved stitch edits?')) onClose(); }}><ArrowLeft size={15} /> Studio workspace</button>
        : <a className="brand-lockup triangle-back" href="./"><ArrowLeft size={15} /><strong>Kniterate Studio</strong></a>}
      <span className="file-name">{design.title}{dirty && ' · Unsaved edits'}</span>
      <div className="triangle-top-spacer" />
      <button className="secondary-button" type="button" disabled={!chart || chart.plan !== plan}
        onClick={() => {
          if (chart) { saveDraft(chart.plan, chart.cells, stitchGauge, rowGauge, { ...design, id, c3Decrease }); setChart({ ...chart, saved: chart.cells }); }
        }}>
        <Download size={15} /> Save project
      </button>
    </header>
    <main className="triangle-main">
      <section className="triangle-preview" aria-labelledby="triangle-title">
        <div className="triangle-heading">
          <h1 id="triangle-title">{design.title}</h1>
          <p>Reversible scarf · {Number(design.target.longEdgeCm.toFixed(1))} × {Number(design.target.depthCm.toFixed(1))} cm target</p>
        </div>
        <div className="view-switch triangle-view-switch" role="group" aria-label="Design view">
          <button type="button" className={view === 'scarf' ? 'active' : ''} aria-pressed={view === 'scarf'} onClick={() => setScarfView('scarf')}>Scarf</button>
          <button type="button" className={view === 'pixels' ? 'active' : ''} aria-pressed={view === 'pixels'} onClick={() => setScarfView('pixels')}>Pixel editor</button>
          <button type="button" className={view === 'knit' ? 'active' : ''} aria-pressed={view === 'knit'} onClick={() => setScarfView('knit')}>Knit layout</button>
        </div>
        {view === 'knit' ? chart && layoutImage && chart.plan === plan
          ? <TriangleKnitLayout plan={chart.plan} image={layoutImage} target={design.target} />
          : <p>{error ?? 'Preparing the knit layout…'}</p>
        : view === 'pixels' ? chart && chart.plan === plan && preview
          ? <ScarfPixelEditor plan={chart.plan} cells={chart.cells} palette={design.palette} reverse={reverse} image={preview}
              onReverse={setReverse} onPaint={paint} undo={chart.past?.length ? () => history('past') : undefined}
              redo={chart.future?.length ? () => history('future') : undefined} />
          : <p>{error ?? 'Preparing stitch chart…'}</p>
        : <>
        <div className="triangle-toolbar">
          <div className="view-switch" role="group" aria-label="Scarf face">
            <button type="button" className={!reverse ? 'active' : ''} aria-pressed={!reverse} onClick={() => setReverse(false)}>{design.palette[0].name} face</button>
            <button type="button" className={reverse ? 'active' : ''} aria-pressed={reverse} onClick={() => setReverse(true)}>{design.palette[1].name} face</button>
          </div>
          <div className="view-switch" role="group" aria-label="Scarf detail">
            {(id === 'fig-camel' ? (['full', 'centre', 'tip', 'motifs'] as const) : (['full', 'centre', 'tip'] as const)).map((item) => <button key={item} type="button"
              className={crop === item ? 'active' : ''} aria-pressed={crop === item}
              onClick={() => setCrop(item)}>{cropLabels[item]}</button>)}
          </div>
        </div>
        <figure className="triangle-figure">
          <div className="triangle-stage">
            {preview && chart ? <img
              className={crop === 'centre' ? 'triangle-detail' : crop !== 'full' ? 'triangle-stitches' : ''}
              src={preview}
              alt={crop === 'full' ? `${face} face, full triangular scarf with ${design.description}` : `${face} face, ${cropLabels[crop].toLowerCase()} at stitch resolution`}
              style={{ aspectRatio: previewAspect }}
            /> : <p>{error ?? 'Preparing stitch preview…'}</p>}
          </div>
          <figcaption>{cropLabels[crop]} · {face} face · Stitch chart at target proportions</figcaption>
        </figure>
        </>}
      </section>
      <aside className="triangle-setup" aria-label="Scarf sizing and construction">
        <h2><Ruler size={16} /> Gauge</h2>
        <div className="triangle-gauge">
          <label>Stitches per 10 cm <input type="number" min="5" max="100" step="0.01" value={stitches} readOnly={!!opened || edited} onChange={(event) => setStitches(event.target.value)} /></label>
          <label>Rows per 10 cm <input type="number" min="5" max="120" step="0.01" value={rows} readOnly={!!opened || edited} onChange={(event) => setRows(event.target.value)} /></label>
        </div>
        {edited && !opened && <p>Gauge is fixed for this edited chart.</p>}
        {opened && <p>Saved gauge and stitch chart.</p>}
        <p>{isCashmere ? '3/28 cashmere, stitch size 6. The full swatch section measured 48 stitches across 11 cm and 30 rows over 5 cm.'
          : isAcrylic ? 'Acrylic test swatch: 21 stitches across 5.5 cm and 81 rows over 18 cm, excluding waste.'
          : 'Custom gauge. Use the relaxed measurements from a swatch in your final yarn.'}</p>
        {!valid && <p className="triangle-alert" role="alert">Enter 5–100 stitches and 5–120 rows per 10 cm.</p>}
        {error && preview && <p className="triangle-alert" role="alert">{error}</p>}
        {plan && <>
          <dl className="triangle-metrics">
            <dt>Stitch grid</dt><dd>{plan.columns} columns × {plan.rows} rows</dd>
            {id === 'fig-camel' && !opened && <><dt>Small-paisley rows</dt><dd>{fieldRows}</dd></>}
            <dt>Predicted size</dt><dd>{plan.lengthCm.toFixed(1)} × {plan.depthCm.toFixed(1)} cm</dd>
            <dt>Unused bed columns</dt><dd>{Math.max(0, bedColumns - plan.columns)} of {bedColumns}</dd>
            <dt>Width, tip to tip</dt><dd>{plan.endColumns} → {plan.columns} → {plan.endColumns}</dd>
            <dt>Shaping interval</dt><dd>{plan.coursesPerIncrease.toFixed(2)} rows per stitch</dd>
          </dl>
          {plan.columns > bedColumns && <p className="triangle-alert" role="status">{plan.columns} columns exceed the {bedColumns}-needle bed by {plan.columns - bedColumns}, before allowing room for transfers and feeders.</p>}
          {plan.growth > plan.transitions && <p className="triangle-alert" role="status">This gauge would require some rows to change width by more than one stitch.</p>}
        </>}
        {id === 'fig-camel' && <p>Size and colour reference · <a href="https://guestinresidence.com/products/the-wild-rag-fig-camel">The Wild Rag, Fig/Camel</a></p>}
        <section className="triangle-construction">
          <h2>Construction</h2>
          <p>One straight edge and one shaped edge. Both edges will be linked, following the joined paisley you preferred.</p>
          {c3Decrease && <p>C4 (Fig) forms the joined increases. On each decrease, the two outer loops transfer one needle inward to opposite beds. The outer front stitch knits in C3 (Camel), then C4 (Fig) on the following course, as in the 398-pass cashmere swatch.</p>}
          {id === 'fig-camel' && design.target.everyOtherCourse && !c3Decrease && <p>The 510-pass joined swatch supplies both shaping methods. C4 (Fig) makes both front-bed splits over two courses. Each decrease transfers the two outer loops one needle inward onto opposite beds. The swatch spaced increases two or four courses apart and decreases three courses apart. This scarf schedules both every two courses.</p>}
          <h3>Machine file pending</h3>
          <p>{c3Decrease ? "The cashmere swatch used three-column tips and shaped every two courses. Full-width machine passes still need to be generated and checked." : <>{plan && design.target.everyOtherCourse ? 'Each width is held for two courses, including the center pair.' : plan && plan.coursesPerIncrease < 3 ? `The joined paisley averaged 3 rows per increase. This draft needs an increase every ${plan.coursesPerIncrease.toFixed(2)} rows on average.` : 'Check the shaping sequence and working room for the carriers at the widest point.'} The two-column swatch knitted. This chart uses {plan?.endColumns ?? 3}-column tips. Test that finish and the faster shaping before exporting the full scarf.</>}</p>
          <p>Recheck sizing after swatching the final yarn. Allow room for transfers and parked feeders at the widest point.</p>
        </section>
      </aside>
    </main>
  </div>;
}
