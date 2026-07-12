export interface Point { column: number; row: number; }
export interface Rect { left: number; top: number; right: number; bottom: number; }

export interface PixelChart {
  width: number;
  height: number;
  cells: readonly (readonly number[])[];
}

export interface PixelCell extends Point { paletteIndex: number; }
export interface PaintMutation { kind: 'paint'; cells: PixelCell[]; }
export type PixelMutation = PaintMutation;

export interface PixelClipboard {
  width: number;
  height: number;
  cells: number[][];
}
