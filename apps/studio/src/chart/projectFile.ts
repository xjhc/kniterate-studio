import { parseTriangleProject, type TriangleProject } from '../scarf/triangleProjectFile';
import { triangleDraftKind } from '../scarf/triangle';
import {
  AUTHORED_CAPACITY_LIMITS_V1,
  createColorworkProjectV1,
  InvalidColorworkProjectError,
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

function readProjectJson(json: string): unknown {
  if (json.length > AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits) {
    throw new Error(`Project source exceeds the ${AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits.toLocaleString('en-US')}-code-unit authored V1 limit.`);
  }
  try {
    return JSON.parse(json) as unknown;
  } catch (error) {
    throw new Error(`File is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function openProjectValue(
  value: unknown,
  idSuffix: () => string = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12),
): { project: ColorworkProjectV1; source: StudioProjectSource } {
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

export function openStudioProjectJson(json: string, idSuffix?: () => string) {
  return openProjectValue(readProjectJson(json), idSuffix);
}

/** Refuse oversized browser files before `File.text()` duplicates their bytes. */
async function readProjectFile(file: StudioProjectFileV1): Promise<unknown> {
  if (file.size > MAX_STUDIO_PROJECT_FILE_BYTES_V1) {
    throw new Error(`Project file exceeds the ${MAX_STUDIO_PROJECT_FILE_BYTES_V1.toLocaleString('en-US')}-byte authored V1 limit.`);
  }
  return readProjectJson(await file.text());
}

export async function openStudioProjectFile(file: StudioProjectFileV1, idSuffix?: () => string) {
  return openProjectValue(await readProjectFile(file), idSuffix);
}

export async function openStudioDocumentFile(file: StudioProjectFileV1): Promise<
  { kind: 'project'; project: ColorworkProjectV1 } | { kind: 'triangle'; project: TriangleProject }
> {
  const value = await readProjectFile(file);
  if (value && typeof value === 'object' && 'kind' in value && value.kind === triangleDraftKind) {
    return { kind: 'triangle', project: parseTriangleProject(value) };
  }
  return { kind: 'project', project: openProjectValue(value).project };
}

/**
 * Why a file did not open, in plain words for the person who chose it, with
 * what to choose instead. The error itself is for the command line.
 */
export function projectFileProblem(fileName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('The triangle project could not be opened.')) return message;
  if (/exceeds/.test(message)) return `“${fileName}” is too large to open as a project.`;
  const notProject = message.startsWith('File is not valid JSON') || (error instanceof InvalidColorworkProjectError && error.issues.some((issue) => issue.startsWith('kind:')));
  if (notProject) return `“${fileName}” isn't a Studio project. Choose a file saved with File → Save project, or a KnitLab chart.`;
  return `“${fileName}” could not be opened: it may be damaged, or saved by a newer version of Studio.`;
}
