import {
  parseColorworkChartV1,
  type ColorworkChartV1,
} from '@kniterate-studio/chart-contract';
import type {
  KnitlabChartState,
  KnitlabKeyDefinition,
  KnitlabKeyInstance,
} from './knitlab1-contract.js';

export interface ProjectedColorworkChart {
  artifact: ColorworkChartV1;
  chart: KnitlabChartState;
  palette: KnitlabKeyDefinition[];
}

/**
 * Studio intake adapter. ColorworkChartV1 remains the durable project source;
 * this projection exists only to feed the proven machine compiler.
 */
export function projectColorworkChartV1(value: unknown): ProjectedColorworkChart {
  const artifact = parseColorworkChartV1(value);
  const palette: KnitlabKeyDefinition[] = artifact.palette.map((entry) => ({
    id: entry.id,
    name: entry.name,
    width: 1,
    height: 1,
    backgroundColor: entry.hex,
    symbolColor: '#111111',
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  }));
  const placements: KnitlabKeyInstance[] = [];
  // ColorworkChartV1 cells are canvas order (top to bottom). The proven
  // compiler's row 0 is always the cast-on edge, so normalize the machine
  // projection to bottom-up without changing the durable artifact.
  for (let row = 0; row < artifact.height; row += 1) {
    const artifactRow = artifact.height - row - 1;
    for (let column = 0; column < artifact.width; column += 1) {
      placements.push({
        anchor: { x: column, y: row },
        keyId: artifact.palette[artifact.cells[artifactRow]![column]!]!.id,
      });
    }
  }

  return {
    artifact,
    palette,
    chart: {
      id: 'colorwork-chart-v1',
      rows: artifact.height,
      cols: artifact.width,
      orientation: 'bottom-up',
      name: artifact.title ?? 'Imported colorwork chart',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [{
        id: 'colorwork',
        name: 'Colorwork',
        isVisible: true,
        kind: 'color',
        grid: {},
        keyPlacements: placements,
      }],
      activeLayerId: 'colorwork',
    },
  };
}
