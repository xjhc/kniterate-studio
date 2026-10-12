import {
  AUTHORED_CAPACITY_LIMITS_V1,
  createColorworkProjectV1,
  parseColorworkProjectV1,
  type ColorworkProjectV1,
} from '@kniterate-studio/project-contract';

export type StudioProjectSource = 'project' | 'chart';
export const MAX_STUDIO_PROJECT_FILE_BYTES_V1 = AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits;

export interface StudioProjectFileV1 {
  readonly size: number;
  text(): Promise<string>;
}

function projectId(title: string, suffix: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'colorwork';
  return `${slug}-${suffix}`;
}

export function openStudioProjectJson(
  json: string,
  idSuffix: () => string = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12),
): { project: ColorworkProjectV1; source: StudioProjectSource } {
  if (json.length > AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits) {
    throw new Error(`Project source exceeds the ${AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits.toLocaleString('en-US')}-code-unit authored V1 limit.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new Error(`File is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const kind = typeof value === 'object' && value !== null && 'kind' in value ? (value as { kind?: unknown }).kind : undefined;
  if (kind === 'knitlab-colorwork-chart') {
    const title = typeof (value as { title?: unknown }).title === 'string'
      ? (value as { title: string }).title
      : 'colorwork';
    return {
      project: createColorworkProjectV1(value, {
        id: projectId(title, idSuffix()),
        title,
      }),
      source: 'chart',
    };
  }
  return { project: parseColorworkProjectV1(value), source: 'project' };
}

/** Refuse oversized browser files before `File.text()` duplicates their bytes. */
export async function openStudioProjectFile(
  file: StudioProjectFileV1,
  idSuffix?: () => string,
): Promise<{ project: ColorworkProjectV1; source: StudioProjectSource }> {
  if (file.size > MAX_STUDIO_PROJECT_FILE_BYTES_V1) {
    throw new Error(`Project file exceeds the ${MAX_STUDIO_PROJECT_FILE_BYTES_V1.toLocaleString('en-US')}-byte authored V1 limit.`);
  }
  return openStudioProjectJson(await file.text(), idSuffix);
}
