declare const converter: {
  knitoutToPasses: (
    knitout: string,
    filename: string,
    resourceLimits?: import('../kniterate/vendor-pass-contract.js').VendorLoweringResourceLimits,
  ) => {
    headers: Record<string, string[]>;
    passes: unknown[];
    lowering: import('../kniterate/vendor-pass-contract.js').VendorLoweringSettings;
  };
  passesToKCode: (headers: Record<string, string[]>, passes: unknown[], filename: string) => string;
  passesToKCodeWithTrace: (
    headers: Record<string, string[]>,
    passes: unknown[],
    filename: string,
    lowering?: import('../kniterate/vendor-pass-contract.js').VendorLoweringSettings,
  ) => import('../kniterate/vendor-pass-contract.js').VendorScheduledKCode;
};

export = converter;
