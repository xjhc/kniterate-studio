import { describe, expect, it } from 'vitest';
import { CHART_GUTTER, rowGutterActionAt, selectionMoveDestination } from './canvasCoordinates';
import { MIN_CHART_ZOOM, fitChartZoom } from './ColorworkCanvas';

describe('canvas interaction coordinates', () => {
  it('keeps fixed gutter hit testing independent of horizontal scroll', () => {
    expect(rowGutterActionAt(50, 8, 160, 16, 300)).toEqual({ kind: 'insert', row: 10 });
    expect(rowGutterActionAt(62, 8, 160, 16, 300)).toEqual({ kind: 'delete', row: 10 });
  });

  it('moves a selection by pointer delta rather than treating the endpoint as its origin', () => {
    expect(selectionMoveDestination(
      { left: 10, top: 20, right: 12, bottom: 22 },
      { column: 11, row: 21 },
      { column: 14, row: 25 },
    )).toEqual({ column: 13, row: 24 });
  });
});

describe('fitChartZoom', () => {
  it('fits the largest common chart entirely inside the viewport', () => {
    const viewport = { width: 560, height: 640 };
    const zoom = fitChartZoom(viewport, { width: 200, height: 300 });
    expect(CHART_GUTTER + 200 * 16 * zoom).toBeLessThanOrEqual(viewport.width);
    expect(300 * 16 * zoom).toBeLessThanOrEqual(viewport.height);
    expect(zoom).toBeGreaterThanOrEqual(MIN_CHART_ZOOM);
  });

  it('keeps room on the right when asked, for a garment piece\'s section labels', () => {
    const viewport = { width: 560, height: 640 };
    const zoom = fitChartZoom(viewport, { width: 200, height: 100 }, MIN_CHART_ZOOM, 96);
    expect(CHART_GUTTER + 200 * 16 * zoom + 96).toBeLessThanOrEqual(viewport.width);
    expect(zoom).toBeLessThan(fitChartZoom(viewport, { width: 200, height: 100 }));
  });

  it('only enlarges small charts when a project opens', () => {
    expect(fitChartZoom({ width: 560, height: 640 }, { width: 200, height: 300 }, 1)).toBe(1);
    expect(fitChartZoom({ width: 560, height: 640 }, { width: 4, height: 3 }, 1)).toBe(3);
  });
});
