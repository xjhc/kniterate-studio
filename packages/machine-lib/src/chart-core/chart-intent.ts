/**
 * Higher-level chart intent commands.
 *
 * Cell paints are handled by the mutation service. This file is the matching
 * write boundary for typed non-cell authoring intent: racking rows, short-row
 * turns, bind-off / cast-on spans, sheet trim regions, and piece boundaries.
 */

import type {
  KnitlabChartAnnotation,
  KnitlabChartAnnotationSource,
  KnitlabChartEdgeSide,
} from '../colorwork/knitlab1-contract.js';
import { annotationSpecForKind } from './annotation-registry.js';

type BaseIntentCommand = {
  readonly id?: string;
  readonly source?: KnitlabChartAnnotationSource;
  readonly locked?: boolean;
  readonly label?: string;
  /** Clear the semantic target instead of writing a new annotation. */
  readonly clear?: boolean;
  /** Replace locked annotations. Generated chart annotations normally set locked=true. */
  readonly force?: boolean;
};

export type RowSelector =
  | number
  | readonly number[]
  | { readonly startRow: number; readonly endRow: number };

export type ChartIntentCommand =
  | ({
      readonly kind: 'rack-rows';
      readonly rows: RowSelector;
      readonly racking: number;
    } & BaseIntentCommand)
  | ({
      readonly kind: 'short-row-turn';
      readonly row: number;
      readonly col: number;
      readonly direction: 'left' | 'right';
      readonly turnMethod?: 'wrap-and-turn' | 'german' | 'shadow' | 'unspecified';
      readonly stitches?: number;
    } & BaseIntentCommand)
  | ({
      readonly kind: 'pause-row';
      readonly row: number;
    } & BaseIntentCommand)
  | ({
      readonly kind: 'row-note';
      readonly row: number;
      readonly text: string;
    } & BaseIntentCommand)
  | ({
      readonly kind: 'bind-off-span' | 'cast-on-span' | 'hold-span' | 'edge-pickup';
      readonly row: number;
      readonly side: KnitlabChartEdgeSide;
      readonly start: number;
      readonly end: number;
      readonly method?: string;
      readonly locationKind?: string;
    } & BaseIntentCommand)
  | ({
      readonly kind: 'trim-region';
      readonly startRow: number;
      readonly endRow: number;
    } & BaseIntentCommand)
  | ({
      readonly kind: 'dbj-backing';
      readonly strategy: 'birdseye' | 'twill' | 'striped' | 'full';
    } & BaseIntentCommand)
  | ({
      readonly kind: 'sheet-default-bed';
      readonly bed: 'front' | 'back' | 'auto';
    } & BaseIntentCommand)
  | ({
      readonly kind: 'piece-origin' | 'piece-terminus';
      readonly pieceId: string;
      readonly boundaryKind?: string;
    } & BaseIntentCommand);

export interface ApplyChartIntentCommandsInput {
  readonly annotations?: readonly KnitlabChartAnnotation[];
  readonly commands: readonly ChartIntentCommand[];
  readonly idPrefix?: string;
}

export interface ChartIntentNotice {
  readonly level: 'info' | 'warning';
  readonly targetKey: string;
  readonly message: string;
}

export interface ApplyChartIntentCommandsResult {
  readonly annotations: KnitlabChartAnnotation[];
  readonly notices: ChartIntentNotice[];
  readonly changed: boolean;
}

interface ExpandedIntent {
  readonly targetKey: string;
  readonly annotation: KnitlabChartAnnotation | null;
  readonly force: boolean;
  readonly preserveExistingId: boolean;
}

const DEFAULT_ID_PREFIX = 'intent';

export function applyChartIntentCommands(
  input: ApplyChartIntentCommandsInput,
): ApplyChartIntentCommandsResult {
  const original = [...(input.annotations ?? [])];
  let next = original;
  const notices: ChartIntentNotice[] = [];

  for (const command of input.commands) {
    const expanded = expandCommand(command, input.idPrefix ?? DEFAULT_ID_PREFIX, notices);
    for (const desired of expanded) {
      const existing = next.find(annotation => chartAnnotationTargetKey(annotation) === desired.targetKey);
      if (existing?.locked && !desired.force) {
        notices.push({
          level: 'warning',
          targetKey: desired.targetKey,
          message: `Skipped ${desired.targetKey}: existing annotation ${existing.id} is locked.`,
        });
        continue;
      }
      const annotation = desired.annotation && existing && desired.preserveExistingId
        ? { ...desired.annotation, id: existing.id }
        : desired.annotation;
      next = next.filter(annotation => chartAnnotationTargetKey(annotation) !== desired.targetKey);
      if (annotation) next = [...next, annotation];
    }
  }

  return {
    annotations: next,
    notices,
    changed: !annotationsEqual(original, next),
  };
}

export function chartAnnotationTargetKey(annotation: KnitlabChartAnnotation): string {
  const spec = annotationSpecForKind(annotation.kind);
  if (spec.scope !== annotation.anchor.scope) {
    throw new Error(`Annotation ${annotation.id} kind ${annotation.kind} has ${annotation.anchor.scope} anchor; expected ${spec.scope}.`);
  }

  switch (annotation.anchor.scope) {
    case 'cell':
      return `${annotation.kind}:cell:${annotation.anchor.row}:${annotation.anchor.col}`;
    case 'row':
      return `${annotation.kind}:row:${annotation.anchor.row}`;
    case 'edge':
      return `${annotation.kind}:edge:${annotation.anchor.row}:${annotation.anchor.side}:${annotation.anchor.start}:${annotation.anchor.end}`;
    case 'sheet':
      if (annotation.kind === 'gauge-zone' && annotation.gaugeZoneId) {
        return `${annotation.kind}:sheet:${annotation.gaugeZoneId}`;
      }
      return `${annotation.kind}:sheet`;
    case 'piece':
      return `${annotation.kind}:piece:${annotation.anchor.pieceId}`;
  }
}

function expandCommand(
  command: ChartIntentCommand,
  idPrefix: string,
  notices: ChartIntentNotice[],
): ExpandedIntent[] {
  switch (command.kind) {
    case 'rack-rows':
      return rowsFromSelector(command.rows).map(row => {
        const targetKey = `racking:row:${row}`;
        if (command.clear) {
          return clearIntent(targetKey, command);
        }
        const value = normalizedNumber(command.racking);
        // Note: racking: 0 is a real annotation (machine racks back to rest at this
        // row). To remove the annotation entirely, pass `clear: true`.
        const annotation = withBase(command, {
          id: idForCommand(command, targetKey, idPrefix),
          kind: 'racking',
          anchor: { scope: 'row', row },
          racking: value,
          label: command.label ?? `R${value > 0 ? '+' : ''}${value}`,
        } satisfies KnitlabChartAnnotation);
        return { targetKey, annotation, force: command.force === true, preserveExistingId: !command.id };
      });

    case 'short-row-turn': {
      const row = normalizedInteger(command.row);
      const col = normalizedInteger(command.col);
      const targetKey = `short-row-turn:cell:${row}:${col}`;
      if (command.clear) return [clearIntent(targetKey, command)];
      const annotation = withBase(command, {
        id: idForCommand(command, targetKey, idPrefix),
        kind: 'short-row-turn',
        anchor: { scope: 'cell', row, col },
        direction: command.direction,
        turnMethod: command.turnMethod ?? 'unspecified',
        ...(command.stitches !== undefined ? { stitches: Math.max(1, normalizedInteger(command.stitches)) } : {}),
      } satisfies KnitlabChartAnnotation);
      return [writeIntent(targetKey, annotation, command)];
    }

    case 'pause-row': {
      const row = normalizedInteger(command.row);
      const targetKey = `pause:row:${row}`;
      if (command.clear) return [clearIntent(targetKey, command)];
      const annotation = withBase(command, {
        id: idForCommand(command, targetKey, idPrefix),
        kind: 'pause',
        anchor: { scope: 'row', row },
        label: command.label ?? '||',
      } satisfies KnitlabChartAnnotation);
      return [writeIntent(targetKey, annotation, command)];
    }

    case 'row-note': {
      const row = normalizedInteger(command.row);
      const targetKey = `row-note:row:${row}`;
      if (command.clear) return [clearIntent(targetKey, command)];
      const annotation = withBase(command, {
        id: idForCommand(command, targetKey, idPrefix),
        kind: 'row-note',
        anchor: { scope: 'row', row },
        text: command.text,
      } satisfies KnitlabChartAnnotation);
      return [writeIntent(targetKey, annotation, command)];
    }

    case 'bind-off-span':
    case 'cast-on-span':
    case 'hold-span':
    case 'edge-pickup': {
      const row = normalizedInteger(command.row);
      const start = normalizedInteger(command.start);
      const end = normalizedInteger(command.end);
      const targetKey = `${command.kind}:edge:${row}:${command.side}:${start}:${end}`;
      if (start >= end) {
        notices.push({
          level: 'warning',
          targetKey,
          message: `Skipped ${targetKey}: span end must be greater than start.`,
        });
        return [];
      }
      if (command.clear) return [clearIntent(targetKey, command)];
      const annotation = withBase(command, {
        id: idForCommand(command, targetKey, idPrefix),
        kind: command.kind,
        anchor: { scope: 'edge', row, side: command.side, start, end },
        ...(command.method ? { method: command.method } : {}),
        ...(command.locationKind ? { locationKind: command.locationKind } : {}),
      } satisfies KnitlabChartAnnotation);
      return [writeIntent(targetKey, annotation, command)];
    }

    case 'trim-region': {
      const startRow = normalizedInteger(Math.min(command.startRow, command.endRow));
      const endRow = normalizedInteger(Math.max(command.startRow, command.endRow));
      const targetKey = 'trim-region:sheet';
      if (command.clear) return [clearIntent(targetKey, command)];
      const annotation = withBase(command, {
        id: idForCommand(command, targetKey, idPrefix),
        kind: 'trim-region',
        anchor: { scope: 'sheet' },
        trimRegion: { startRow, endRow },
      } satisfies KnitlabChartAnnotation);
      return [writeIntent(targetKey, annotation, command)];
    }

    case 'dbj-backing': {
      const targetKey = 'dbj-backing:sheet';
      if (command.clear) return [clearIntent(targetKey, command)];
      const annotation = withBase(command, {
        id: idForCommand(command, targetKey, idPrefix),
        kind: 'dbj-backing',
        anchor: { scope: 'sheet' },
        dbjStrategy: command.strategy,
      } satisfies KnitlabChartAnnotation);
      return [writeIntent(targetKey, annotation, command)];
    }

    case 'sheet-default-bed': {
      const targetKey = 'sheet-default-bed:sheet';
      if (command.clear) return [clearIntent(targetKey, command)];
      const annotation = withBase(command, {
        id: idForCommand(command, targetKey, idPrefix),
        kind: 'sheet-default-bed',
        anchor: { scope: 'sheet' },
        bed: command.bed,
      } satisfies KnitlabChartAnnotation);
      return [writeIntent(targetKey, annotation, command)];
    }

    case 'piece-origin':
    case 'piece-terminus': {
      const targetKey = `${command.kind}:piece:${command.pieceId}`;
      if (command.clear) return [clearIntent(targetKey, command)];
      const annotation = withBase(command, {
        id: idForCommand(command, targetKey, idPrefix),
        kind: command.kind,
        anchor: { scope: 'piece', pieceId: command.pieceId },
        ...(command.boundaryKind ? { boundaryKind: command.boundaryKind } : {}),
      } satisfies KnitlabChartAnnotation);
      return [writeIntent(targetKey, annotation, command)];
    }
  }
}

function writeIntent(
  targetKey: string,
  annotation: KnitlabChartAnnotation,
  command: BaseIntentCommand,
): ExpandedIntent {
  return {
    targetKey,
    annotation,
    force: command.force === true,
    preserveExistingId: !command.id,
  };
}

function clearIntent(targetKey: string, command: BaseIntentCommand): ExpandedIntent {
  return {
    targetKey,
    annotation: null,
    force: command.force === true,
    preserveExistingId: false,
  };
}

function withBase<T extends KnitlabChartAnnotation>(
  command: BaseIntentCommand,
  annotation: T,
): T {
  return {
    ...annotation,
    ...(command.source ? { source: command.source } : {}),
    ...(command.locked !== undefined ? { locked: command.locked } : {}),
    ...(command.label ? { label: command.label } : {}),
  };
}

function rowsFromSelector(selector: RowSelector): number[] {
  if (typeof selector === 'number') return [normalizedInteger(selector)];
  if (!('startRow' in selector)) return uniqueSorted(selector.map(normalizedInteger));
  const start = normalizedInteger(Math.min(selector.startRow, selector.endRow));
  const end = normalizedInteger(Math.max(selector.startRow, selector.endRow));
  const rows: number[] = [];
  for (let row = start; row <= end; row++) rows.push(row);
  return rows;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function normalizedInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

function normalizedNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

function idForCommand(command: BaseIntentCommand, targetKey: string, idPrefix: string): string {
  if (command.id) return command.id;
  return `${idPrefix}_${targetKey.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

function annotationsEqual(
  left: readonly KnitlabChartAnnotation[],
  right: readonly KnitlabChartAnnotation[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
