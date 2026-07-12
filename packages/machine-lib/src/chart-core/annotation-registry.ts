/**
 * Chart annotation registry.
 *
 * OperationSpec gives palette keys a status-tagged semantic registry. This
 * does the same for typed non-cell chart intent so adding an annotation kind
 * does not require every compiler/validator to hand-roll its own kind list.
 */

import type {
  KnitlabChartAnnotation,
  KnitlabChartPackageAnnotation,
} from '../colorwork/knitlab1-contract.js';

export type ChartAnnotationKind = KnitlabChartAnnotation['kind'];
export type PackageAnnotationKind = KnitlabChartPackageAnnotation['kind'];
export type AnnotationStatus = 'stable' | 'experimental' | 'deprecated';
export type AnnotationScope = KnitlabChartAnnotation['anchor']['scope'] | 'package';

export interface AnnotationSpec<Kind extends string = string> {
  readonly kind: Kind;
  readonly scope: AnnotationScope;
  readonly status: AnnotationStatus;
  /** True when this annotation must route the chart through shape-aware lowering. */
  readonly affectsShapeMode: boolean;
  readonly consumedBy: readonly string[];
}

export const CHART_ANNOTATION_SPECS = {
  'short-row-turn': {
    kind: 'short-row-turn',
    scope: 'cell',
    status: 'stable',
    affectsShapeMode: false,
    consumedBy: ['chart-track-a', 'chart-continuity', 'chart-analysis'],
  },
  'cell-technique': {
    kind: 'cell-technique',
    scope: 'cell',
    status: 'experimental',
    affectsShapeMode: false,
    consumedBy: [],
  },
  buttonhole: {
    kind: 'buttonhole',
    scope: 'cell',
    status: 'experimental',
    affectsShapeMode: false,
    consumedBy: [],
  },
  'carrier-set': {
    kind: 'carrier-set',
    scope: 'row',
    status: 'experimental',
    affectsShapeMode: false,
    consumedBy: [],
  },
  pause: {
    kind: 'pause',
    scope: 'row',
    status: 'stable',
    affectsShapeMode: false,
    consumedBy: ['compile-chart'],
  },
  racking: {
    kind: 'racking',
    scope: 'row',
    status: 'stable',
    affectsShapeMode: false,
    consumedBy: ['row-rack-schedule'],
  },
  'stitch-number': {
    kind: 'stitch-number',
    scope: 'row',
    status: 'stable',
    affectsShapeMode: false,
    consumedBy: ['row-rack-schedule'],
  },
  'short-row-resolve': {
    kind: 'short-row-resolve',
    scope: 'row',
    status: 'experimental',
    affectsShapeMode: false,
    consumedBy: [],
  },
  'row-note': {
    kind: 'row-note',
    scope: 'row',
    status: 'stable',
    affectsShapeMode: false,
    consumedBy: ['text-export'],
  },
  'cast-on-span': {
    kind: 'cast-on-span',
    scope: 'edge',
    status: 'stable',
    affectsShapeMode: true,
    consumedBy: ['compile-chart'],
  },
  'bind-off-span': {
    kind: 'bind-off-span',
    scope: 'edge',
    status: 'stable',
    affectsShapeMode: true,
    consumedBy: ['chart-continuity', 'chart-analysis', 'compile-chart'],
  },
  'hold-span': {
    kind: 'hold-span',
    scope: 'edge',
    status: 'experimental',
    affectsShapeMode: true,
    consumedBy: ['compile-chart'],
  },
  'edge-pickup': {
    kind: 'edge-pickup',
    scope: 'edge',
    status: 'experimental',
    affectsShapeMode: true,
    consumedBy: ['compile-chart'],
  },
  'gauge-zone': {
    kind: 'gauge-zone',
    scope: 'sheet',
    status: 'experimental',
    affectsShapeMode: false,
    consumedBy: [],
  },
  'sheet-default-bed': {
    kind: 'sheet-default-bed',
    scope: 'sheet',
    status: 'experimental',
    affectsShapeMode: false,
    consumedBy: [],
  },
  'dbj-backing': {
    kind: 'dbj-backing',
    scope: 'sheet',
    status: 'stable',
    affectsShapeMode: false,
    consumedBy: ['chart-track-a', 'compile-chart'],
  },
  'trim-region': {
    kind: 'trim-region',
    scope: 'sheet',
    status: 'stable',
    affectsShapeMode: false,
    consumedBy: ['chart-track-a', 'stockinette-shaped'],
  },
  'piece-origin': {
    kind: 'piece-origin',
    scope: 'piece',
    status: 'stable',
    affectsShapeMode: true,
    consumedBy: ['compile-chart'],
  },
  'piece-terminus': {
    kind: 'piece-terminus',
    scope: 'piece',
    status: 'stable',
    affectsShapeMode: true,
    consumedBy: ['compile-chart'],
  },
} satisfies Record<ChartAnnotationKind, AnnotationSpec<ChartAnnotationKind>>;

export const PACKAGE_ANNOTATION_SPECS = {
  'join-order': {
    kind: 'join-order',
    scope: 'package',
    status: 'experimental',
    affectsShapeMode: false,
    consumedBy: [],
  },
  'assembly-note': {
    kind: 'assembly-note',
    scope: 'package',
    status: 'stable',
    affectsShapeMode: false,
    consumedBy: ['text-export'],
  },
  'carrier-allocation': {
    kind: 'carrier-allocation',
    scope: 'package',
    status: 'experimental',
    affectsShapeMode: false,
    consumedBy: [],
  },
  'piece-transition': {
    kind: 'piece-transition',
    scope: 'package',
    status: 'experimental',
    affectsShapeMode: false,
    consumedBy: [],
  },
} satisfies Record<PackageAnnotationKind, AnnotationSpec<PackageAnnotationKind>>;

export function annotationSpecForKind(kind: ChartAnnotationKind): AnnotationSpec<ChartAnnotationKind> {
  return CHART_ANNOTATION_SPECS[kind];
}

export function packageAnnotationSpecForKind(kind: PackageAnnotationKind): AnnotationSpec<PackageAnnotationKind> {
  return PACKAGE_ANNOTATION_SPECS[kind];
}

export function annotationAffectsShapeMode(annotation: Pick<KnitlabChartAnnotation, 'kind'>): boolean {
  return annotationSpecForKind(annotation.kind).affectsShapeMode;
}

export function registeredChartAnnotationSpecs(): readonly AnnotationSpec<ChartAnnotationKind>[] {
  return Object.values(CHART_ANNOTATION_SPECS);
}

export function registeredPackageAnnotationSpecs(): readonly AnnotationSpec<PackageAnnotationKind>[] {
  return Object.values(PACKAGE_ANNOTATION_SPECS);
}
