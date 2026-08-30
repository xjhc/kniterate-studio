import {
  knitoutToPasses,
  passesToKCode,
  passesToKCodeWithTrace,
} from '../vendor/knitout-to-kcode.browser.js';
import {
  checkKnitoutSourceResourceLimits,
  classifyKnitoutCapacityIssue,
  type KnitoutCapacityIssueV1,
  type KnitoutResourceProfileV1,
} from '../parser.js';
import {
  vendorLoweringResourceLimits,
  type VendorLoweringResourceLimits,
  type VendorLoweringSettings,
  type VendorScheduledKCode,
  type VendorScheduledPass,
} from './vendor-pass-contract.js';

interface VendorConverter {
  knitoutToPasses: (
    knitout: string,
    filename: string,
    resourceLimits?: VendorLoweringResourceLimits,
  ) => {
    headers: Record<string, string[]>;
    passes: unknown[];
    lowering: VendorLoweringSettings;
  };
  passesToKCode: (headers: Record<string, string[]>, passes: unknown[], filename: string) => string;
  passesToKCodeWithTrace: (
    headers: Record<string, string[]>,
    passes: unknown[],
    filename: string,
    lowering?: VendorLoweringSettings,
  ) => VendorScheduledKCode;
}

const browserConverter: VendorConverter = {
  knitoutToPasses,
  passesToKCode,
  passesToKCodeWithTrace,
};

export interface BrowserKCodeResult {
  ok: boolean;
  kcode?: string;
  error?: string;
  warnings?: readonly string[];
  /** Total backend warnings, including details omitted from the bounded array. */
  warningCount?: number;
  /** Exact post-lowering passes from the pinned backend. */
  scheduledPasses?: readonly VendorScheduledPass[];
  /** Exact authored-source to KCode placement selected by this lowering run. */
  coordinateMapping?: VendorScheduledKCode['coordinateMapping'];
  /** Named capacity refusal suitable for product-level diagnostics. */
  capacityIssue?: KnitoutCapacityIssueV1;
}

function convertBrowserKnitoutToKCode(
  knitoutText: string,
  filename: string,
  resourceProfile: KnitoutResourceProfileV1,
): BrowserKCodeResult {
  const warnings: string[] = [];
  let warningCount = 0;
  const captureWarning = (...values: unknown[]): void => {
    warningCount++;
    if (warnings.length < 512) warnings.push(values.map(String).join(' '));
  };
  const originalWarn = console.warn;
  const originalLog = console.log;
  const resourceIssue = checkKnitoutSourceResourceLimits(knitoutText, resourceProfile);
  if (resourceIssue !== null) {
    const message = `Line ${resourceIssue.line}: ${resourceIssue.message}`;
    const capacityIssue = classifyKnitoutCapacityIssue(message, resourceProfile);
    return {
      ok: false,
      error: message,
      warnings,
      warningCount,
      ...(capacityIssue === undefined ? {} : { capacityIssue }),
    };
  }
  console.warn = captureWarning;
  console.log = () => {};
  try {
    const { headers, passes, lowering } = browserConverter.knitoutToPasses(
      knitoutText,
      filename,
      vendorLoweringResourceLimits(resourceProfile),
    );
    const converted = browserConverter.passesToKCodeWithTrace(
      headers,
      passes,
      filename.replace(/\.k$/i, '.kc'),
      lowering,
    );
    return {
      ok: true,
      kcode: converted.kcode,
      scheduledPasses: converted.passes,
      coordinateMapping: converted.coordinateMapping,
      warnings,
      warningCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const capacityIssue = classifyKnitoutCapacityIssue(message, resourceProfile);
    return {
      ok: false,
      error: message,
      warnings,
      warningCount,
      ...(capacityIssue === undefined ? {} : { capacityIssue }),
    };
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
}

/** Browser-safe foreign-file adapter over the same vendored fork used by Node. */
export function browserKnitoutToKCode(
  knitoutText: string,
  filename = 'blanket.k',
): BrowserKCodeResult {
  return convertBrowserKnitoutToKCode(knitoutText, filename, 'foreign-v1');
}

/** Browser-safe authored V1 adapter with the fixed large-canvas envelope. */
export function browserAuthoredKnitoutToKCode(
  knitoutText: string,
  filename = 'blanket.k',
): BrowserKCodeResult {
  return convertBrowserKnitoutToKCode(knitoutText, filename, 'authored-v1');
}
