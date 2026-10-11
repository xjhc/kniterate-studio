import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { ProjectEdit, ProjectGauge } from '@kniterate-studio/project-contract';
import { NumberInput, Section } from '../workspace/panel';
import { TEXTURES, textureMatching } from './textures';
import { TextureEditor, TextureSwatch } from './TextureSwatch';

/** The parts of a design panel every flat-piece project shares: the stitch, and the yarn with its gauges. */

export type Operate = (label: string, edits: ProjectEdit[]) => boolean;
type GaugeValue = Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'>;
type Body = { name: string; texture: string[] };

/** The stitch: the library, or one of your own. Choosing one while the gauge is assumed takes its typical gauge. */
export function StitchSection({ body, hex, gaugeAssumed, onChange }: { body: { name: string; texture: readonly string[] }; hex: string; gaugeAssumed: boolean; onChange: (label: string, body: Body, edits: ProjectEdit[]) => void }) {
  const [editingTexture, setEditingTexture] = useState(false);
  const library = textureMatching(body.texture);
  return <Section title="Stitch" aside={<em className="section-aside">{body.name}</em>}>
      <div className="texture-grid" role="radiogroup" aria-label="Body stitch">
        {TEXTURES.map((texture) => <button key={texture.id} type="button" role="radio" aria-checked={library?.id === texture.id} className={library?.id === texture.id ? 'active' : ''} title={texture.note} onClick={() => {
          if (library?.id === texture.id) return;
          const edits: ProjectEdit[] = gaugeAssumed ? [{ kind: 'set-gauge', gauge: { ...texture.gauge, source: 'assumed' } }] : [];
          onChange(`${texture.name}`, { name: texture.name, texture: [...texture.rows] }, edits);
        }}>
          <TextureSwatch rows={texture.rows} hex={hex} size={8} columns={8} rowsShown={6} />
          <span>{texture.name}</span>
        </button>)}
        <button type="button" role="radio" aria-checked={library === undefined} className={`custom-texture${library === undefined ? ' active' : ''}`} onClick={() => setEditingTexture(true)}>
          {library === undefined ? <TextureSwatch rows={body.texture} hex={hex} size={8} columns={8} rowsShown={6} /> : <span className="custom-mark"><Pencil size={16} /></span>}
          <span>{library === undefined ? 'Your stitch' : 'Make your own'}</span>
        </button>
      </div>
      {library && <p className="design-hint">{library.note}</p>}
      {(editingTexture || library === undefined) && <div className="texture-editor-wrap">
        <TextureEditor rows={body.texture} hex={hex} onChange={(rows) => { onChange('Edit the stitch', { name: textureMatching(rows)?.name ?? 'Custom stitch', texture: rows }, []); }} />
        {editingTexture && <button type="button" className="link-button" onClick={() => setEditingTexture(false)}>Done</button>}
      </div>}
    </Section>;
}

/** The yarn (colour and name) and the gauges, with whether each was measured. */
export function YarnGaugeSection({ yarn, carrier, bodyName, gauge, ribGauge, operate, onRibGauge }: {
  yarn: { id: string; name: string; hex: string };
  carrier: string;
  bodyName: string;
  gauge: GaugeValue;
  /** Null when the project has no rib. */
  ribGauge: GaugeValue | null;
  operate: Operate;
  onRibGauge: (next: GaugeValue, label: string) => void;
}) {
  const setGauge = (next: GaugeValue, label: string) => operate(label, [{ kind: 'set-gauge', gauge: { ...next } }]);
  return <Section title="Yarn & gauge" aside={gauge.source === 'assumed' ? <em className="section-aside warn">assumed</em> : <em className="section-aside ok">measured</em>}>
    <label className="yarn-row"><input type="color" value={yarn.hex} aria-label="Yarn colour" onChange={(event) => operate('Yarn colour', [{ kind: 'set-palette-entry', paletteId: yarn.id, name: yarn.name, hex: event.currentTarget.value.toUpperCase() }])} />
      <input type="text" defaultValue={yarn.name} key={yarn.name} aria-label="Yarn name" onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name && name !== yarn.name) operate(`Yarn: ${name}`, [{ kind: 'set-palette-entry', paletteId: yarn.id, name, hex: yarn.hex }, { kind: 'set-yarn-assignment', assignment: { paletteId: yarn.id, carrier: carrier as '2' | '3' | '4' | '5', yarnName: name } }]); }} />
    </label>
    <GaugeRow label={`${bodyName} gauge`} gauge={gauge} onChange={(next) => setGauge(next, `Body gauge ${next.stitchesPer10cm}/${next.rowsPer10cm} (${next.source})`)} />
    {ribGauge && <GaugeRow label="Rib gauge" gauge={ribGauge} onChange={(next) => onRibGauge(next, `Rib gauge ${next.stitchesPer10cm}/${next.rowsPer10cm} (${next.source})`)} />}
    <p className="design-hint">{gauge.source === 'assumed' ? 'Gauges are typical values. Knit a swatch, measure stitches and rows over 10 cm, and enter them to get true sizes.' : 'Sizes come from your measured gauge.'}</p>
  </Section>;
}

function GaugeRow({ label, gauge, onChange }: { label: string; gauge: GaugeValue; onChange: (next: GaugeValue) => void }) {
  return <div className="gauge-row" role="group" aria-label={label}>
    <span>{label}</span>
    <NumberInput label={`${label} stitches per 10 cm`} value={gauge.stitchesPer10cm} min={5} max={60} step={0.5} suffix="st" onCommit={(stitchesPer10cm) => onChange({ ...gauge, stitchesPer10cm })} />
    <NumberInput label={`${label} rows per 10 cm`} value={gauge.rowsPer10cm} min={5} max={100} step={0.5} suffix="rows" onCommit={(rowsPer10cm) => onChange({ ...gauge, rowsPer10cm })} />
    <label className="measured-check"><input type="checkbox" checked={gauge.source === 'measured'} onChange={(event) => onChange({ ...gauge, source: event.currentTarget.checked ? 'measured' : 'assumed' })} />measured</label>
  </div>;
}
