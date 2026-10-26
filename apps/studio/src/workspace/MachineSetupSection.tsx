import { beanieObjectOf, type MachineSetup, type ProjectState, type SectionSettings } from '@kniterate-studio/project-contract';
import { CUSTOMIST_MIN_WASTE_PASSES_V1, CUSTOMIST_STANDARD_BODY_SETTINGS_V1, CUSTOMIST_STANDARD_SECTION_SETTINGS_V1, CUSTOMIST_STANDARD_TOP_WASTE_ROWS_V1, CUSTOMIST_STANDARD_WASTE_PASSES_V1, EIGHT_LINE_CROWN_V1, customistTopWasteRowsV1, customistWastePassesV1 } from '@kniterate-studio/machine-lib/browser';
import { sectionLimits, type SetupSection } from '../machineSetup';
import { Chips, NumberInput, Section } from './panel';

/**
 * The machine's start and finish, the same section for every kind of
 * project. Each setting is the construction's reference (Kniterate's own
 * files) until you set your own. The inputs stay inside the machine-safety
 * envelope; a waste section too short for the rollers, or a setting outside
 * the envelope, is refused when the project compiles.
 */

type Construction = keyof typeof CUSTOMIST_STANDARD_WASTE_PASSES_V1;

/** Which reference start a project knits with: a colour chart's backing, or the flat start every garment and scarf shares. */
export function wasteConstruction(state: ProjectState): Construction {
  if (state.object !== undefined) return 'flat';
  const colours = new Set(state.chart.cells.flat()).size;
  return colours >= 2 && state.strategy.technique === 'birdseye' ? 'birdseye' : 'fairisle';
}

/** What the section shows: the waste rows knitted (the reference's parity kept), the standard, and a warning when short. */
export function machineSetupWords(setup: MachineSetup | undefined, construction: Construction): { wasteRows: number; standard: number; drawThread: boolean | null; own: boolean; warning: string | null } {
  const standard = CUSTOMIST_STANDARD_WASTE_PASSES_V1[construction];
  const wasteRows = setup?.wasteRows === undefined ? standard : customistWastePassesV1(construction, setup.wasteRows);
  return {
    wasteRows,
    standard,
    // Only the flat start has a draw thread: the chart references knit without one.
    drawThread: construction === 'flat' ? setup?.drawThread !== false : null,
    own: setup !== undefined && Object.keys(setup).length > 0,
    warning: wasteRows < CUSTOMIST_MIN_WASTE_PASSES_V1 ? `Below ${CUSTOMIST_MIN_WASTE_PASSES_V1} rows the fabric may not reach the rollers before your piece starts, so no program is made.` : null,
  };
}

type Top = 'bind-off' | 'waste';
type Standard = Required<SectionSettings>;

/** The reference's body settings for this project, or null when it has no body to set (a beanie all in rib). */
export function bodyStandard(state: ProjectState): Standard | null {
  if (state.object?.kind === 'beanie' && beanieObjectOf(state)?.construction !== 'rib-cuff-jersey-body') return null;
  const birdseye = state.object?.kind === 'beanie' ? state.strategy.technique === 'birdseye' : wasteConstruction(state) === 'birdseye';
  return CUSTOMIST_STANDARD_BODY_SETTINGS_V1[birdseye ? 'birdseye' : 'fairisle'];
}

/** Each section a project can set, in knitting order, with its reference: a chart its waste and body; a flat piece its waste, cast-on, rib (when it has one), body and transfers. */
export function sectionStandards(state: ProjectState): { key: SetupSection; label: string; standard: Standard; note?: string }[] {
  const construction = wasteConstruction(state);
  const body = bodyStandard(state);
  if (construction !== 'flat') return [{ key: 'waste', label: 'Waste', standard: CUSTOMIST_STANDARD_SECTION_SETTINGS_V1[construction].waste }, ...(body ? [{ key: 'body' as const, label: 'Body', standard: body }] : [])];
  const flat = CUSTOMIST_STANDARD_SECTION_SETTINGS_V1.flat;
  const object = state.object;
  const rib = object?.kind !== 'panel' || object.ends.cm > 0;
  return [
    { key: 'waste', label: 'Waste', standard: flat.waste },
    { key: 'castOn', label: 'Cast-on', standard: flat.castOn },
    ...(rib ? [{ key: 'rib' as const, label: 'Rib', standard: flat.rib }] : []),
    ...(body ? [{ key: 'body' as const, label: 'Body', standard: body }] : []),
    // A beanie's crown transfers too: at its own reference settings until you set yours.
    { key: 'transfers', label: 'Transfers', standard: flat.transfers, ...(object?.kind === 'beanie' ? { note: `Until you set your own, the crown keeps Kniterate's transfer settings (speed ${EIGHT_LINE_CROWN_V1.xferSpeed}).` } : {}) },
  ];
}

/** Inside the inputs' range but outside what Kniterate's own files use, a setting warns. */
export function settingsWarning(value: SectionSettings | undefined): string | null {
  if (value?.speed !== undefined && (value.speed < 60 || value.speed > 700)) return "Kniterate's own files keep the speed between 60 and 700.";
  if (value?.roller !== undefined && (value.roller < 0 || value.roller > 600)) return "Kniterate's own files keep the roller between 0 and 600.";
  return null;
}

/** One section's stitch size, speed and roller, each the standard until you set it. */
function SectionSettingsFields({ id, section, label, value, standard, note, onChange }: { id: string; section: SetupSection; label: string; value: SectionSettings | undefined; standard: Standard; note?: string; onChange: (next: SectionSettings | undefined, what: string) => void }) {
  const set = (key: keyof SectionSettings, name: string, raw: number) => {
    const next = key === 'stitch' ? Math.round(raw) : raw;
    const { [key]: _drop, ...rest } = value ?? {};
    const merged = next === standard[key] ? rest : { ...rest, [key]: next };
    onChange(Object.keys(merged).length > 0 ? merged : undefined, `${label} ${name} ${next}`);
  };
  // Spoken in full ("Body stitch size"): "Body stitch" is the stitch you knit.
  const field = (key: keyof SectionSettings, name: string, min: number, max: number, step: number) => <label>
    <span>{name}</span>
    <NumberInput label={`${label} ${key === 'stitch' ? 'stitch size' : name.toLowerCase()}`} value={value?.[key] ?? standard[key]} min={min} max={max} step={step} onCommit={(next) => set(key, key === 'stitch' ? 'stitch size' : name.toLowerCase(), next)} />
  </label>;
  const warning = settingsWarning(value);
  const limits = sectionLimits(section);
  return <fieldset className="gauge-fields section-settings" id={id}>
    <legend>{label}</legend>
    <div className="gauge-row">{field('stitch', 'Stitch', limits.stitch.min, limits.stitch.max, 1)}{field('speed', 'Speed', limits.speed.min, limits.speed.max, 10)}{field('roller', 'Roller', limits.roller.min, limits.roller.max, 10)}</div>
    <p className={`design-hint${warning ? ' warn' : ''}`} role={warning ? 'alert' : undefined}>
      {warning ?? `Standard: stitch ${standard.stitch}, speed ${standard.speed}, roller ${standard.roller}.${note && !value ? ` ${note}` : ''}`}
      {value && <> <button type="button" className="link-button" onClick={() => onChange(undefined, `Standard ${label.toLowerCase()} settings`)}>Use the standard</button></>}
    </p>
  </fieldset>;
}

/**
 * `objectTop`: a sweater's or scarf's top, which is part of its design (the
 * object), set here beside the start. A chart's top is its setup's; a
 * beanie's crown gathers it closed.
 */
export function MachineSetupSection({ state, onChange, objectTop }: {
  state: ProjectState;
  onChange: (setup: MachineSetup | null, label: string) => void;
  objectTop?: { value: Top; onChange: (top: Top) => void };
}) {
  const construction = wasteConstruction(state);
  const words = machineSetupWords(state.setup, construction);
  const beanie = state.object?.kind === 'beanie';
  // A chart's reference ends on closing waste; a sweater's or scarf's top is bound off unless set.
  const top: Top = objectTop?.value ?? state.setup?.top ?? 'waste';
  const topStandard = CUSTOMIST_STANDARD_TOP_WASTE_ROWS_V1[construction];
  const topRows = state.setup?.topWasteRows === undefined ? topStandard : construction === 'flat' ? state.setup.topWasteRows : customistTopWasteRowsV1(state.setup.topWasteRows);
  const save = (next: MachineSetup, label: string) => onChange(Object.keys(next).length === 0 ? null : next, label);
  const setWaste = (rows: number | null) => {
    const { wasteRows: _drop, ...rest } = state.setup ?? {};
    save(rows === null || rows === words.standard ? rest : { ...rest, wasteRows: rows }, rows === null ? 'Standard waste yarn' : `Waste yarn ${rows} rows`);
  };
  const setDraw = (on: boolean) => {
    const { drawThread: _drop, ...rest } = state.setup ?? {};
    save(on ? rest : { ...rest, drawThread: false }, on ? 'Draw thread' : 'No draw thread');
  };
  const setTop = (next: Top) => {
    if (objectTop) { objectTop.onChange(next); return; }
    const { top: _drop, ...rest } = state.setup ?? {};
    save(next === 'waste' ? rest : { ...rest, top: next }, next === 'waste' ? 'Finish on waste yarn' : 'Bind off the top');
  };
  const sections = sectionStandards(state);
  const ownSections = sections.some((section) => state.setup?.[section.key] !== undefined);
  const setSection = (key: SetupSection, next: SectionSettings | undefined, label: string) => {
    const { [key]: _drop, ...rest } = state.setup ?? {};
    save(next ? { ...rest, [key]: next } : rest, label);
  };
  const setTopRows = (rows: number | null) => {
    const { topWasteRows: _drop, ...rest } = state.setup ?? {};
    save(rows === null || rows === topStandard ? rest : { ...rest, topWasteRows: rows }, rows === null ? 'Standard waste on top' : `Waste on top ${rows} rows`);
  };
  return <Section id="machine" title="Machine settings" defaultOpen={false} aside={<em className={`section-aside${words.warning ? ' warn' : ''}`}>{words.own ? 'your own' : 'standard'}</em>}>
    <div className="field-row">
      <span>Waste yarn</span>
      <NumberInput label="Waste yarn rows" value={words.wasteRows} min={CUSTOMIST_MIN_WASTE_PASSES_V1} max={200} step={2} suffix="rows" onCommit={(rows) => setWaste(Math.round(rows))} />
    </div>
    <p className={`design-hint${words.warning ? ' warn' : ''}`} role={words.warning ? 'alert' : undefined}>
      {words.warning ?? `Knitted before your piece so the rollers can grip it. Standard: ${words.standard} rows, from Kniterate's own files.`}
      {state.setup?.wasteRows !== undefined && <> <button type="button" className="link-button" onClick={() => setWaste(null)}>Use the standard {words.standard}</button></>}
    </p>
    {words.drawThread !== null && <>
      <label className="check-label"><input type="checkbox" checked={words.drawThread} onChange={(event) => setDraw(event.currentTarget.checked)} />Draw thread (C1)</label>
      <p className="design-hint">{words.drawThread ? 'Pulled out after knitting to free your piece from the waste yarn.' : 'Without one, unravel or cut the waste yarn away after knitting.'}</p>
    </>}
    {beanie
      ? <p className="design-hint">The top: the crown gathers it closed.</p>
      : <>
        <div className="field-row"><span>Top</span><Chips label="Top edge" value={top} options={[
          { id: 'bind-off', name: 'Bind off', note: objectTop ? 'The machine binds off the top.' : 'A machine chain bind-off. Kniterate\'s own chart files end on waste yarn.' },
          { id: 'waste', name: 'Waste yarn', note: 'Live stitches on waste yarn, to bind off or graft by hand.' },
        ]} onPick={setTop} /></div>
        {top === 'waste' && <>
          <div className="field-row"><span>Waste on top</span><NumberInput label="Waste rows on top" value={topRows} min={2} max={100} step={construction === 'flat' ? 1 : 2} suffix="rows" onCommit={(rows) => setTopRows(Math.round(rows))} /></div>
          <p className="design-hint">Standard: {topStandard} rows.{state.setup?.topWasteRows !== undefined && <> <button type="button" className="link-button" onClick={() => setTopRows(null)}>Use the standard {topStandard}</button></>}</p>
        </>}
      </>}
    <details className="machine-sections" open={ownSections}>
      <summary>Speed, roller and stitch size</summary>
      {sections.map((section) => <SectionSettingsFields key={section.key} id={`machine.${section.key}`} section={section.key} label={section.label} value={state.setup?.[section.key]} standard={section.standard} {...(section.note ? { note: section.note } : {})} onChange={(next, label) => setSection(section.key, next, label)} />)}
    </details>
  </Section>;
}
