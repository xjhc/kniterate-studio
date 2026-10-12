import type { MachineSetup, ProjectState } from '@kniterate-studio/project-contract';
import { CUSTOMIST_STANDARD_WASTE_PASSES_V1, customistWastePassesV1 } from '@kniterate-studio/machine-lib/browser';
import { NumberInput, Section } from './panel';

/**
 * The machine's start and finish, the same section for every kind of
 * project. Each setting is the construction's reference (Kniterate's own
 * files) until you set your own; a short waste section warns, it never
 * refuses: the machine checks still refuse anything it cannot knit.
 */

type Construction = keyof typeof CUSTOMIST_STANDARD_WASTE_PASSES_V1;

/** Below this many waste rows the fabric may not reach the rollers before the piece starts (Kniterate's default is 80, and ~70 is the usual floor). */
export const SHORT_WASTE_ROWS = 70;

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
    warning: wasteRows < SHORT_WASTE_ROWS ? `Below about ${SHORT_WASTE_ROWS} rows the fabric may not reach the rollers before your piece starts.` : null,
  };
}

export function MachineSetupSection({ state, onChange }: { state: ProjectState; onChange: (setup: MachineSetup | null, label: string) => void }) {
  const construction = wasteConstruction(state);
  const words = machineSetupWords(state.setup, construction);
  const save = (next: MachineSetup, label: string) => onChange(Object.keys(next).length === 0 ? null : next, label);
  const setWaste = (rows: number | null) => {
    const { wasteRows: _drop, ...rest } = state.setup ?? {};
    save(rows === null || rows === words.standard ? rest : { ...rest, wasteRows: rows }, rows === null ? 'Standard waste yarn' : `Waste yarn ${rows} rows`);
  };
  const setDraw = (on: boolean) => {
    const { drawThread: _drop, ...rest } = state.setup ?? {};
    save(on ? rest : { ...rest, drawThread: false }, on ? 'Draw thread' : 'No draw thread');
  };
  return <Section id="machine" title="Machine settings" defaultOpen={false} aside={<em className={`section-aside${words.warning ? ' warn' : ''}`}>{words.own ? 'your own' : 'standard'}</em>}>
    <div className="field-row">
      <span>Waste yarn</span>
      <NumberInput label="Waste yarn rows" value={words.wasteRows} min={4} max={200} step={2} suffix="rows" onCommit={(rows) => setWaste(Math.round(rows))} />
    </div>
    <p className={`design-hint${words.warning ? ' warn' : ''}`} role={words.warning ? 'alert' : undefined}>
      {words.warning ?? `Knitted before your piece so the rollers can grip it. Standard: ${words.standard} rows, from Kniterate's own files.`}
      {state.setup?.wasteRows !== undefined && <> <button type="button" className="link-button" onClick={() => setWaste(null)}>Use the standard {words.standard}</button></>}
    </p>
    {words.drawThread !== null && <>
      <label className="check-label"><input type="checkbox" checked={words.drawThread} onChange={(event) => setDraw(event.currentTarget.checked)} />Draw thread (C1)</label>
      <p className="design-hint">{words.drawThread ? 'Pulled out after knitting to free your piece from the waste yarn.' : 'Without one, unravel or cut the waste yarn away after knitting.'}</p>
    </>}
  </Section>;
}
