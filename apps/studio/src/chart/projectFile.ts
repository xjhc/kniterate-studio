import { parseColorworkChartV1Json } from '@kniterate-studio/chart-contract';
import {
  createColorworkProjectV1,
  parseColorworkProjectV1Json,
  type ColorworkProjectV1,
} from '@kniterate-studio/project-contract';

export type StudioProjectSource = 'project' | 'chart';

function projectId(title: string, suffix: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'colorwork';
  return `${slug}-${suffix}`;
}

export function openStudioProjectJson(
  json: string,
  idSuffix: () => string = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12),
): { project: ColorworkProjectV1; source: StudioProjectSource } {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new Error(`File is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const kind = typeof value === 'object' && value !== null && 'kind' in value ? (value as { kind?: unknown }).kind : undefined;
  if (kind === 'knitlab-colorwork-chart') {
    const chart = parseColorworkChartV1Json(json);
    return {
      project: createColorworkProjectV1(chart, {
        id: projectId(chart.title ?? 'colorwork', idSuffix()),
        title: chart.title,
      }),
      source: 'chart',
    };
  }
  return { project: parseColorworkProjectV1Json(json), source: 'project' };
}
