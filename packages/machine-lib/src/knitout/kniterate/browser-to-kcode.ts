import { knitoutToPasses, passesToKCode } from '../vendor/knitout-to-kcode.browser.js';

interface VendorConverter {
  knitoutToPasses: (knitout: string, filename: string) => { headers: Record<string, string[]>; passes: unknown[] };
  passesToKCode: (headers: Record<string, string[]>, passes: unknown[], filename: string) => string;
}

const browserConverter: VendorConverter = { knitoutToPasses, passesToKCode };

export interface BrowserKCodeResult {
  ok: boolean;
  kcode?: string;
  error?: string;
  warnings?: readonly string[];
}

/** Browser-safe adapter over the same vendored converter used by Node. */
export function browserKnitoutToKCode(knitoutText: string, filename = 'blanket.k'): BrowserKCodeResult {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  const originalLog = console.log;
  console.warn = (...values: unknown[]) => warnings.push(values.map(String).join(' '));
  console.log = () => {};
  try {
    const { headers, passes } = browserConverter.knitoutToPasses(knitoutText, filename);
    return { ok: true, kcode: browserConverter.passesToKCode(headers, passes, filename.replace(/\.k$/i, '.kc')), warnings };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), warnings };
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
}
