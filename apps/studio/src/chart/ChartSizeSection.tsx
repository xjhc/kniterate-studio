import { useState } from 'react';
import { AUTHORED_CAPACITY_LIMITS_V1, type ProjectGauge, type ProjectState } from '@kniterate-studio/project-contract';
import { projectBackingWords } from '../backing';
import { MeasureRow, NumberField } from '../garment/GarmentFitSection';
import { GaugeFields, SwatchAside, swatchWords } from '../workspace/gauge';
import { Section } from '../workspace/panel';

/** A typical 7gg colourwork gauge, until a swatch is measured. */
export const TYPICAL_COLOURWORK_GAUGE = { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'assumed' } as const;

type Gauge = Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'>;

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * A colour chart's size and swatch. With a gauge the size is in cm, beside
 * the needles and rows it knits; a new size or a new swatch resizes the chart
 * in one change. Without one, the size is in needles and rows.
 */
export function ChartSizeSection({ state, onSize, onGauge, onNeedles, onRows, onNeedleOffset }: {
  state: ProjectState;
  onSize: (target: { widthCm?: number; heightCm?: number }, label: string) => void;
  onGauge: (gauge: Gauge, label: string) => void;
  onNeedles: (width: number) => void;
  onRows: (height: number) => void;
  onNeedleOffset: (offset: number) => void;
}) {
  const [resizedFrom, setResizedFrom] = useState<{ needles: number; rows: number } | null>(null);
  const { chart, gauge, target } = state;
  const swatch = gauge ? swatchWords([gauge], projectBackingWords(state)?.fabric ?? 'plain stockinette') : null;
  const counts = { needles: chart.width, rows: chart.height };
  const resized = resizedFrom && (resizedFrom.needles !== counts.needles || resizedFrom.rows !== counts.rows) ? resizedFrom : null;
  const knitted = gauge ? { widthCm: round1(chart.width / gauge.stitchesPer10cm * 10), heightCm: round1(chart.height / gauge.rowsPer10cm * 10) } : null;
  const off = (wanted: number | undefined, value: number) => wanted !== undefined && Math.abs(wanted - value) >= 1;
  return <>
    <Section id="size" title="Size" aside={<em className="section-aside">{knitted ? `${knitted.widthCm} × ${knitted.heightCm} cm` : `${chart.width} × ${chart.height}`}</em>}>
      {knitted ? <div className="measure-table" role="group" aria-label="Finished measurements">
        <div className="measure-head garment-measure"><span /><span>Wanted</span><span>Knitted</span><span>Count</span></div>
        <MeasureRow label="Width" hint={`${chart.width} needles at ${gauge!.stitchesPer10cm} stitches per 10 cm.`}
          wanted={<NumberField id="size.width" label="Width" value={target?.widthCm ?? knitted.widthCm} min={1} max={250} suffix="cm" onCommit={(widthCm) => onSize({ widthCm }, `Width ${widthCm} cm`)} />}
          knitted={String(knitted.widthCm)} count={`${chart.width} st`} off={off(target?.widthCm, knitted.widthCm)} />
        <MeasureRow label="Length" hint={`${chart.height} rows at ${gauge!.rowsPer10cm} rows per 10 cm.`}
          wanted={<NumberField id="size.height" label="Length" value={target?.heightCm ?? knitted.heightCm} min={1} max={1000} suffix="cm" onCommit={(heightCm) => onSize({ heightCm }, `Length ${heightCm} cm`)} />}
          knitted={String(knitted.heightCm)} count={`${chart.height} rows`} off={off(target?.heightCm, knitted.heightCm)} />
      </div> : <>
        <label className="strategy-field"><span>Needles</span><input type="number" min="1" max={AUTHORED_CAPACITY_LIMITS_V1.chartWidth} defaultValue={chart.width} key={`w${chart.width}`} onBlur={(event) => onNeedles(Number(event.currentTarget.value))} /></label>
        <label className="strategy-field"><span>Rows</span><input type="number" min="1" max={AUTHORED_CAPACITY_LIMITS_V1.chartHeight} defaultValue={chart.height} key={`h${chart.height}`} onBlur={(event) => onRows(Number(event.currentTarget.value))} /></label>
      </>}
      <label className="strategy-field" title="Where the chart sits on the machine bed."><span>First needle</span><input type="number" min="1" max={253 - chart.width} defaultValue={state.machine.needleOffset} key={`n${state.machine.needleOffset}`} onBlur={(event) => onNeedleOffset(Number(event.currentTarget.value))} /></label>
    </Section>
    <Section id="swatch" title="Your swatch" aside={swatch ? <SwatchAside aside={swatch.aside} /> : <em className="section-aside warn">none</em>}>
      <p className="garment-help">{swatch?.hint ?? 'Enter what 10 cm of your swatch measures, and the chart is sized in cm from it.'}</p>
      <GaugeFields id="gauge.body" label="Colourwork" gauge={gauge ?? TYPICAL_COLOURWORK_GAUGE} onCommit={(next) => { setResizedFrom(counts); onGauge(next, `Gauge ${next.stitchesPer10cm}/${next.rowsPer10cm} (${next.source})`); }} />
      {resized && <p className="garment-derived" role="status">Resized: {resized.needles} → {counts.needles} needles, {resized.rows} → {counts.rows} rows.</p>}
    </Section>
  </>;
}
