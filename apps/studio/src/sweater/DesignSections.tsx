import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { ProjectEdit } from '@kniterate-studio/project-contract';
import type { gaugeFabrics } from '../fabric';
import { GaugeFields, SwatchAside, swatchWords, type GaugeValue } from '../workspace/gauge';
import { Section } from '../workspace/panel';
import { TEXTURES, textureMatching } from './textures';
import { TextureEditor, TextureSwatch } from './TextureSwatch';

/** The parts of a design panel every flat-piece project shares: the stitch, and the yarn with its gauges. */

export type Operate = (label: string, edits: ProjectEdit[]) => boolean;
type Body = { name: string; texture: string[] };

/** The stitch: the library, or one of your own. The gauge follows the stitch by the rule for a change of fabric (`fabric.ts`). */
export function StitchSection({ body, hex, onChange }: { body: { name: string; texture: readonly string[] }; hex: string; onChange: (label: string, body: Body) => void }) {
  const [editingTexture, setEditingTexture] = useState(false);
  const library = textureMatching(body.texture);
  return <Section title="Stitch" aside={<em className="section-aside">{body.name}</em>}>
      <div className="texture-grid" role="radiogroup" aria-label="Body stitch">
        {TEXTURES.map((texture) => <button key={texture.id} type="button" role="radio" aria-checked={library?.id === texture.id} className={library?.id === texture.id ? 'active' : ''} title={texture.note} onClick={() => {
          if (library?.id === texture.id) return;
          onChange(`${texture.name}`, { name: texture.name, texture: [...texture.rows] });
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
        <TextureEditor rows={body.texture} hex={hex} onChange={(rows) => { onChange('Edit the stitch', { name: textureMatching(rows)?.name ?? 'Custom stitch', texture: rows }); }} />
        {editingTexture && <button type="button" className="link-button" onClick={() => setEditingTexture(false)}>Done</button>}
      </div>}
    </Section>;
}

/** The yarn (colour and name) and the gauges, with whether each was measured. */
export function YarnGaugeSection({ yarn, carrier, bodyName, fabrics, gauge, ribGauge, operate, onRibGauge }: {
  yarn: { id: string; name: string; hex: string };
  carrier: string;
  bodyName: string;
  /** What each gauge is measured on, for the words. */
  fabrics: ReturnType<typeof gaugeFabrics>;
  gauge: GaugeValue;
  /** Null when the project has no rib. */
  ribGauge: GaugeValue | null;
  operate: Operate;
  onRibGauge: (next: GaugeValue, label: string) => void;
}) {
  const setGauge = (next: GaugeValue, label: string) => operate(label, [{ kind: 'set-gauge', gauge: { ...next } }]);
  const swatch = swatchWords([{ gauge, fabric: fabrics.body?.name ?? 'your stitch' }, ...(ribGauge ? [{ gauge: ribGauge, fabric: fabrics.rib?.name ?? 'rib' }] : [])]);
  return <Section id="swatch" title="Yarn & swatch" aside={<SwatchAside aside={swatch.aside} />}>
    <label className="yarn-row"><input type="color" value={yarn.hex} aria-label="Yarn colour" onChange={(event) => operate('Yarn colour', [{ kind: 'set-palette-entry', paletteId: yarn.id, name: yarn.name, hex: event.currentTarget.value.toUpperCase() }])} />
      <input type="text" defaultValue={yarn.name} key={yarn.name} aria-label="Yarn name" onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name && name !== yarn.name) operate(`Yarn: ${name}`, [{ kind: 'set-palette-entry', paletteId: yarn.id, name, hex: yarn.hex }, { kind: 'set-yarn-assignment', assignment: { paletteId: yarn.id, carrier: carrier as '2' | '3' | '4' | '5', yarnName: name } }]); }} />
    </label>
    <p className="design-hint">{swatch.hint}</p>
    <GaugeFields id="gauge.body" label={`${bodyName} gauge`} gauge={gauge} onCommit={(next) => setGauge(next, `Body gauge ${next.stitchesPer10cm}/${next.rowsPer10cm} (${next.source})`)} />
    {ribGauge && <GaugeFields id="gauge.rib" label="Rib gauge" gauge={ribGauge} onCommit={(next) => onRibGauge(next, `Rib gauge ${next.stitchesPer10cm}/${next.rowsPer10cm} (${next.source})`)} />}
  </Section>;
}
