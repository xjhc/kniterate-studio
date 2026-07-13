export function knitoutToPasses(knitout: string, filename: string): {
  headers: Record<string, string[]>;
  passes: unknown[];
};

export function passesToKCode(headers: Record<string, string[]>, passes: unknown[], filename: string): string;
