import type { KCodeArtifact } from '../kcode/kcodeProtocol';

export type ProgramRegion = 'waste' | 'draw' | 'body' | 'finish';

export const CARRIER_COLORS: Record<string, string> = {
  '1': '#d95d48', '2': '#33866a', '3': '#d49b32', '4': '#4e75b8', '5': '#9b60a8', '6': '#b65378',
};

const programRegionCache = new WeakMap<KCodeArtifact, readonly ProgramRegion[]>();

export function programRegionsForKCode(kcode: KCodeArtifact): readonly ProgramRegion[] {
  const cached = programRegionCache.get(kcode);
  if (cached) return cached;
  const passes = kcode.scene?.passes ?? [];
  let firstBody = passes.length;
  let lastBody = -1;
  for (const item of kcode.passProvenance) {
    if (item.sourceRows.length === 0) continue;
    firstBody = Math.min(firstBody, item.passIndex);
    lastBody = Math.max(lastBody, item.passIndex);
  }
  const regions = passes.map((pass, index): ProgramRegion => {
    if (lastBody === -1) return pass.carrier === '1' ? 'draw' : 'waste';
    if (index >= firstBody && index <= lastBody) return 'body';
    if (index > lastBody) return 'finish';
    if (pass.carrier === '1') return 'draw';
    return 'waste';
  });
  programRegionCache.set(kcode, regions);
  return regions;
}

export function programRegionForPass(kcode: KCodeArtifact, index: number): ProgramRegion {
  return programRegionsForKCode(kcode)[index] ?? 'body';
}
