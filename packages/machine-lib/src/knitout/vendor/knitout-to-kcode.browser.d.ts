export function knitoutToPasses(knitout: string, filename: string): {
  headers: Record<string, string[]>;
  passes: unknown[];
  lowering: import('../kniterate/vendor-pass-contract.js').VendorLoweringSettings;
};

export function passesToKCode(headers: Record<string, string[]>, passes: unknown[], filename: string): string;

export function passesToKCodeWithTrace(
  headers: Record<string, string[]>,
  passes: unknown[],
  filename: string,
  lowering?: import('../kniterate/vendor-pass-contract.js').VendorLoweringSettings,
): import('../kniterate/vendor-pass-contract.js').VendorScheduledKCode;
