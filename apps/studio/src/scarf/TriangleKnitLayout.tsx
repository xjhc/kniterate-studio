import { useState } from 'react';
import { Printer } from 'lucide-react';
import tipReference from './tipReference.json';
import { plannedBodyPlacement, type TrianglePlan, type TriangleTarget } from './triangle';

const phases = [
  { name: 'Start waste', from: 1, to: 104, note: 'Eight-column waste on C6 with yarn introduction near the end.' },
  { name: 'First draw and cast-on', from: 105, to: 114, note: 'Draw, cast on the eight-column starter, and park the waste and draw feeders.' },
  { name: 'Tapered starter', from: 115, to: 167, note: 'Sacrificial fabric narrows from eight columns to the tip width. It gives the rollers fabric to hold.' },
  { name: 'Tip draw and cast-on', from: 168, to: 174, note: 'C1 knits the draw round at 169–170. C3 casts on the point at 172–174.' },
  { name: 'Top waste', from: 350, to: 366, note: 'Eight rounds of tubular waste on C6.' },
  { name: 'Release and park', from: 367, to: 378, note: 'Release the waste loops, then return the feeders.' },
] as const;

type TipPass = [number, string, string, string, number, number, number, string, string];
const referencePasses = tipReference.passes as TipPass[];
const operationNames: Record<string, string> = {
  K: 'Knit', T: 'Tuck', X: 'Transfer out', R: 'Receive', S: 'Split', D: 'Drop',
};
const carrierColours: Record<string, string> = { '1': '#e2b24c', '3': '#e88a57', '4': '#9aabba', '6': '#9d82bb' };

function BedStrip({ pattern }: { pattern: string }) {
  return <span className="tip-bed" role="img" aria-label={[...pattern].flatMap((code, i) => code === '.' ? [] : [`${operationNames[code]} at ${tipReference.firstColumn + i}`]).join(', ') || 'No stitch operation'}>
    {[...pattern].map((code, i) => <span className={code === '.' ? 'tip-needle' : 'tip-needle selected'}
      key={i} title={`Column ${tipReference.firstColumn + i}: ${operationNames[code] ?? 'No stitch operation'}`}
      aria-hidden="true"
    >{code === '.' ? '·' : code}</span>)}
  </span>;
}

function TipPassTable({ phase }: { phase: typeof phases[number] }) {
  const passes = referencePasses.filter(([pass]) => pass >= phase.from && pass <= phase.to);
  return <table className="tip-pass-table">
    <thead><tr><th>Pass</th><th>Carriage / carrier</th><th>Front bed</th><th>Rear bed</th><th>Rack</th><th>Speed</th><th>Roller</th></tr></thead>
    <tbody>{passes.map(([pass, direction, carrier, operation, rack, speed, roller, front, rear]) =>
      <tr key={pass} style={{ '--tip-carrier': carrierColours[carrier] ?? '#c7c7c7' } as React.CSSProperties}>
        <th scope="row">{pass}</th><td>{direction === '>>' ? '→' : '←'} {carrier === '0' && /^\.+$/.test(front + rear) ? 'Move' : carrier === '0' ? operation : `C${carrier}`}</td>
        <td><BedStrip pattern={front} /></td><td><BedStrip pattern={rear} /></td>
        <td>{rack}</td><td>{speed}</td><td>{roller}</td>
      </tr>
    )}</tbody>
  </table>;
}

export function TriangleKnitLayout({ plan, image, target }: {
  plan: TrianglePlan;
  image: string;
  target: TriangleTarget;
}) {
  const [selected, setSelected] = useState(3);
  const phase = phases[selected]!;
  const placement = plannedBodyPlacement(plan);
  return <div className="triangle-knit-layout">
    <div className="triangle-layout-top">
      <div><h2>Knitting layout</h2><p>The scarf runs from one tie tip to the other. The chart shows the planned body, with the waste and finish sequence from the knitted tip trial below.</p></div>
      <button type="button" className="secondary-button" onClick={() => window.print()}><Printer size={15} /> Print layout</button>
    </div>
    <ol className="triangle-knit-steps" aria-label="Scarf knitting order">
      <li><b>Start waste</b><small>C6 · 8 columns</small></li>
      <li><b>Tapered starter</b><small>8 → {plan.endColumns} planned</small></li>
      <li><b>Draw and cast-on</b><small>C1 draw · {plan.endColumns} planned</small></li>
      <li><b>Scarf body</b><small>{plan.endColumns} → {plan.columns} → {plan.endColumns}</small></li>
      <li><b>Top waste</b><small>C6 · 8 rounds planned</small></li>
      <li><b>Release</b><small>Secure both faces by hand</small></li>
    </ol>
    {placement && <p>Count from the left while facing the machine, starting at 1. The planned tip uses positions {placement.firstNeedle}–{placement.tipLastNeedle} on both beds. The left edge stays at {placement.firstNeedle}, and the right edge reaches {placement.widestLastNeedle} at full width.</p>}
    <figure className="triangle-figure">
      <div className="triangle-stage">
        <img src={image} alt="Front stitch chart with the two-column edge allowance marked on both sides"
          style={{ aspectRatio: `${target.longEdgeCm} / ${target.depthCm}` }} />
      </div>
      <figcaption>Planned body · {plan.rows} design rows read left to right · Highlighted columns are reserved for the linked edges</figcaption>
    </figure>
    <section className="triangle-reference" aria-labelledby="tip-reference-heading">
      <h3 id="tip-reference-heading">Exact waste and cast-on from the knitted tip swatch</h3>
      <p>The reference ran on two columns at the tips. This chart uses {plan.endColumns}-column tips. Its machine passes are pending.</p>
      <label className="triangle-screen-reference">Reference section <select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
        {phases.map((item, i) => <option key={item.name} value={i}>{item.name} · passes {item.from}–{item.to}</option>)}
      </select></label>
      <p className="triangle-screen-reference">{phase.note}</p>
      <div className="tip-pass-scroll triangle-screen-reference" tabIndex={0} aria-label={`${phase.name} pass table`}>
        <TipPassTable phase={phase} />
      </div>
      <div className="triangle-print-reference">
        {phases.map((section) => <section key={section.from}>
          <h4>{section.name} · passes {section.from}–{section.to}</h4>
          <p>{section.note}</p>
          <TipPassTable phase={section} />
        </section>)}
      </div>
      <p className="triangle-legend">K knit · T tuck · X transfer out · R receive · S split · D drop · · no stitch operation</p>
      <a href="https://gist.github.com/xjhc/12fe18e2aec8b6281c682bc840facc6e" target="_blank" rel="noreferrer">378-pass tip swatch and instructions</a>
    </section>
  </div>;
}
