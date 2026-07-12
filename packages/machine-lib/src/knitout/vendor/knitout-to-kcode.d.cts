declare const converter: {
  knitoutToPasses: (knitout: string, filename: string) => { headers: Record<string, string[]>; passes: unknown[] };
  passesToKCode: (headers: Record<string, string[]>, passes: unknown[], filename: string) => string;
};

export = converter;
