/**
 * Reading machine files for the Studio CLI: a strict KCode trace from a .kc,
 * and the atlas of Kniterate's own files in packages/machine-lib/reference.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  KNITERATE_7GG_KCODE_PROFILE_V2,
  parseKCodeDocument,
  projectKCodeMachineTrace,
  type MachineTraceV1,
  type TraceSectionV1,
} from '../../packages/machine-lib/src/browser.js';

export class MachineUsageError extends Error {}

export const REPOSITORY_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '../..');
export const REFERENCE_DIR = join(REPOSITORY_ROOT, 'packages/machine-lib/reference');

export interface AtlasEntry {
  name: string;
  file: string;
  sha256: string;
  dialect: 'app' | 'knitout-vendor';
  what: string;
  roles: { waste: string; draw: string | null };
  sections: TraceSectionV1[];
  notes: string;
}

export function atlas(): AtlasEntry[] {
  return (JSON.parse(readFileSync(join(REFERENCE_DIR, 'atlas.json'), 'utf8')) as { references: AtlasEntry[] }).references;
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export function traceOf(kcText: string, dialect?: 'app' | 'knitout-vendor'): MachineTraceV1 {
  for (const candidate of dialect ? [dialect] : (['knitout-vendor', 'app'] as const)) {
    const parsed = parseKCodeDocument(kcText, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: candidate, strict: true });
    if (parsed.ok) return projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2);
  }
  throw new MachineUsageError('Not a strict Kniterate KCode file (it does not parse in either dialect).');
}
