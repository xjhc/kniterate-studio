import type { MachineSetup, SectionSettings } from '@kniterate-studio/project-contract';
import {
  CUSTOMIST_MIN_WASTE_PASSES_V1,
  CUSTOMIST_RIB_STITCH_STEP_V1,
  KNITERATE_7GG_MACHINE_SAFETY_ENVELOPE_V1,
  customistWastePassesV1,
  type FlatSectionSettingsV1,
} from '@kniterate-studio/machine-lib/browser';

/** A flat piece's own waste, cast-on, rib, transfer and (a beanie's) crown settings, for its construction; null when it sets none, so the program is unchanged. */
export function flatSections(setup: MachineSetup | undefined): { sections: FlatSectionSettingsV1 } | null {
  const sections: FlatSectionSettingsV1 = {
    ...(setup?.waste ? { waste: setup.waste } : {}),
    ...(setup?.castOn ? { castOn: setup.castOn } : {}),
    ...(setup?.rib ? { rib: setup.rib } : {}),
    ...(setup?.transfers ? { transfers: setup.transfers } : {}),
    ...(setup?.crown ? { crown: setup.crown } : {}),
  };
  return Object.keys(sections).length > 0 ? { sections } : null;
}

export type SetupSection = 'waste' | 'castOn' | 'rib' | 'body' | 'transfers' | 'crown';
type SetupConstruction = 'fairisle' | 'birdseye' | 'flat';

const SECTION_NAMES: Record<SetupSection, string> = { waste: 'Waste', castOn: 'Cast-on', rib: 'Rib', body: 'Body', transfers: 'Transfers', crown: 'Crown' };

/**
 * What a section's own settings may be: the machine-safety envelope, with the
 * transfer limits for transfers and, for a rib, room for its rear bed's
 * smaller stitch.
 */
export function sectionLimits(section: SetupSection): Record<keyof SectionSettings, { min: number; max: number }> {
  const envelope = KNITERATE_7GG_MACHINE_SAFETY_ENVELOPE_V1;
  const transfers = section === 'transfers';
  return {
    stitch: { min: transfers ? 0 : envelope.loopFormingStitch.min + (section === 'rib' ? CUSTOMIST_RIB_STITCH_STEP_V1 : 0), max: 15 },
    speed: { min: envelope.speed.min, max: transfers ? envelope.transfer.maxSpeed : envelope.speed.max },
    roller: { min: envelope.roller.min, max: transfers ? envelope.transfer.maxRoller : envelope.roller.max },
  };
}

/**
 * A project's own machine settings outside Studio's machine-safety envelope.
 * Each blocks compiling, so no program is exported. These are Studio's
 * limits, from Kniterate's documentation and its own files, not measured
 * hardware limits, and a value inside them is not tested with any yarn. A
 * fairisle chart uses its waste, cast-on and body, a birdseye chart its waste
 * and body, and a flat piece every section; a chart with a bind-off top also
 * uses its bind-off. A setting the construction doesn't use is kept and
 * ignored, as a chart's rib settings are, so switching the backing or the top
 * never leaves a project blocked by a setting the panel no longer shows.
 */
export function machineSetupErrors(setup: MachineSetup | undefined, construction: SetupConstruction): { rule: string; message: string }[] {
  const errors: { rule: string; message: string }[] = [];
  if (setup?.wasteRows !== undefined) {
    const passes = customistWastePassesV1(construction, setup.wasteRows);
    if (passes < CUSTOMIST_MIN_WASTE_PASSES_V1) {
      errors.push({ rule: 'project-waste-too-short', message: `The waste knits ${passes} rows; Studio needs at least ${CUSTOMIST_MIN_WASTE_PASSES_V1}, because with fewer the fabric may not reach the rollers before your piece starts, and without pull-down the knitting fails.` });
    }
  }
  const castOnRoller = setup?.castOn?.tubularRoller;
  const rollerLimits = sectionLimits('castOn').roller;
  if (castOnRoller !== undefined && (castOnRoller < rollerLimits.min || castOnRoller > rollerLimits.max)) errors.push({ rule: 'project-setting-outside-machine-range', message: `Cast-on tubular roller ${castOnRoller} is outside Studio's safety limits for the machine (${rollerLimits.min} to ${rollerLimits.max}).` });
  const bindOffStitch = setup?.bindOff?.stitch;
  const stitchLimits = sectionLimits('body').stitch;
  if (bindOffStitch !== undefined && (bindOffStitch < stitchLimits.min || bindOffStitch > stitchLimits.max)) errors.push({ rule: 'project-setting-outside-machine-range', message: `Bind-off stitch size ${bindOffStitch} is outside Studio's safety limits for the machine (${stitchLimits.min} to ${stitchLimits.max}).` });
  const sections: readonly SetupSection[] = construction === 'flat' ? ['waste', 'castOn', 'rib', 'body', 'transfers', 'crown'] : construction === 'fairisle' ? ['waste', 'castOn', 'body'] : ['waste', 'body'];
  for (const section of sections) {
    const limits = sectionLimits(section);
    for (const key of ['stitch', 'speed', 'roller'] as const) {
      const value = setup?.[section]?.[key];
      if (value === undefined || (value >= limits[key].min && value <= limits[key].max)) continue;
      errors.push({ rule: 'project-setting-outside-machine-range', message: `${SECTION_NAMES[section]} ${key === 'stitch' ? 'stitch size' : key} ${value} is outside Studio's safety limits for the machine (${limits[key].min} to ${limits[key].max}).` });
    }
  }
  return errors;
}
