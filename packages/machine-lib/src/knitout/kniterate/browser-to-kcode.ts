import vendorSource from '../vendor/knitout-to-kcode.cjs?raw';

interface VendorConverter {
  knitoutToPasses: (knitout: string, filename: string) => { headers: Record<string, string[]>; passes: unknown[] };
  passesToKCode: (headers: Record<string, string[]>, passes: unknown[], filename: string) => string;
}

const javascriptStart = vendorSource.indexOf('"use strict";');
if (javascriptStart < 0) throw new Error('Vendored k-code converter is missing its JavaScript entry marker.');
const loadVendor = new Function('module', 'exports', 'require', `${vendorSource.slice(javascriptStart)}\nreturn module.exports;`) as (
  module: { exports: Partial<VendorConverter> },
  exports: Partial<VendorConverter>,
  require: { (name: string): never; main?: unknown },
) => VendorConverter;
const moduleShim: { exports: Partial<VendorConverter> } = { exports: {} };
const requireShim = Object.assign((name: string): never => { throw new Error(`Browser converter cannot require "${name}".`); }, { main: undefined });
const converter = loadVendor(moduleShim, moduleShim.exports, requireShim);

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
  console.warn = (...values: unknown[]) => warnings.push(values.map(String).join(' '));
  try {
    const { headers, passes } = converter.knitoutToPasses(knitoutText, filename);
    return { ok: true, kcode: converter.passesToKCode(headers, passes, filename.replace(/\.k$/i, '.kc')), warnings };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), warnings };
  } finally {
    console.warn = originalWarn;
  }
}
