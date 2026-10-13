import type { MachineSetup } from '@kniterate-studio/project-contract';
import type { FlatSectionSettingsV1 } from '@kniterate-studio/machine-lib/browser';

/** A flat piece's own waste, cast-on, rib and transfer settings, for its construction; null when it sets none, so the program is unchanged. */
export function flatSections(setup: MachineSetup | undefined): { sections: FlatSectionSettingsV1 } | null {
  const sections: FlatSectionSettingsV1 = {
    ...(setup?.waste ? { waste: setup.waste } : {}),
    ...(setup?.castOn ? { castOn: setup.castOn } : {}),
    ...(setup?.rib ? { rib: setup.rib } : {}),
    ...(setup?.transfers ? { transfers: setup.transfers } : {}),
  };
  return Object.keys(sections).length > 0 ? { sections } : null;
}
