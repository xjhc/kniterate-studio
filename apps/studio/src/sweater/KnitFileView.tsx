import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { CARRIER_COLORS } from '../chart/AuthoredMachinePanel';
import { indexSourceLines, sourceWindow } from '../sourceWindow';
import type { KnitFile, KnitFileCarriers, KnitFileSection } from './knitFile';

/**
 * A piece's .kc as the machine will run it: the fabric it knits, course by
 * course, and every carriage pass in order, in words and as the exact lines
 * of the file. Everything here is read back from the emitted file.
 */

const WASTE_HEX = '#A9B0B8';
const DRAW_HEX = '#C2413A';

function tint(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    return Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export function carrierRole(carrier: string, carriers: KnitFileCarriers): string {
  const named = carriers.yarns?.[carrier];
  if (named) return `${named.name} yarn`;
  if (carrier === carriers.main) return 'your yarn';
  if (carrier === carriers.second) return 'your yarn, second cone';
  if (carrier === carriers.waste) return 'waste yarn';
  if (carrier === carriers.draw) return 'draw thread';
  return 'unassigned';
}

const SECTION_NOTES: Record<KnitFileSection['kind'], string> = {
  waste: 'Knitted first, so the piece has something to hang from. Unravel it after.',
  draw: 'One row you pull out to free the piece from the waste yarn.',
  'cast-on': 'The first rows of your yarn.',
  rib: 'Rib, as designed.',
  body: 'The body of the piece, as designed.',
  shoulders: 'After the neck split each shoulder is knitted with its own cone.',
  top: 'Closes the top edge.',
  'carriers-out': 'The carriers move out of the way; nothing is knitted.',
};

const plural = (count: number, word: string) => `${count.toLocaleString()} ${count === 1 ? word : /(s|ch|sh|x)$/.test(word) ? `${word}es` : `${word}s`}`;

/** One pass, in words. */
export function describePass(file: KnitFile, index: number, carriers: KnitFileCarriers): string {
  const pass = file.passes[index]!;
  const way = pass.direction === '>>' ? 'right' : 'left';
  const range = pass.needles ? pass.needles.lo === pass.needles.hi ? `needle ${pass.needles.lo}` : `needles ${pass.needles.lo}–${pass.needles.hi}` : '';
  const yarn = `C${pass.carrier} (${carrierRole(pass.carrier, carriers)})`;
  switch (pass.kind) {
    case 'knit': {
      const parts: string[] = [];
      if (pass.knit.front) parts.push(`knits ${plural(pass.knit.front, 'stitch')} on the front bed`);
      if (pass.knit.rear) parts.push(`${pass.knit.front ? '' : 'knits '}${plural(pass.knit.rear, 'stitch')} on the back bed`);
      if (pass.tuck) parts.push(`tucks ${pass.tuck}`);
      return `The carriage goes ${way} with ${yarn} and ${parts.join(' and ')}: ${range}.`;
    }
    case 'transfer': {
      const parts: string[] = [];
      if (pass.transfer.toRear) parts.push(`${plural(pass.transfer.toRear, 'stitch')} from the front bed to the back`);
      if (pass.transfer.toFront) parts.push(`${plural(pass.transfer.toFront, 'stitch')} from the back bed to the front`);
      return `No yarn. The carriage goes ${way} and moves ${parts.join(' and ')}: ${range}${pass.rack !== 0 ? `, with the beds offset by ${pass.rack}` : ''}.`;
    }
    case 'drop':
      return `No yarn. The carriage goes ${way} and drops ${plural(pass.drop, 'stitch')} off the needles: ${range}.`;
    case 'move':
      return pass.carrier === '0' ? `The carriage goes ${way} empty.` : `The carriage takes ${yarn} ${way} without knitting.`;
  }
}

export function KnitFileView({ file, kcText, fileName, copies, hex, carriers, stitchCm, rowCm, onDownload }: {
  file: KnitFile;
  kcText: string;
  fileName: string;
  copies: number;
  hex: string;
  carriers: KnitFileCarriers;
  stitchCm: number;
  rowCm: { rib: number; body: number };
  onDownload: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 360, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [colorBy, setColorBy] = useState<'carrier' | 'yarn'>('carrier');
  const firstPiecePass = file.sections.find((section) => section.kind === 'cast-on' || section.kind === 'rib' || section.kind === 'body')?.passes.from ?? 0;
  const [selected, setSelected] = useState(firstPiecePass);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { setSelected((value) => Math.min(value, file.passCount - 1)); }, [file.passCount]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      setRoom({ width: Math.max(160, element.clientWidth - 24), height: Math.max(320, window.innerHeight - box.top - 32) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const width = file.needles.hi - file.needles.lo + 1;
  const courseCm = (index: number) => (file.sections[file.courses[index]!.section]!.kind === 'rib' ? rowCm.rib : rowCm.body);
  const totalCm = file.courses.reduce((sum, _, index) => sum + courseCm(index), 0);
  const fit = Math.max(0.5, Math.min(room.width / (width * stitchCm), room.height / totalCm));
  const scale = fit * zoom;
  const cell = stitchCm * scale;
  const pictureWidth = Math.ceil(width * cell);
  const tops = useMemo(() => {
    let y = totalCm * scale;
    return file.courses.map((_, index) => (y -= courseCm(index) * scale));
  }, [file, scale, rowCm.rib, rowCm.body]);
  const heightOf = (index: number) => courseCm(index) * scale;
  const pictureHeight = Math.ceil(totalCm * scale);

  const colorFor = (carrier: string) => {
    if (colorBy === 'carrier') return CARRIER_COLORS[carrier] ?? '#888888';
    if (carrier === carriers.waste) return WASTE_HEX;
    if (carrier === carriers.draw) return DRAW_HEX;
    return carriers.yarns?.[carrier]?.hex ?? hex;
  };

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.max(1, Math.round(pictureWidth * ratio));
    element.height = Math.max(1, Math.round(pictureHeight * ratio));
    const context = element.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, pictureWidth, pictureHeight);
    const detailed = cell >= 5;
    file.courses.forEach((course, index) => {
      const top = tops[index]!;
      const h = heightOf(index);
      for (let i = 0; i < width; i++) {
        const mark = course.stitches[i];
        if (mark === '.' || mark === undefined) continue;
        const base = colorFor(course.carriers[i]!);
        const x = i * cell;
        if (!detailed) {
          context.fillStyle = mark === 'p' ? tint(base, -0.28) : mark === 't' ? tint(base, 0.45) : base;
          context.fillRect(x, top, cell + 0.4, h + 0.4);
          continue;
        }
        context.fillStyle = tint(base, mark === 'p' ? -0.18 : 0.12);
        context.fillRect(x, top, cell, h + 0.4);
        context.strokeStyle = mark === 'p' ? tint(base, -0.42) : tint(base, -0.3);
        context.lineWidth = Math.max(1, cell * 0.2);
        context.beginPath();
        if (mark === 'p') {
          context.ellipse(x + cell / 2, top + h * 0.55, cell * 0.38, h * 0.28, 0, Math.PI, 0);
        } else if (mark === 't') {
          context.arc(x + cell / 2, top + h * 0.35, cell * 0.22, 0, Math.PI);
        } else {
          context.moveTo(x + cell * 0.12, top + h * 0.1);
          context.lineTo(x + cell / 2, top + h * 0.92);
          context.lineTo(x + cell * 0.88, top + h * 0.1);
        }
        context.stroke();
      }
    });
  }, [file, pictureWidth, pictureHeight, cell, tops, colorBy, hex]);

  // The course each pass knits into, or (for a transfer, drop or move) the course it follows.
  const passCourse = useMemo(() => file.passes.map((pass) => ({ course: pass.at ?? -1, between: pass.course === null })), [file]);
  const pass = file.passes[selected]!;
  const at = passCourse[selected]!;
  const section = file.sections[pass.section]!;
  const sectionIndex = pass.section;
  const sourceIndex = useMemo(() => indexSourceLines(kcText), [kcText]);
  const lines = useMemo(() => {
    if (!pass.lines) return null;
    const focus = Math.floor((pass.lines.start + pass.lines.end) / 2);
    return sourceWindow(kcText, focus, Math.ceil((pass.lines.end - pass.lines.start) / 2) + 2, 4_096, sourceIndex);
  }, [kcText, pass.lines?.start, pass.lines?.end, sourceIndex]);
  const used = useMemo(() => {
    const set = new Set<string>();
    for (const item of file.passes) if (item.carrier !== '0' && item.kind !== 'move') set.add(item.carrier);
    return [...set].sort();
  }, [file]);

  const go = (index: number) => setSelected(Math.max(0, Math.min(file.passCount - 1, index)));
  const goCourse = (step: 1 | -1) => {
    const target = Math.max(0, Math.min(file.courses.length - 1, (at.course === -1 ? 0 : at.course) + step));
    const first = file.courses[target]?.passes[0];
    if (first !== undefined) go(first);
  };
  const highlight = useRef<HTMLDivElement>(null);
  useEffect(() => { highlight.current?.scrollIntoView({ block: 'nearest' }); }, [selected, scale]);
  // The bed lines are wider than the panel: scroll them to where this pass's needles begin.
  const source = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const element = source.current;
    const bed = lines?.lines.find((line) => pass.lines !== null && line.lineNumber >= pass.lines.start && line.lineNumber <= pass.lines.end && /^(FRNT|REAR):/.test(line.text) && /[^.]/.test(line.text.slice(5)));
    if (!element || !bed) { if (element) element.scrollLeft = 0; return; }
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    context.font = getComputedStyle(element).font;
    const charWidth = context.measureText('0000000000').width / 10;
    const first = 5 + bed.text.slice(5).search(/[^.]/);
    element.scrollLeft = Math.max(0, (first - 6) * charWidth);
  }, [lines, pass.lines?.start]);

  const locate = (clientY: number, rect: DOMRect) => {
    const y = clientY - rect.top;
    for (let index = 0; index < tops.length; index++) if (y >= tops[index]! && y < tops[index]! + heightOf(index)) return index;
    return null;
  };
  const marked = at.course >= 0 ? at.course : null;
  const needlesBox = pass.needles ? { left: (pass.needles.lo - file.needles.lo) * cell, width: (pass.needles.hi - pass.needles.lo + 1) * cell } : { left: 0, width: pictureWidth };

  return <div className="knitfile">
    <div className="knitfile-picture" ref={host}>
      <div className="knitfile-tools">
        <div className="piece-zoom" role="group" aria-label="Zoom">
          <button type="button" className="icon-button" onClick={() => setZoom((value) => Math.max(1, value / 1.6))} disabled={zoom <= 1} aria-label="Zoom out" title="Zoom out"><ZoomOut size={15} /></button>
          <button type="button" className="icon-button" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Fit the file" title="Fit"><Maximize2 size={15} /></button>
          <button type="button" className="icon-button" onClick={() => setZoom((value) => Math.min(10, value * 1.6))} disabled={zoom >= 10} aria-label="Zoom in" title="Zoom in to see each stitch"><ZoomIn size={15} /></button>
        </div>
        <div className="garment-view-toggle compact" role="tablist" aria-label="Colour by">
          <button type="button" role="tab" aria-selected={colorBy === 'carrier'} className={colorBy === 'carrier' ? 'active' : ''} onClick={() => setColorBy('carrier')}>By carrier</button>
          <button type="button" role="tab" aria-selected={colorBy === 'yarn'} className={colorBy === 'yarn' ? 'active' : ''} onClick={() => setColorBy('yarn')}>As knitted</button>
        </div>
      </div>
      <div className="knitfile-scroll" ref={scroller} style={{ maxHeight: room.height }}>
        <div className="knitfile-bands" style={{ height: pictureHeight }} aria-hidden="true">
          {file.sections.map((item, index) => {
            const courses = file.courses.flatMap((course, k) => (course.section === index ? [k] : []));
            if (courses.length === 0) return null;
            const top = tops[courses.at(-1)!]!;
            const bottom = tops[courses[0]!]! + heightOf(courses[0]!);
            return <span key={index} className={`band band-${item.kind}${index === sectionIndex ? ' active' : ''}`} style={{ top, height: Math.max(2, bottom - top) }} title={item.label} />;
          })}
          {marked !== null && <span className="band-pointer" style={{ top: (at.between ? tops[marked]! : tops[marked]! + heightOf(marked) / 2) - 6 }} />}
        </div>
        <div className="knitfile-canvas" style={{ width: pictureWidth, height: pictureHeight }}>
          <canvas ref={canvas} style={{ width: pictureWidth, height: pictureHeight }} role="img" aria-label={`${fileName}: ${file.courses.length} courses of fabric from ${file.passCount} passes, needles ${file.needles.lo}–${file.needles.hi}`}
            onMouseMove={(event) => setHover(locate(event.clientY, event.currentTarget.getBoundingClientRect()))}
            onMouseLeave={() => setHover(null)}
            onClick={(event) => { const course = locate(event.clientY, event.currentTarget.getBoundingClientRect()); const first = course === null ? undefined : file.courses[course]!.passes[0]; if (first !== undefined) go(first); }} />
          {hover !== null && <div className="knitfile-hover" style={{ top: tops[hover], height: Math.max(2, heightOf(hover)) }} />}
          {marked !== null && <div ref={highlight} className={`knitfile-mark${at.between ? ' between' : ''}`} style={{ top: at.between ? tops[marked]! - 1 : tops[marked], height: at.between ? 3 : Math.max(3, heightOf(marked)), left: needlesBox.left, width: needlesBox.width }} />}
          {hover !== null && <div className="piece-tooltip" style={{ left: 8, top: Math.max(0, tops[hover]! - 46) }}>
            <b>{file.sections[file.courses[hover]!.section]!.label}{file.courses[hover]!.row !== null ? ` · row ${file.courses[hover]!.row! + 1}` : ''}</b>
            <span>{file.courses[hover]!.passes.length === 1 ? `Pass ${file.courses[hover]!.passes[0]! + 1}` : `Passes ${file.courses[hover]!.passes[0]! + 1}–${file.courses[hover]!.passes.at(-1)! + 1}`} · click to read it</span>
          </div>}
        </div>
      </div>
      <p className="design-hint">Bottom to top, as the machine knits it.{cell >= 5 ? ' V: knit. Bump: purl.' : ' Zoom in to see each stitch.'}</p>
    </div>

    <aside className="knitfile-side" aria-label="Machine file">
      <header className="knitfile-head">
        <div><b>{fileName}</b><small>{plural(file.passCount, 'pass')} · {plural(file.lineCount, 'line')} · needles {file.needles.lo}–{file.needles.hi}{copies > 1 ? ` · run it ${copies} times` : ''}</small></div>
        <button type="button" className="secondary-button" onClick={onDownload} aria-label={`Download ${fileName}`}><Download size={14} />Download</button>
      </header>
      <ul className="knitfile-carriers">
        {used.map((carrier) => <li key={carrier}><i style={{ background: colorFor(carrier) }} />C{carrier}<span>{carrierRole(carrier, carriers)}</span></li>)}
      </ul>
      <section className="knitfile-sections">
        <h4>In the order the machine knits it</h4>
        <ol>{file.sections.map((item, index) => <li key={index}>
          <button type="button" className={`band-${item.kind}${index === sectionIndex ? ' active' : ''}`} aria-pressed={index === sectionIndex} onClick={() => go(item.passes.from)}>
            <b>{item.label}</b>
            <small>{item.passes.from === item.passes.to ? `pass ${item.passes.from + 1}` : `passes ${item.passes.from + 1}–${item.passes.to + 1}`}{item.rows ? ` · rows ${item.rows.from + 1}–${item.rows.to + 1}` : ''}{item.carriers.length ? ` · ${item.carriers.map((carrier) => `C${carrier}`).join(', ')}` : ''}{item.joins.length ? ` · ${item.joins.map((carrier) => `C${carrier}`).join(', ')} brought in` : ''}</small>
          </button>
        </li>)}</ol>
      </section>
      <section className="knitfile-pass" aria-label="Selected pass" tabIndex={0} onKeyDown={(event) => {
        if (event.key === 'ArrowRight') { event.preventDefault(); go(selected + 1); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); go(selected - 1); }
        if (event.key === 'ArrowUp') { event.preventDefault(); goCourse(1); }
        if (event.key === 'ArrowDown') { event.preventDefault(); goCourse(-1); }
      }}>
        <div className="knitfile-nav">
          <button type="button" className="icon-button" onClick={() => goCourse(-1)} aria-label="Previous course" title="Previous course (↓)"><ChevronsLeft size={15} /></button>
          <button type="button" className="icon-button" onClick={() => go(selected - 1)} disabled={selected === 0} aria-label="Previous pass" title="Previous pass (←)"><ChevronLeft size={15} /></button>
          <b>Pass {(selected + 1).toLocaleString()} <small>of {file.passCount.toLocaleString()}</small></b>
          <button type="button" className="icon-button" onClick={() => go(selected + 1)} disabled={selected === file.passCount - 1} aria-label="Next pass" title="Next pass (→)"><ChevronRight size={15} /></button>
          <button type="button" className="icon-button" onClick={() => goCourse(1)} aria-label="Next course" title="Next course (↑)"><ChevronsRight size={15} /></button>
        </div>
        <p className="knitfile-says">{describePass(file, selected, carriers)}</p>
        <p className="knitfile-context"><span className={`section-chip band-${section.kind}`}>{section.label}</span>{pass.row !== null ? ` Row ${pass.row + 1} of the piece.` : ''} {SECTION_NOTES[section.kind]}{section.joins.length && section.kind === 'waste' ? ` ${section.joins.map((carrier) => `C${carrier}`).join(' and ')} ${section.joins.length === 1 ? 'is' : 'are'} knitted in here so ${section.joins.length === 1 ? 'it is' : 'they are'} ready later.` : ''}</p>
        <dl className="knitfile-settings">
          <div><dt>Direction</dt><dd>{pass.direction}</dd></div>
          <div><dt>Operation</dt><dd>{pass.operation}</dd></div>
          <div><dt>Carrier</dt><dd>{pass.carrier === '0' ? 'none' : `C${pass.carrier}`}</dd></div>
          <div><dt>Speed</dt><dd>{pass.speed}</dd></div>
          <div><dt>Roller</dt><dd>{pass.roller}</dd></div>
          <div><dt>Rack</dt><dd>{pass.rack}</dd></div>
        </dl>
        <h4>Exactly as written in {fileName}{pass.lines ? <small> · lines {pass.lines.start.toLocaleString()}–{pass.lines.end.toLocaleString()}</small> : null}</h4>
        <pre className="knitfile-source" tabIndex={0} ref={source}>{lines?.lines.map((line) => {
          const inside = pass.lines !== null && line.lineNumber >= pass.lines.start && line.lineNumber <= pass.lines.end;
          return <span key={line.lineNumber} className={inside ? 'highlighted' : ''}><i>{line.lineNumber}</i><code>{line.text || ' '}</code></span>;
        })}</pre>
        <p className="design-hint">FRNT, REAR: each needle on the front and back bed. STIF, STIR: stitch size. Last line: direction, operation, carrier, speed, roller. Lines with // are comments.</p>
      </section>
    </aside>
  </div>;
}
