#!/usr/bin/env -S node --import tsx
/**
 * Validate the physical swatch ledger and generate the exact identities that
 * may support a Knit-proven claim. Physical outcomes remain manual evidence;
 * current compiler/artifact identity is always recomputed in-process.
 */

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  compileRegistryRequestCurrent,
  computeCompilerFingerprint,
  type CurrentRegistryMachineEvidence,
  sha256File,
} from './registry-support.js';
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../src/knitout/kcode/machine-profile.js';
import { projectKCodeMachineTrace } from '../src/knitout/kcode/machine-trace.js';
import { validateKCodeMachineTrace } from '../src/knitout/kcode/machine-validator.js';
import { validateKCodeMachineSafetyV1 } from '../src/knitout/kcode/machine-safety.js';
import { parseKCodeDocument } from '../src/knitout/kcode/parser.js';

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const OUTCOMES = ['clean', 'dropped', 'jammed', 'aborted', 'partial'] as const;
const ROLES = ['draw', 'pattern', 'waste'] as const;
const SECTIONS = ['waste', 'castOn', 'drawThread', 'carrierBringIn', 'body', 'backing', 'leftEdge', 'rightEdge', 'bindOff'] as const;
const SECTION_STATUSES = ['clean', 'issue', 'not-reached', 'not-applicable'] as const;
const PHOTO_VIEWS = ['front', 'back', 'cast-on', 'left-edge', 'right-edge', 'bind-off'] as const;
const INTERVENTION_KINDS = ['restart', 'yarn-rethread', 'loop-repair', 'needle-repair', 'setting-change', 'carrier-change', 'source-edit', 'other'] as const;
const INITIAL_SETTING_KEYS = ['stitchNumber', 'xferStitchNumber', 'speedNumber', 'rollerAdvance', 'xferStyle', 'carrierSpacing', 'carrierStoppingDistance'] as const;
const LIMITS = {
  entries: 256,
  dirents: 1_024,
  registryMessages: 512,
  jsonBytes: 8 * 1024 * 1024,
  narrativeBytes: 1024 * 1024,
  knitoutBytes: 16 * 1024 * 1024,
  kcodeBytes: 24 * 1024 * 1024,
  manifestBytes: 4 * 1024 * 1024,
  photoBytes: 32 * 1024 * 1024,
  jsonDepth: 64,
  jsonNodes: 100_000,
  objectProperties: 2_048,
  yarns: 6,
  deviations: 256,
  interventions: 4_096,
  stops: 4_096,
  photos: 32,
  requestInputs: 64,
} as const;
const HOUR_MS = 60 * 60 * 1000;
const sha256Text = (value: string): string => createHash('sha256').update(value).digest('hex');

interface SwatchEntryResult {
  id: string;
  ok: boolean;
  stale: boolean;
  knitProven: boolean;
  outcome: string | null;
  messages: string[];
  currentnessMessages: string[];
  promotionMessages: string[];
  registryEntry: {
    id: string;
    sourceFingerprint: string;
    knitoutSha256: string;
    kcodeSha256: string;
    compilerFingerprint: string;
  } | null;
  controllerObservedCoverage: ControllerObservedCoverage | null;
}

interface ControllerObservedCoverage {
  machineSerial: string;
  controlSoftwareVersion: string;
  kcodeSha256: string;
  passes: number;
  operations: string[];
  directions: string[];
  carriers: string[];
  racks: number[];
  combinations: Array<{
    operation: string;
    direction: string;
    carrier: string;
    rack: number;
  }>;
}

interface CarrierEvidence {
  role: string;
  yarnIndex: number;
}

interface YarnEvidence {
  carrier: string;
  role: string;
}

interface ValidatedCoordinateBridge {
  readonly value: Record<string, unknown>;
  readonly artifactKcodeSha256: string;
  readonly position: string;
  readonly compilerStart: number;
  readonly compilerEnd: number;
  readonly traceStart: number;
  readonly traceEnd: number;
}

interface MachineEvidenceValidation {
  readonly carrierLinks: Map<string, CarrierEvidence>;
  readonly coordinateBridge: ValidatedCoordinateBridge | null;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function deriveCommandCoverage(
  kcode: string,
  currentnessMessages: string[],
): Omit<ControllerObservedCoverage, 'machineSerial' | 'controlSoftwareVersion' | 'kcodeSha256'> | null {
  const parsed = parseKCodeDocument(kcode, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    dialect: KNITERATE_7GG_KCODE_PROFILE_V2.dialect,
    strict: true,
  });
  if (!parsed.ok) {
    currentnessMessages.push(`out.kc is historical under the current profile because strict command-legality parsing fails: ${parsed.diagnostics.slice(0, 8).map((diagnostic) => diagnostic.rule).join(', ')}`);
    return null;
  }
  const trace = projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2);
  const validation = validateKCodeMachineTrace(trace, KNITERATE_7GG_KCODE_PROFILE_V2);
  if (!validation.ok || validation.profileConformance !== 'conformant') {
    currentnessMessages.push(`out.kc is historical under the current profile because command-legality validation fails: ${validation.diagnostics.slice(0, 8).map((diagnostic) => diagnostic.rule).join(', ')}`);
    return null;
  }
  const safety = validateKCodeMachineSafetyV1(trace, KNITERATE_7GG_KCODE_PROFILE_V2);
  if (!safety.ok) {
    currentnessMessages.push(`out.kc is historical because it breaks the machine-safety envelope: ${safety.diagnostics.slice(0, 8).map((diagnostic) => diagnostic.rule).join(', ')}`);
    return null;
  }
  const combinations = [...new Map(trace.passes.map((pass) => {
    const value = {
      operation: pass.operation,
      direction: pass.direction,
      carrier: pass.carrier,
      rack: pass.rack,
    };
    return [`${value.operation}|${value.direction}|${value.carrier}|${value.rack}`, value] as const;
  })).values()].sort((a, b) =>
    a.operation.localeCompare(b.operation)
    || a.direction.localeCompare(b.direction)
    || a.carrier.localeCompare(b.carrier)
    || a.rack - b.rack);
  return {
    passes: trace.passes.length,
    operations: [...new Set(trace.passes.map((pass) => pass.operation))].sort(),
    directions: [...new Set(trace.passes.map((pass) => pass.direction))].sort(),
    carriers: [...new Set(trace.passes.map((pass) => pass.carrier))].sort(),
    racks: [...new Set(trace.passes.map((pass) => pass.rack))].sort((a, b) => a - b),
    combinations,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function scanPlaceholdersBounded(values: readonly unknown[]): { placeholder: boolean; limitMessage: string | null } {
  const pending = values.map((value) => ({ value, depth: 0 }));
  let nodes = 0;
  let placeholder = false;
  while (pending.length > 0) {
    const item = pending.pop()!;
    nodes++;
    if (nodes > LIMITS.jsonNodes) return { placeholder, limitMessage: `JSON evidence exceeds the ${LIMITS.jsonNodes}-node traversal limit` };
    if (item.depth > LIMITS.jsonDepth) return { placeholder, limitMessage: `JSON evidence exceeds the ${LIMITS.jsonDepth}-level nesting limit` };
    if (typeof item.value === 'string') {
      if (/\bTODO\b|1970-01-01/.test(item.value)) placeholder = true;
      continue;
    }
    if (Array.isArray(item.value)) {
      if (item.value.length > LIMITS.jsonNodes - nodes - pending.length) {
        return { placeholder, limitMessage: `JSON evidence exceeds the ${LIMITS.jsonNodes}-node traversal limit` };
      }
      if (item.value.length > 0 && item.depth >= LIMITS.jsonDepth) {
        return { placeholder, limitMessage: `JSON evidence exceeds the ${LIMITS.jsonDepth}-level nesting limit` };
      }
      for (const value of item.value) pending.push({ value, depth: item.depth + 1 });
      continue;
    }
    const record = asRecord(item.value);
    if (record !== null) {
      const entries = Object.values(record);
      if (entries.length > LIMITS.objectProperties) return { placeholder, limitMessage: `JSON object exceeds the ${LIMITS.objectProperties}-property limit` };
      if (entries.length > LIMITS.jsonNodes - nodes - pending.length) {
        return { placeholder, limitMessage: `JSON evidence exceeds the ${LIMITS.jsonNodes}-node traversal limit` };
      }
      if (entries.length > 0 && item.depth >= LIMITS.jsonDepth) {
        return { placeholder, limitMessage: `JSON evidence exceeds the ${LIMITS.jsonDepth}-level nesting limit` };
      }
      for (const value of entries) pending.push({ value, depth: item.depth + 1 });
    }
  }
  return { placeholder, limitMessage: null };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteNumber(value: unknown, minimum = 0, exclusive = false): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && (exclusive ? value > minimum : value >= minimum);
}

function integer(value: unknown, minimum?: number): value is number {
  return Number.isInteger(value) && (minimum === undefined || Number(value) >= minimum);
}

function validDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = RFC3339.exec(value);
  if (match === null) return false;
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, zone] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (zone !== 'Z') {
    const [offsetHour, offsetMinute] = zone!.slice(1).split(':').map(Number);
    if (offsetHour! > 23 || offsetMinute! > 59) return false;
  }
  return Number.isFinite(Date.parse(value));
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], path: string, messages: string[]): void {
  const expectedSet = new Set(expected);
  for (const key of expected) if (!(key in record)) messages.push(`${path}.${key} is required`);
  for (const key of Object.keys(record)) if (!expectedSet.has(key)) messages.push(`${path}.${key} is not allowed`);
}

function requireHeader(
  record: Record<string, unknown>,
  path: string,
  kind: string,
  messages: string[],
): void {
  if (record.$schema !== '../_schema.json') messages.push(`${path}.$schema must be ../_schema.json`);
  if (record.kind !== kind) messages.push(`${path}.kind must be ${kind}`);
  if (record.schemaVersion !== 1) messages.push(`${path}.schemaVersion must be 1`);
}

function currentCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function validateTemplate(root: string): string[] {
  const messages: string[] = [];
  const requireRegular = (path: string, label: string): void => {
    try {
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) messages.push(`${label} must not be a symbolic link`);
      else if (!stats.isFile()) messages.push(`${label} must be a regular file`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') messages.push(`${label} is missing`);
      else messages.push(`${label} could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  requireRegular(join(root, '_schema.json'), 'registry schema registry/swatches/_schema.json');
  const template = join(root, '_template');
  try {
    const stats = lstatSync(template);
    if (stats.isSymbolicLink()) {
      messages.push('registry template directory must not be a symbolic link');
      return messages;
    }
    if (!stats.isDirectory()) {
      messages.push('registry template path must be a directory');
      return messages;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') messages.push('registry template directory is missing');
    else messages.push(`registry template directory could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
    return messages;
  }
  for (const file of ['spec.json', 'request.json', 'machine.json', 'yarn.json', 'run.json', 'out.k', 'out.kc', 'outcome.md']) {
    requireRegular(join(template, file), `template ${file}`);
  }
  return messages;
}

function validateEntryResourceSizes(dir: string, messages: string[]): { ok: boolean; readable: Set<string> } {
  const limits: Record<string, number> = {
    'spec.json': LIMITS.jsonBytes,
    'request.json': LIMITS.jsonBytes,
    'machine.json': LIMITS.jsonBytes,
    'yarn.json': LIMITS.jsonBytes,
    'run.json': LIMITS.jsonBytes,
    'project.kniterate-studio.json': LIMITS.jsonBytes,
    'chart.colorwork.json': LIMITS.jsonBytes,
    'outcome.md': LIMITS.narrativeBytes,
    'out.k': LIMITS.knitoutBytes,
    'out.kc': LIMITS.kcodeBytes,
  };
  let withinLimits = true;
  const readable = new Set<string>();
  for (const [name, limit] of Object.entries(limits)) {
    const path = join(dir, name);
    let stats: ReturnType<typeof lstatSync>;
    try {
      stats = lstatSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      messages.push(`${name} could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
      withinLimits = false;
      continue;
    }
    if (stats.isSymbolicLink()) {
      messages.push(`${name} must not be a symbolic link`);
      withinLimits = false;
    } else if (!stats.isFile()) {
      messages.push(`${name} must be a regular file`);
      withinLimits = false;
    } else if (stats.size > limit) {
      messages.push(`${name} exceeds the ${limit}-byte evidence limit`);
      withinLimits = false;
    } else readable.add(name);
  }
  return { ok: withinLimits, readable };
}

function inspectPhotoPath(
  dir: string,
  value: unknown,
  path: string,
  messages: string[],
): { identity: string; localFile: string | null } | null {
  if (!nonEmpty(value) || value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) {
    messages.push(`${path}.path must be a safe relative path`);
    return null;
  }
  const parts = value.split(/[\\/]/);
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    messages.push(`${path}.path must be a safe relative path`);
    return null;
  }
  const entryRoot = resolve(dir);
  const localPath = resolve(entryRoot, ...parts);
  if (!localPath.startsWith(`${entryRoot}${sep}`)) {
    messages.push(`${path}.path must remain inside the swatch entry`);
    return null;
  }

  let cursor = entryRoot;
  for (let index = 0; index < parts.length; index++) {
    cursor = join(cursor, parts[index]!);
    let stats: ReturnType<typeof lstatSync>;
    try {
      stats = lstatSync(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { identity: localPath, localFile: null };
      messages.push(`${path}.path could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
      return { identity: localPath, localFile: null };
    }
    if (stats.isSymbolicLink()) {
      messages.push(`${path}.path must not traverse a symbolic link`);
      return { identity: localPath, localFile: null };
    }
    if (index < parts.length - 1 && !stats.isDirectory()) {
      messages.push(`${path}.path has a non-directory parent component`);
      return { identity: localPath, localFile: null };
    }
    if (index === parts.length - 1) {
      if (!stats.isFile()) messages.push(`${path}.path must reference a regular file when local bytes exist`);
      else if (stats.size > LIMITS.photoBytes) messages.push(`${path}.path exceeds the ${LIMITS.photoBytes}-byte local photo limit`);
      else return { identity: localPath, localFile: localPath };
    }
  }
  return { identity: localPath, localFile: null };
}

function writeManifestAtomically(path: string, bytes: string): void {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor: number | null = null;
  let temporaryExists = false;
  try {
    descriptor = openSync(temporaryPath, 'wx', 0o600);
    temporaryExists = true;
    writeFileSync(descriptor, bytes, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporaryPath, path);
    temporaryExists = false;
    const directoryDescriptor = openSync(dirname(path), 'r');
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (temporaryExists) rmSync(temporaryPath, { force: true });
  }
}

function validateInitialSettings(
  value: unknown,
  path: string,
  messages: string[],
): Record<string, unknown> | null {
  const settings = asRecord(value);
  if (settings === null) {
    messages.push(`${path} must be an object`);
    return null;
  }
  exactKeys(settings, INITIAL_SETTING_KEYS, path, messages);
  for (const name of ['stitchNumber', 'xferStitchNumber', 'rollerAdvance'] as const) {
    if (!finiteNumber(settings[name])) messages.push(`${path}.${name} must be a finite nonnegative number`);
  }
  if (!finiteNumber(settings.speedNumber, 0, true)) messages.push(`${path}.speedNumber must be a finite positive number`);
  if (!['four-pass', 'two-pass'].includes(String(settings.xferStyle))) messages.push(`${path}.xferStyle must be four-pass or two-pass`);
  for (const name of ['carrierSpacing', 'carrierStoppingDistance'] as const) {
    if (!finiteNumber(settings[name], 0, true)) messages.push(`${path}.${name} must be a finite positive number`);
  }
  return settings;
}

function validateCoordinateBridge(
  value: unknown,
  path: string,
  messages: string[],
): ValidatedCoordinateBridge | null {
  const bridge = asRecord(value);
  if (bridge === null) {
    messages.push(`${path} must be an object`);
    return null;
  }
  exactKeys(bridge, [
    'kind', 'schemaVersion', 'provenance', 'artifactKcodeSha256', 'profile',
    'lowering', 'compilerProject', 'kcodeColumn', 'traceCoordinate', 'offsets',
    'verification', 'physicalNeedleLabels',
  ], path, messages);
  if (bridge.kind !== 'kniterate-authored-kcode-coordinate-bridge') messages.push(`${path}.kind is invalid`);
  if (bridge.schemaVersion !== 1) messages.push(`${path}.schemaVersion must be 1`);
  if (bridge.provenance !== 'authored-project-and-pinned-lowering') messages.push(`${path}.provenance is invalid`);
  if (typeof bridge.artifactKcodeSha256 !== 'string' || !SHA256.test(bridge.artifactKcodeSha256)) messages.push(`${path}.artifactKcodeSha256 must be SHA-256`);

  const profile = asRecord(bridge.profile);
  if (profile === null) messages.push(`${path}.profile must be an object`);
  else {
    exactKeys(profile, ['id', 'version', 'dialect'], `${path}.profile`, messages);
    if (!nonEmpty(profile.id)) messages.push(`${path}.profile.id must be non-empty`);
    if (!integer(profile.version, 1)) messages.push(`${path}.profile.version must be a positive integer`);
    if (!['app', 'knitout-vendor'].includes(String(profile.dialect))) messages.push(`${path}.profile.dialect is invalid`);
  }

  const lowering = asRecord(bridge.lowering);
  let position: string | null = null;
  let sourceMin: number | null = null;
  let sourceMax: number | null = null;
  let compilerToKcode: number | null = null;
  if (lowering === null) messages.push(`${path}.lowering must be an object`);
  else {
    exactKeys(lowering, ['schemaVersion', 'position', 'sourceSlotRange', 'frontSourceSlotToKCodeColumnOffset', 'formula'], `${path}.lowering`, messages);
    if (lowering.schemaVersion !== 1) messages.push(`${path}.lowering.schemaVersion must be 1`);
    if (!['Left', 'Center', 'Right', 'Keep'].includes(String(lowering.position))) messages.push(`${path}.lowering.position is invalid`);
    else position = String(lowering.position);
    if (!integer(lowering.frontSourceSlotToKCodeColumnOffset)) messages.push(`${path}.lowering.frontSourceSlotToKCodeColumnOffset must be an integer`);
    else compilerToKcode = lowering.frontSourceSlotToKCodeColumnOffset;
    if (lowering.formula !== 'kcodeColumn=frontSourceSlot+offset') messages.push(`${path}.lowering.formula is invalid`);
    const sourceRange = asRecord(lowering.sourceSlotRange);
    if (sourceRange === null) messages.push(`${path}.lowering.sourceSlotRange must be an object`);
    else {
      exactKeys(sourceRange, ['min', 'max'], `${path}.lowering.sourceSlotRange`, messages);
      if (typeof sourceRange.min !== 'number' || !Number.isFinite(sourceRange.min)) messages.push(`${path}.lowering.sourceSlotRange.min must be finite`);
      else sourceMin = sourceRange.min;
      if (typeof sourceRange.max !== 'number' || !Number.isFinite(sourceRange.max)) messages.push(`${path}.lowering.sourceSlotRange.max must be finite`);
      else sourceMax = sourceRange.max;
      if (sourceMin !== null && sourceMax !== null && sourceMin > sourceMax) messages.push(`${path}.lowering.sourceSlotRange min must not exceed max`);
    }
  }

  const endpointRange = (
    candidate: unknown,
    field: 'compilerProject' | 'kcodeColumn' | 'traceCoordinate',
    basis: string,
  ): { start: number; end: number } | null => {
    const range = asRecord(candidate);
    const rangePath = `${path}.${field}`;
    if (range === null) {
      messages.push(`${rangePath} must be an object`);
      return null;
    }
    exactKeys(range, ['basis', 'start', 'end'], rangePath, messages);
    if (range.basis !== basis) messages.push(`${rangePath}.basis is invalid`);
    if (!integer(range.start)) messages.push(`${rangePath}.start must be an integer`);
    if (!integer(range.end)) messages.push(`${rangePath}.end must be an integer`);
    if (!integer(range.start) || !integer(range.end)) return null;
    if (range.start > range.end) messages.push(`${rangePath} start must not exceed end`);
    return { start: range.start, end: range.end };
  };
  const compiler = endpointRange(bridge.compilerProject, 'compilerProject', 'one-based-knitout-front-bed-needle');
  const kcode = endpointRange(bridge.kcodeColumn, 'kcodeColumn', 'marker-free-raster-column');
  const trace = endpointRange(bridge.traceCoordinate, 'traceCoordinate', 'dialect-normalized-marker-free-coordinate');

  const offsets = asRecord(bridge.offsets);
  let kcodeToTrace: number | null = null;
  if (offsets === null) messages.push(`${path}.offsets must be an object`);
  else {
    exactKeys(offsets, ['compilerProjectToKcodeColumn', 'kcodeColumnToTraceCoordinate', 'compilerProjectToTraceCoordinate'], `${path}.offsets`, messages);
    for (const field of ['compilerProjectToKcodeColumn', 'kcodeColumnToTraceCoordinate', 'compilerProjectToTraceCoordinate'] as const) {
      if (!integer(offsets[field])) messages.push(`${path}.offsets.${field} must be an integer`);
    }
    if (integer(offsets.compilerProjectToKcodeColumn) && compilerToKcode !== null && offsets.compilerProjectToKcodeColumn !== compilerToKcode) messages.push(`${path}.offsets.compilerProjectToKcodeColumn differs from lowering offset`);
    if (integer(offsets.kcodeColumnToTraceCoordinate)) kcodeToTrace = offsets.kcodeColumnToTraceCoordinate;
    if (
      compilerToKcode !== null
      && kcodeToTrace !== null
      && integer(offsets.compilerProjectToTraceCoordinate)
      && offsets.compilerProjectToTraceCoordinate !== compilerToKcode + kcodeToTrace
    ) messages.push(`${path}.offsets.compilerProjectToTraceCoordinate must equal the two component offsets`);
  }

  const verification = asRecord(bridge.verification);
  if (verification === null) messages.push(`${path}.verification must be an object`);
  else {
    exactKeys(verification, ['scheduledTraceComparison', 'selectedTraceExtentMatchesMappedEndpoints'], `${path}.verification`, messages);
    if (verification.scheduledTraceComparison !== 'passed') messages.push(`${path}.verification.scheduledTraceComparison must be passed`);
    if (verification.selectedTraceExtentMatchesMappedEndpoints !== true) messages.push(`${path}.verification.selectedTraceExtentMatchesMappedEndpoints must be true`);
  }
  const physical = asRecord(bridge.physicalNeedleLabels);
  if (physical === null) messages.push(`${path}.physicalNeedleLabels must be an object`);
  else {
    exactKeys(physical, ['status'], `${path}.physicalNeedleLabels`, messages);
    if (physical.status !== 'unverified') messages.push(`${path}.physicalNeedleLabels.status must remain unverified`);
  }

  if (compiler !== null && kcode !== null && compilerToKcode !== null) {
    if (kcode.start !== compiler.start + compilerToKcode || kcode.end !== compiler.end + compilerToKcode) messages.push(`${path}.kcodeColumn endpoints do not match the compiler-to-KCode offset`);
  }
  if (kcode !== null && trace !== null && kcodeToTrace !== null) {
    if (trace.start !== kcode.start + kcodeToTrace || trace.end !== kcode.end + kcodeToTrace) messages.push(`${path}.traceCoordinate endpoints do not match the KCode-to-trace offset`);
  }
  if (compiler !== null && compiler.start < 1) messages.push(`${path}.compilerProject must use the one-based authored project domain`);
  if (compiler !== null && sourceMin !== null && sourceMax !== null && (compiler.start < sourceMin || compiler.end > sourceMax)) messages.push(`${path}.compilerProject endpoints must lie within the lowered source-slot endpoints`);

  if (
    typeof bridge.artifactKcodeSha256 !== 'string'
    || !SHA256.test(bridge.artifactKcodeSha256)
    || position === null
    || compiler === null
    || trace === null
  ) return null;
  return {
    value: bridge,
    artifactKcodeSha256: bridge.artifactKcodeSha256,
    position,
    compilerStart: compiler.start,
    compilerEnd: compiler.end,
    traceStart: trace.start,
    traceEnd: trace.end,
  };
}

function expectedProgramFields(expected: CurrentRegistryMachineEvidence): Record<string, unknown> {
  return {
    compilerCoordinateStart: expected.compilerCoordinates.start,
    compilerCoordinateEnd: expected.compilerCoordinates.end,
    gauge: expected.program.gauge,
    position: expected.program.position,
    wastePasses: expected.program.wastePasses,
    bindOff: expected.program.bindOff,
  };
}

function compareExactValue(
  actual: unknown,
  expected: unknown,
  path: string,
  promotionMessages: string[],
): void {
  if (!Object.is(actual, expected)) {
    promotionMessages.push(`${path} differs from the current compile: actual ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

function validateMachine(
  machine: Record<string, unknown>,
  expected: CurrentRegistryMachineEvidence | null,
  messages: string[],
  promotionMessages: string[],
): MachineEvidenceValidation {
  exactKeys(machine, ['$schema', 'kind', 'schemaVersion', 'ranAt', 'machineSerial', 'controlSoftwareVersion', 'profile', 'program', 'carriers', 'deviationsFromCompile'], 'machine.json', messages);
  requireHeader(machine, 'machine.json', 'kniterate-machine-run-v1', messages);
  if (!validDateTime(machine.ranAt)) messages.push('machine.json.ranAt must be an RFC3339 date-time');
  for (const name of ['machineSerial', 'controlSoftwareVersion', 'profile'] as const) {
    if (!nonEmpty(machine[name])) messages.push(`machine.json.${name} must be a non-empty string`);
  }

  const program = asRecord(machine.program);
  let initialSettings: Record<string, unknown> | null = null;
  let coordinateBridge: ValidatedCoordinateBridge | null = null;
  const programKeys = ['compilerCoordinateStart', 'compilerCoordinateEnd', 'coordinateBridge', 'gauge', 'position', 'wastePasses', 'bindOff', 'initialSettings'] as const;
  if (program === null) messages.push('machine.json.program must be an object');
  else {
    exactKeys(program, programKeys, 'machine.json.program', messages);
    if (!integer(program.compilerCoordinateStart)) messages.push('machine.json.program.compilerCoordinateStart must be an integer');
    if (!integer(program.compilerCoordinateEnd)) messages.push('machine.json.program.compilerCoordinateEnd must be an integer');
    if (integer(program.compilerCoordinateStart) && integer(program.compilerCoordinateEnd) && program.compilerCoordinateStart > program.compilerCoordinateEnd) {
      messages.push('machine.json.program compiler coordinate start must not exceed end');
    }
    if (!finiteNumber(program.gauge, 0, true)) messages.push('machine.json.program.gauge must be a finite positive number');
    if (!['Left', 'Center', 'Right', 'Keep'].includes(String(program.position))) messages.push('machine.json.program.position must be Left/Center/Right/Keep');
    if (!integer(program.wastePasses, 0)) messages.push('machine.json.program.wastePasses must be a nonnegative integer');
    if (!['machine-bindoff', 'waste-and-drop', 'fairisle-park-bindoff', 'knit-off'].includes(String(program.bindOff))) messages.push('machine.json.program.bindOff must be machine-bindoff, waste-and-drop, fairisle-park-bindoff, or knit-off');
    coordinateBridge = validateCoordinateBridge(program.coordinateBridge, 'machine.json.program.coordinateBridge', messages);
    if (coordinateBridge !== null) {
      if (integer(program.compilerCoordinateStart) && coordinateBridge.compilerStart !== program.compilerCoordinateStart) messages.push('machine.json.program.coordinateBridge compiler start differs from machine.json.program.compilerCoordinateStart');
      if (integer(program.compilerCoordinateEnd) && coordinateBridge.compilerEnd !== program.compilerCoordinateEnd) messages.push('machine.json.program.coordinateBridge compiler end differs from machine.json.program.compilerCoordinateEnd');
      if (coordinateBridge.position !== program.position) messages.push('machine.json.program.coordinateBridge lowering position differs from machine.json.program.position');
    }
    initialSettings = validateInitialSettings(program.initialSettings, 'machine.json.program.initialSettings', messages);
    if (expected !== null) {
      compareExactValue(machine.profile, expected.profile, 'machine.json.profile', promotionMessages);
      for (const [field, expectedValue] of Object.entries(expectedProgramFields(expected))) {
        compareExactValue(program[field], expectedValue, `machine.json.program.${field}`, promotionMessages);
      }
      if (initialSettings !== null) {
        for (const [field, expectedValue] of Object.entries(expected.program.initialSettings)) {
          compareExactValue(initialSettings[field], expectedValue, `machine.json.program.initialSettings.${field}`, promotionMessages);
        }
      }
      if (coordinateBridge !== null && !isDeepStrictEqual(coordinateBridge.value, expected.coordinateBridge)) {
        promotionMessages.push('machine.json.program.coordinateBridge differs from the exact current authored-to-KCode mapping');
      }
    }
  }

  const carrierMap = new Map<string, CarrierEvidence>();
  const carriers = asRecord(machine.carriers);
  if (carriers === null || Object.keys(carriers).length === 0) messages.push('machine.json.carriers must be a non-empty object');
  else for (const [carrier, value] of Object.entries(carriers)) {
    if (!/^[1-6]$/.test(carrier)) messages.push(`machine.json.carriers.${carrier} is not a supported carrier key`);
    const record = asRecord(value);
    if (record === null) {
      messages.push(`machine.json.carriers.${carrier} must be an object`);
      continue;
    }
    exactKeys(record, ['role', 'yarnEntry'], `machine.json.carriers.${carrier}`, messages);
    if (!ROLES.includes(record.role as typeof ROLES[number])) messages.push(`machine.json.carriers.${carrier}.role must be draw/pattern/waste`);
    const match = typeof record.yarnEntry === 'string' ? /^yarn\.json#yarns\[([0-9]+)\]$/.exec(record.yarnEntry) : null;
    if (match === null) messages.push(`machine.json.carriers.${carrier}.yarnEntry must reference yarn.json#yarns[N]`);
    else carrierMap.set(carrier, { role: String(record.role), yarnIndex: Number(match[1]) });
  }
  if (expected !== null && carriers !== null) {
    const expectedCarriers = new Map(expected.carriers.map((entry) => [entry.carrier, entry.role]));
    for (const [carrier, role] of expectedCarriers) {
      const actual = asRecord(carriers[carrier]);
      if (actual === null) promotionMessages.push(`machine.json.carriers is missing current compile carrier ${carrier}`);
      else compareExactValue(actual.role, role, `machine.json.carriers.${carrier}.role`, promotionMessages);
    }
    for (const carrier of Object.keys(carriers)) {
      if (!expectedCarriers.has(carrier)) promotionMessages.push(`machine.json.carriers includes extra carrier ${carrier}`);
    }
  }

  if (!Array.isArray(machine.deviationsFromCompile)) messages.push('machine.json.deviationsFromCompile must be an array');
  else {
    if (machine.deviationsFromCompile.length > LIMITS.deviations) messages.push(`machine.json.deviationsFromCompile exceeds the ${LIMITS.deviations}-item limit`);
    const observedDeviationFields = new Map<string, unknown>([['profile', machine.profile]]);
    if (program !== null) {
      for (const name of ['compilerCoordinateStart', 'compilerCoordinateEnd', 'gauge', 'position', 'wastePasses', 'bindOff'] as const) observedDeviationFields.set(`program.${name}`, program[name]);
    }
    if (initialSettings !== null) for (const name of INITIAL_SETTING_KEYS) observedDeviationFields.set(`program.initialSettings.${name}`, initialSettings[name]);
    if (carriers !== null) for (const [carrier, value] of Object.entries(carriers)) observedDeviationFields.set(`carriers.${carrier}.role`, asRecord(value)?.role);
    const expectedDeviationFields = new Map<string, unknown>();
    if (expected !== null) {
      expectedDeviationFields.set('profile', expected.profile);
      for (const [name, value] of Object.entries(expectedProgramFields(expected))) expectedDeviationFields.set(`program.${name}`, value);
      for (const [name, value] of Object.entries(expected.program.initialSettings)) expectedDeviationFields.set(`program.initialSettings.${name}`, value);
      for (const carrier of expected.carriers) expectedDeviationFields.set(`carriers.${carrier.carrier}.role`, carrier.role);
    }
    const deviationFields = new Set<string>();
    machine.deviationsFromCompile.slice(0, LIMITS.deviations).forEach((value, index) => {
      const record = asRecord(value);
      const path = `machine.json.deviationsFromCompile[${index}]`;
      if (record === null) messages.push(`${path} must be an object`);
      else {
        exactKeys(record, ['field', 'compiled', 'actual', 'reason'], path, messages);
        if (!nonEmpty(record.field) || !observedDeviationFields.has(String(record.field))) messages.push(`${path}.field is not a supported observed-setting path`);
        else {
          const field = String(record.field);
          if (deviationFields.has(field)) messages.push(`${path}.field duplicates ${field}`);
          deviationFields.add(field);
          if (Object.is(record.compiled, record.actual)) messages.push(`${path} must not record a no-op deviation`);
          if (!Object.is(record.actual, observedDeviationFields.get(field))) messages.push(`${path}.actual does not match the observed machine value at ${field}`);
          if (expectedDeviationFields.has(field) && !Object.is(record.compiled, expectedDeviationFields.get(field))) messages.push(`${path}.compiled does not match the current compile at ${field}`);
        }
        if (!nonEmpty(record.reason)) messages.push(`${path}.reason must be a non-empty string`);
      }
    });
    if (machine.deviationsFromCompile.length > 0) promotionMessages.push('machine.json records one or more deviations from the compiled program');
  }
  return { carrierLinks: carrierMap, coordinateBridge };
}

function validateGaugeStage(
  value: unknown,
  path: string,
  messages: string[],
  promotionMessages: string[],
): void {
  const record = asRecord(value);
  if (record === null) {
    messages.push(`${path} must be an object`);
    return;
  }
  if (record.status === 'measured') {
    exactKeys(record, ['status', 'stitchesPer10cm', 'rowsPer10cm'], path, messages);
    if (!finiteNumber(record.stitchesPer10cm, 0, true)) messages.push(`${path}.stitchesPer10cm must be positive`);
    if (!finiteNumber(record.rowsPer10cm, 0, true)) messages.push(`${path}.rowsPer10cm must be positive`);
  } else if (record.status === 'not-performed') {
    exactKeys(record, ['status', 'reason'], path, messages);
    if (!nonEmpty(record.reason)) messages.push(`${path}.reason must be non-empty`);
    promotionMessages.push(`${path} was not measured`);
  } else {
    messages.push(`${path}.status must be measured or not-performed`);
  }
}

function validateYarn(
  yarn: Record<string, unknown>,
  expected: CurrentRegistryMachineEvidence | null,
  messages: string[],
  promotionMessages: string[],
): YarnEvidence[] {
  exactKeys(yarn, ['$schema', 'kind', 'schemaVersion', 'yarns', 'tensionSwatch'], 'yarn.json', messages);
  requireHeader(yarn, 'yarn.json', 'kniterate-yarn-evidence-v1', messages);
  const yarnEvidence: YarnEvidence[] = [];
  const seenCarriers = new Set<string>();
  if (!Array.isArray(yarn.yarns) || yarn.yarns.length === 0) messages.push('yarn.json.yarns must be a non-empty array');
  else {
    if (yarn.yarns.length > LIMITS.yarns) messages.push(`yarn.json.yarns exceeds the ${LIMITS.yarns}-item carrier limit`);
    yarn.yarns.slice(0, LIMITS.yarns).forEach((value, index) => {
    const path = `yarn.json.yarns[${index}]`;
    const record = asRecord(value);
    if (record === null) {
      messages.push(`${path} must be an object`);
      return;
    }
    exactKeys(record, ['carrier', 'role', 'name', 'brand', 'line', 'lot', 'fiber', 'weight', 'ply', 'color', 'coneSource'], path, messages);
    if (typeof record.carrier !== 'string' || !/^[1-6]$/.test(record.carrier)) messages.push(`${path}.carrier must be 1-6`);
    else if (seenCarriers.has(record.carrier)) messages.push(`${path}.carrier duplicates ${record.carrier}`);
    else seenCarriers.add(record.carrier);
    if (!ROLES.includes(record.role as typeof ROLES[number])) messages.push(`${path}.role must be draw/pattern/waste`);
    for (const name of ['name', 'brand', 'line', 'lot', 'fiber', 'weight', 'color', 'coneSource'] as const) {
      if (!nonEmpty(record[name])) messages.push(`${path}.${name} must be a non-empty string`);
    }
    if (!integer(record.ply, 1)) messages.push(`${path}.ply must be a positive integer`);
      yarnEvidence.push({ carrier: String(record.carrier), role: String(record.role) });
    });
  }

  const tension = asRecord(yarn.tensionSwatch);
  if (tension === null) messages.push('yarn.json.tensionSwatch must be an object');
  else {
    exactKeys(tension, ['machineProfile', 'structure', 'settings', 'measuredBy', 'measuredOn', 'measurements', 'notes'], 'yarn.json.tensionSwatch', messages);
    for (const name of ['machineProfile', 'structure', 'measuredBy'] as const) {
      if (!nonEmpty(tension[name])) messages.push(`yarn.json.tensionSwatch.${name} must be non-empty`);
    }
    if (!validDate(tension.measuredOn)) messages.push('yarn.json.tensionSwatch.measuredOn must be YYYY-MM-DD');
    if (typeof tension.notes !== 'string') messages.push('yarn.json.tensionSwatch.notes must be a string');
    const settings = validateInitialSettings(tension.settings, 'yarn.json.tensionSwatch.settings', messages);
    if (expected !== null) {
      compareExactValue(tension.machineProfile, expected.profile, 'yarn.json.tensionSwatch.machineProfile', promotionMessages);
      if (settings !== null) for (const [field, expectedValue] of Object.entries(expected.program.initialSettings)) {
        compareExactValue(settings[field], expectedValue, `yarn.json.tensionSwatch.settings.${field}`, promotionMessages);
      }
    }
    const measurements = asRecord(tension.measurements);
    if (measurements === null) messages.push('yarn.json.tensionSwatch.measurements must be an object');
    else {
      exactKeys(measurements, ['offMachine', 'rested24h', 'steamed', 'wetFinished'], 'yarn.json.tensionSwatch.measurements', messages);
      for (const stage of ['offMachine', 'rested24h', 'steamed', 'wetFinished'] as const) {
        validateGaugeStage(measurements[stage], `yarn.json.tensionSwatch.measurements.${stage}`, messages, promotionMessages);
      }
    }
  }

  if (expected !== null) {
    const expectedCarriers = new Map(expected.carriers.map((entry) => [entry.carrier, entry.role]));
    for (const [carrier, role] of expectedCarriers) {
      const actual = yarnEvidence.find((entry) => entry.carrier === carrier);
      if (actual === undefined) promotionMessages.push(`yarn.json is missing current compile carrier ${carrier}`);
      else compareExactValue(actual.role, role, `yarn.json carrier ${carrier} role`, promotionMessages);
    }
    for (const actual of yarnEvidence) if (!expectedCarriers.has(actual.carrier)) promotionMessages.push(`yarn.json includes extra carrier ${actual.carrier}`);
  }
  return yarnEvidence;
}

function validateDimensions(
  value: unknown,
  path: string,
  messages: string[],
  promotionMessages: string[],
): string | null {
  const record = asRecord(value);
  if (record === null) {
    messages.push(`${path} must be an object`);
    return null;
  }
  if (record.status === 'measured') {
    exactKeys(record, ['status', 'width', 'height', 'measuredAt'], path, messages);
    if (!finiteNumber(record.width, 0, true)) messages.push(`${path}.width must be positive`);
    if (!finiteNumber(record.height, 0, true)) messages.push(`${path}.height must be positive`);
    if (!validDateTime(record.measuredAt)) messages.push(`${path}.measuredAt must be an RFC3339 date-time`);
    return validDateTime(record.measuredAt) ? record.measuredAt : null;
  } else if (record.status === 'not-measured') {
    exactKeys(record, ['status', 'reason'], path, messages);
    if (!nonEmpty(record.reason)) messages.push(`${path}.reason must be non-empty`);
    promotionMessages.push(`${path} was not measured`);
  } else messages.push(`${path}.status must be measured or not-measured`);
  return null;
}

function validateRun(
  dir: string,
  run: Record<string, unknown>,
  machineRanAt: unknown,
  expected: CurrentRegistryMachineEvidence | null,
  currentKcodeSha256: string | null,
  machineCoordinateBridge: ValidatedCoordinateBridge | null,
  messages: string[],
  promotionMessages: string[],
): string | null {
  exactKeys(run, ['$schema', 'kind', 'schemaVersion', 'operator', 'startedAt', 'endedAt', 'outcome', 'artifact', 'physicalPlacement', 'manualInterventions', 'observations'], 'run.json', messages);
  requireHeader(run, 'run.json', 'kniterate-run-observation-v1', messages);
  if (!nonEmpty(run.operator)) messages.push('run.json.operator must be a non-empty string');
  if (!validDateTime(run.startedAt)) messages.push('run.json.startedAt must be an RFC3339 date-time');
  if (!validDateTime(run.endedAt)) messages.push('run.json.endedAt must be an RFC3339 date-time');
  if (validDateTime(run.startedAt) && validDateTime(run.endedAt) && Date.parse(run.endedAt) < Date.parse(run.startedAt)) messages.push('run.json.endedAt must not precede startedAt');
  if (
    validDateTime(machineRanAt)
    && validDateTime(run.startedAt)
    && validDateTime(run.endedAt)
    && (Date.parse(machineRanAt) < Date.parse(run.startedAt) || Date.parse(machineRanAt) > Date.parse(run.endedAt))
  ) messages.push('machine.json.ranAt must fall within the run.json startedAt/endedAt interval');
  const outcome = OUTCOMES.includes(run.outcome as typeof OUTCOMES[number]) ? String(run.outcome) : null;
  if (outcome === null) messages.push(`run.json.outcome must be exactly one of ${OUTCOMES.join(', ')}`);
  else if (outcome !== 'clean') promotionMessages.push(`run.json.outcome is ${outcome}, not clean`);

  const artifact = asRecord(run.artifact);
  let displayedPassCount: number | null = null;
  let loadedKcodeSha256: string | null = null;
  if (artifact === null) messages.push('run.json.artifact must be an object');
  else {
    exactKeys(artifact, ['loadedKcodeSha256', 'displayedPassCount', 'manualProgramEdits'], 'run.json.artifact', messages);
    if (typeof artifact.loadedKcodeSha256 !== 'string' || !SHA256.test(artifact.loadedKcodeSha256)) messages.push('run.json.artifact.loadedKcodeSha256 must be SHA-256');
    else loadedKcodeSha256 = artifact.loadedKcodeSha256;
    if (artifact.displayedPassCount !== null && !integer(artifact.displayedPassCount, 0)) messages.push('run.json.artifact.displayedPassCount must be a nonnegative integer or null');
    else if (integer(artifact.displayedPassCount, 0)) displayedPassCount = artifact.displayedPassCount;
    if (typeof artifact.manualProgramEdits !== 'boolean') messages.push('run.json.artifact.manualProgramEdits must be boolean');
    if (currentKcodeSha256 !== null) compareExactValue(artifact.loadedKcodeSha256, currentKcodeSha256, 'run.json.artifact.loadedKcodeSha256', promotionMessages);
    if (expected !== null) compareExactValue(artifact.displayedPassCount, expected.emittedPassCount, 'run.json.artifact.displayedPassCount', promotionMessages);
    if (artifact.manualProgramEdits === true) promotionMessages.push('run.json records manual edits to the machine program');
  }
  if (
    loadedKcodeSha256 !== null
    && machineCoordinateBridge !== null
    && loadedKcodeSha256 !== machineCoordinateBridge.artifactKcodeSha256
  ) messages.push('machine.json.program.coordinateBridge artifact hash differs from run.json.artifact.loadedKcodeSha256');

  const placement = asRecord(run.physicalPlacement);
  if (placement === null) messages.push('run.json.physicalPlacement must be an object');
  else {
    exactKeys(placement, ['verified', 'compilerCoordinateStart', 'compilerCoordinateEnd', 'physicalNeedleStart', 'physicalNeedleEnd', 'orientation', 'method', 'verifiedBy', 'verifiedAt'], 'run.json.physicalPlacement', messages);
    if (typeof placement.verified !== 'boolean') messages.push('run.json.physicalPlacement.verified must be boolean');
    for (const name of ['compilerCoordinateStart', 'compilerCoordinateEnd'] as const) if (!integer(placement[name])) messages.push(`run.json.physicalPlacement.${name} must be an integer`);
    for (const name of ['physicalNeedleStart', 'physicalNeedleEnd'] as const) if (placement[name] !== null && !integer(placement[name])) messages.push(`run.json.physicalPlacement.${name} must be an integer or null`);
    if (placement.orientation !== null && !['increasing', 'decreasing'].includes(String(placement.orientation))) messages.push('run.json.physicalPlacement.orientation must be increasing, decreasing, or null');
    if (integer(placement.compilerCoordinateStart) && integer(placement.compilerCoordinateEnd) && placement.compilerCoordinateStart > placement.compilerCoordinateEnd) messages.push('run.json.physicalPlacement compiler coordinate start must not exceed end');
    for (const name of ['method', 'verifiedBy'] as const) if (placement[name] !== null && !nonEmpty(placement[name])) messages.push(`run.json.physicalPlacement.${name} must be non-empty or null`);
    if (placement.verifiedAt !== null && !validDateTime(placement.verifiedAt)) messages.push('run.json.physicalPlacement.verifiedAt must be an RFC3339 date-time or null');
    if (expected !== null) {
      compareExactValue(placement.compilerCoordinateStart, expected.compilerCoordinates.start, 'run.json.physicalPlacement.compilerCoordinateStart', promotionMessages);
      compareExactValue(placement.compilerCoordinateEnd, expected.compilerCoordinates.end, 'run.json.physicalPlacement.compilerCoordinateEnd', promotionMessages);
    }
    if (placement.verified !== true) {
      if (placement.orientation !== null) messages.push('run.json.physicalPlacement.orientation must remain null while placement is unverified');
      promotionMessages.push('physical placement from compiler coordinates to machine needle labels is unverified');
    }
    else {
      if (!integer(placement.physicalNeedleStart) || !integer(placement.physicalNeedleEnd)) promotionMessages.push('verified physical placement must record both physical needle labels');
      else {
        const expectedSpan = machineCoordinateBridge === null
          ? integer(placement.compilerCoordinateStart) && integer(placement.compilerCoordinateEnd)
            ? placement.compilerCoordinateEnd - placement.compilerCoordinateStart
            : null
          : machineCoordinateBridge.traceEnd - machineCoordinateBridge.traceStart;
        if (expectedSpan !== null && Math.abs(placement.physicalNeedleEnd - placement.physicalNeedleStart) !== expectedSpan) messages.push('verified physical placement span must equal the mapped trace-coordinate span; physical origin remains independently recorded');
        const expectedOrientation = placement.physicalNeedleEnd >= placement.physicalNeedleStart
          ? 'increasing'
          : 'decreasing';
        if (placement.orientation !== expectedOrientation) messages.push(`run.json.physicalPlacement.orientation must be ${expectedOrientation} for the recorded physical endpoints`);
      }
      if (!nonEmpty(placement.method)) promotionMessages.push('verified physical placement must record its machine/vendor datum method');
      if (!nonEmpty(placement.verifiedBy)) promotionMessages.push('verified physical placement must name an independent verifier');
      if (!validDateTime(placement.verifiedAt)) promotionMessages.push('verified physical placement must record verification time');
      else if (validDateTime(run.startedAt) && Date.parse(placement.verifiedAt) > Date.parse(run.startedAt)) promotionMessages.push('physical placement must be verified before the run starts');
      if (nonEmpty(placement.verifiedBy) && placement.verifiedBy === run.operator) promotionMessages.push('physical placement must be independently verified by someone other than the run operator');
    }
  }

  const validatePassIndexBound = (value: unknown, path: string): void => {
    if (!integer(value, 0)) return;
    const currentCount = expected?.emittedPassCount ?? null;
    if (currentCount !== null && value >= currentCount) messages.push(`${path} must be less than the current emitted pass count ${currentCount}`);
    if (displayedPassCount !== null && displayedPassCount !== currentCount && value >= displayedPassCount) messages.push(`${path} must be less than the displayed emitted pass count ${displayedPassCount}`);
  };

  if (!Array.isArray(run.manualInterventions)) messages.push('run.json.manualInterventions must be an array');
  else {
    if (run.manualInterventions.length > LIMITS.interventions) messages.push(`run.json.manualInterventions exceeds the ${LIMITS.interventions}-item limit`);
    run.manualInterventions.slice(0, LIMITS.interventions).forEach((value, index) => {
      const path = `run.json.manualInterventions[${index}]`;
      const record = asRecord(value);
      if (record === null) messages.push(`${path} must be an object`);
      else {
        exactKeys(record, ['section', 'passIndex', 'kind', 'alteredProgramOrSettings', 'description'], path, messages);
        if (!SECTIONS.includes(record.section as typeof SECTIONS[number])) messages.push(`${path}.section is invalid`);
        if (record.passIndex !== null && !integer(record.passIndex, 0)) messages.push(`${path}.passIndex must be nonnegative or null`);
        validatePassIndexBound(record.passIndex, `${path}.passIndex`);
        if (!INTERVENTION_KINDS.includes(record.kind as typeof INTERVENTION_KINDS[number])) messages.push(`${path}.kind is invalid`);
        if (typeof record.alteredProgramOrSettings !== 'boolean') messages.push(`${path}.alteredProgramOrSettings must be boolean`);
        if (!nonEmpty(record.description)) messages.push(`${path}.description must be non-empty`);
      }
    });
    if (run.manualInterventions.length > 0) promotionMessages.push('run.json records one or more manual interventions');
  }

  const observations = asRecord(run.observations);
  if (observations === null) messages.push('run.json.observations must be an object');
  else {
    exactKeys(observations, ['sections', 'stops', 'dimensionsCm', 'photos', 'notes'], 'run.json.observations', messages);
    const sections = asRecord(observations.sections);
    if (sections === null) messages.push('run.json.observations.sections must be an object');
    else {
      exactKeys(sections, SECTIONS, 'run.json.observations.sections', messages);
      for (const section of SECTIONS) {
        if (!SECTION_STATUSES.includes(sections[section] as typeof SECTION_STATUSES[number])) messages.push(`run.json.observations.sections.${section} is invalid`);
        else if (sections[section] !== 'clean') promotionMessages.push(`run.json observation ${section} is ${String(sections[section])}, not clean`);
      }
    }
    if (!Array.isArray(observations.stops)) messages.push('run.json.observations.stops must be an array');
    else {
      if (observations.stops.length > LIMITS.stops) messages.push(`run.json.observations.stops exceeds the ${LIMITS.stops}-item limit`);
      observations.stops.slice(0, LIMITS.stops).forEach((value, index) => {
        const path = `run.json.observations.stops[${index}]`;
        const record = asRecord(value);
        if (record === null) messages.push(`${path} must be an object`);
        else {
          exactKeys(record, ['section', 'passIndex', 'description'], path, messages);
          if (!SECTIONS.includes(record.section as typeof SECTIONS[number])) messages.push(`${path}.section is invalid`);
          if (record.passIndex !== null && !integer(record.passIndex, 0)) messages.push(`${path}.passIndex must be nonnegative or null`);
          validatePassIndexBound(record.passIndex, `${path}.passIndex`);
          if (!nonEmpty(record.description)) messages.push(`${path}.description must be non-empty`);
        }
      });
      if (observations.stops.length > 0) promotionMessages.push('run.json records one or more machine stops');
    }
    const dimensions = asRecord(observations.dimensionsCm);
    if (dimensions === null) messages.push('run.json.observations.dimensionsCm must be an object');
    else {
      exactKeys(dimensions, ['offMachine', 'rested24h'], 'run.json.observations.dimensionsCm', messages);
      const offMachineAt = validateDimensions(dimensions.offMachine, 'run.json.observations.dimensionsCm.offMachine', messages, promotionMessages);
      const rested24hAt = validateDimensions(dimensions.rested24h, 'run.json.observations.dimensionsCm.rested24h', messages, promotionMessages);
      if (validDateTime(run.endedAt)) {
        const endedAt = Date.parse(run.endedAt);
        if (offMachineAt !== null && Date.parse(offMachineAt) < endedAt) messages.push('off-machine dimensions must be measured at or after run.json.endedAt');
        if (rested24hAt !== null && Date.parse(rested24hAt) < endedAt + 24 * HOUR_MS) messages.push('rested24h dimensions must be measured at least 24 hours after run.json.endedAt');
      }
      if (offMachineAt !== null && rested24hAt !== null && Date.parse(rested24hAt) < Date.parse(offMachineAt)) messages.push('rested24h dimensions must not precede off-machine dimensions');
    }
    if (!Array.isArray(observations.photos)) messages.push('run.json.observations.photos must be an array');
    else {
      const views = new Set<string>();
      const paths = new Set<string>();
      const hashes = new Set<string>();
      if (observations.photos.length > LIMITS.photos) messages.push(`run.json.observations.photos exceeds the ${LIMITS.photos}-item limit`);
      observations.photos.slice(0, LIMITS.photos).forEach((value, index) => {
        const path = `run.json.observations.photos[${index}]`;
        const record = asRecord(value);
        if (record === null) messages.push(`${path} must be an object`);
        else {
          exactKeys(record, ['view', 'path', 'sha256'], path, messages);
          if (!PHOTO_VIEWS.includes(record.view as typeof PHOTO_VIEWS[number])) messages.push(`${path}.view is invalid`);
          else if (views.has(String(record.view))) messages.push(`${path}.view duplicates ${String(record.view)}`);
          else views.add(String(record.view));
          const inspectedPath = inspectPhotoPath(dir, record.path, path, messages);
          if (inspectedPath !== null) {
            if (paths.has(inspectedPath.identity)) messages.push(`${path}.path duplicates another photo receipt`);
            else paths.add(inspectedPath.identity);
            if (
              inspectedPath.localFile !== null
              && typeof record.sha256 === 'string'
              && SHA256.test(record.sha256)
              && sha256File(inspectedPath.localFile) !== record.sha256
            ) messages.push(`${path}.sha256 does not match the referenced local photo bytes`);
          }
          if (typeof record.sha256 !== 'string' || !SHA256.test(record.sha256)) messages.push(`${path}.sha256 must be SHA-256`);
          else if (hashes.has(record.sha256)) messages.push(`${path}.sha256 duplicates another photo receipt`);
          else hashes.add(record.sha256);
        }
      });
      for (const view of PHOTO_VIEWS) if (!views.has(view)) promotionMessages.push(`run.json is missing the ${view} photo receipt`);
    }
    if (typeof observations.notes !== 'string') messages.push('run.json.observations.notes must be a string');
  }
  return outcome;
}

function validateNarrative(text: string, messages: string[]): void {
  if (text.trim().length === 0) {
    messages.push('outcome.md must contain a narrative');
    return;
  }
  if (/\bTODO\b/.test(text)) messages.push('outcome.md still contains TODO placeholders');
  for (const heading of ['What worked', 'What failed or changed', 'Follow-up']) {
    const marker = `## ${heading}`;
    const headingStart = text.indexOf(marker);
    const contentStart = headingStart < 0 ? -1 : text.indexOf('\n', headingStart + marker.length);
    const nextHeading = contentStart < 0 ? -1 : text.indexOf('\n## ', contentStart + 1);
    const content = contentStart < 0 ? '' : text.slice(contentStart + 1, nextHeading < 0 ? undefined : nextHeading);
    if (content.replace(/[-*#\s]/g, '').length < 3) messages.push(`outcome.md must contain substantive text under ## ${heading}`);
  }
}

function validateEntry(root: string, id: string, currentCompilerFingerprint: string): SwatchEntryResult {
  const dir = join(root, id);
  const messages: string[] = [];
  const currentnessMessages: string[] = [];
  const promotionMessages: string[] = [];
  const required = ['spec.json', 'request.json', 'machine.json', 'yarn.json', 'run.json', 'out.k', 'out.kc', 'outcome.md'];
  for (const file of required) if (!existsSync(join(dir, file))) messages.push(`missing ${file}`);
  const resources = validateEntryResourceSizes(dir, messages);

  let spec: Record<string, unknown> = {};
  let machine: Record<string, unknown> = {};
  let yarn: Record<string, unknown> = {};
  let run: Record<string, unknown> = {};
  let request: Record<string, unknown> = {};
  let jsonParseOk = true;
  for (const [name, assign] of [
    ['spec.json', (v: Record<string, unknown>) => { spec = v; }],
    ['machine.json', (v: Record<string, unknown>) => { machine = v; }],
    ['yarn.json', (v: Record<string, unknown>) => { yarn = v; }],
    ['run.json', (v: Record<string, unknown>) => { run = v; }],
    ['request.json', (v: Record<string, unknown>) => { request = v; }],
  ] as const) {
    if (!resources.readable.has(name)) continue;
    try {
      const parsed = asRecord(readJson(join(dir, name)));
      if (parsed === null) {
        messages.push(`${name} must be a JSON object`);
        jsonParseOk = false;
      }
      else assign(parsed);
    } catch (error) {
      messages.push(`${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
      jsonParseOk = false;
    }
  }

  const placeholderScan = scanPlaceholdersBounded([spec, machine, yarn, run, request]);
  if (placeholderScan.placeholder) messages.push('entry still contains TODO/placeholder values');
  if (placeholderScan.limitMessage !== null) messages.push(placeholderScan.limitMessage);
  if (typeof spec.emitterCommit !== 'string' || !GIT_COMMIT.test(spec.emitterCommit)) messages.push('spec.emitterCommit must be a full Git commit identity');
  if (typeof spec.sourceFingerprint !== 'string' || spec.sourceFingerprint.length === 0) messages.push('spec.sourceFingerprint is required');
  if (typeof spec.compilerFingerprint !== 'string' || !SHA256.test(spec.compilerFingerprint)) messages.push('spec.compilerFingerprint must be SHA-256');
  if (typeof spec.knitoutSha256 !== 'string' || !SHA256.test(spec.knitoutSha256)) messages.push('spec.knitoutSha256 must be SHA-256');
  if (typeof spec.kcodeSha256 !== 'string' || !SHA256.test(spec.kcodeSha256)) messages.push('spec.kcodeSha256 must be SHA-256');
  if (spec.compileResultOk !== true) messages.push('spec.compileResultOk must be true');
  const specRequest = asRecord(spec.request);
  if (specRequest === null || specRequest.path !== 'request.json') messages.push('spec.request.path must point at request.json');
  if (request.reemitCommand !== undefined && typeof request.reemitCommand !== 'string') messages.push('request.reemitCommand, when present, must be a string and is never executed');
  let requestInputsWithinLimit = true;
  if (request.inputFiles !== undefined && !Array.isArray(request.inputFiles)) {
    messages.push('request.inputFiles must be an array');
    requestInputsWithinLimit = false;
  } else if (Array.isArray(request.inputFiles) && request.inputFiles.length > LIMITS.requestInputs) {
    messages.push(`request.inputFiles exceeds the ${LIMITS.requestInputs}-item limit`);
    requestInputsWithinLimit = false;
  }
  const reemit = asRecord(spec.reemitCheck);
  const reemitStatus = typeof reemit?.status === 'string' ? reemit.status : 'missing';
  if (!['matches', 'stale', 'not-run', 'not-applicable'].includes(reemitStatus)) messages.push('spec.reemitCheck.status must be matches/stale/not-run/not-applicable');

  const outK = join(dir, 'out.k');
  const outKc = join(dir, 'out.kc');
  if (resources.readable.has('out.k') && typeof spec.knitoutSha256 === 'string' && sha256File(outK) !== spec.knitoutSha256) messages.push('spec.knitoutSha256 does not match out.k');
  if (resources.readable.has('out.kc') && typeof spec.kcodeSha256 === 'string' && sha256File(outKc) !== spec.kcodeSha256) messages.push('spec.kcodeSha256 does not match out.kc');
  const commandCoverage = resources.readable.has('out.kc')
    ? deriveCommandCoverage(readFileSync(outKc, 'utf8'), currentnessMessages)
    : null;

  const entryCompilerFingerprint = typeof spec.compilerFingerprint === 'string' ? spec.compilerFingerprint : '';
  if (SHA256.test(entryCompilerFingerprint) && entryCompilerFingerprint !== currentCompilerFingerprint) currentnessMessages.push(`compiler fingerprint is stale: entry ${entryCompilerFingerprint}, current ${currentCompilerFingerprint}`);
  const canCompileCurrent = resources.ok
    && jsonParseOk
    && placeholderScan.limitMessage === null
    && requestInputsWithinLimit
    && resources.readable.has('request.json')
    && resources.readable.has('project.kniterate-studio.json');
  const current = canCompileCurrent ? compileRegistryRequestCurrent(dir, request) : null;
  if (current === null) {
    currentnessMessages.push('current recompile was skipped because evidence parsing or resource limits failed');
  } else if (!current.supported || !current.ok) currentnessMessages.push(...current.messages);
  else {
    if (typeof spec.sourceFingerprint === 'string' && current.sourceFingerprint !== spec.sourceFingerprint) currentnessMessages.push(`source fingerprint is stale: entry ${spec.sourceFingerprint}, current ${current.sourceFingerprint}`);
    if (resources.readable.has('out.k') && current.knitoutText !== null && !readFileSync(outK).equals(Buffer.from(current.knitoutText, 'utf8'))) currentnessMessages.push('stored out.k is not byte-identical to the current fixed in-process recompile');
    if (resources.readable.has('out.kc') && current.kcodeText !== null && !readFileSync(outKc).equals(Buffer.from(current.kcodeText, 'utf8'))) currentnessMessages.push('stored out.kc is not byte-identical to the current fixed in-process re-emission');
    if (typeof spec.knitoutSha256 === 'string' && current.knitoutSha256 !== spec.knitoutSha256) currentnessMessages.push(`current out.k SHA-256 differs: entry ${spec.knitoutSha256}, current ${current.knitoutSha256}`);
    if (typeof spec.kcodeSha256 === 'string' && current.kcodeSha256 !== spec.kcodeSha256) currentnessMessages.push(`current out.kc SHA-256 differs: entry ${spec.kcodeSha256}, current ${current.kcodeSha256}`);
  }

  const expectedMachine = current?.expectedMachine ?? null;
  const machineEvidence = validateMachine(machine, expectedMachine, messages, promotionMessages);
  const yarns = validateYarn(yarn, expectedMachine, messages, promotionMessages);
  for (const [carrier, link] of machineEvidence.carrierLinks) {
    const linked = yarns[link.yarnIndex];
    if (linked === undefined) messages.push(`machine.json carrier ${carrier} references missing yarn.json.yarns[${link.yarnIndex}]`);
    else {
      if (linked.carrier !== carrier) messages.push(`machine.json carrier ${carrier} links to yarn carrier ${linked.carrier}`);
      if (linked.role !== link.role) messages.push(`machine.json carrier ${carrier} role does not match its yarn record`);
    }
  }
  const outcome = validateRun(
    dir,
    run,
    machine.ranAt,
    expectedMachine,
    current?.kcodeSha256 ?? null,
    machineEvidence.coordinateBridge,
    messages,
    promotionMessages,
  );
  const narrative = resources.readable.has('outcome.md') ? readFileSync(join(dir, 'outcome.md'), 'utf8') : '';
  validateNarrative(narrative, messages);

  const stale = currentnessMessages.length > 0;
  const ok = messages.length === 0;
  const knitProven = ok && !stale && promotionMessages.length === 0;
  return {
    id,
    ok,
    stale,
    knitProven,
    outcome,
    messages,
    currentnessMessages,
    promotionMessages,
    registryEntry: knitProven ? {
      id,
      sourceFingerprint: String(spec.sourceFingerprint),
      knitoutSha256: String(spec.knitoutSha256),
      kcodeSha256: String(spec.kcodeSha256),
      compilerFingerprint: entryCompilerFingerprint,
    } : null,
    controllerObservedCoverage: knitProven && commandCoverage !== null ? {
      machineSerial: String(machine.machineSerial),
      controlSoftwareVersion: String(machine.controlSoftwareVersion),
      kcodeSha256: String(spec.kcodeSha256),
      ...commandCoverage,
    } : null,
  };
}

function aggregateControllerCoverage(results: readonly SwatchEntryResult[]) {
  const observed = results.flatMap((result) =>
    result.controllerObservedCoverage === null ? [] : [result.controllerObservedCoverage]);
  const coverageByMachine = new Map<string, ControllerObservedCoverage[]>();
  for (const coverage of observed) {
    const key = `${coverage.machineSerial}|${coverage.controlSoftwareVersion}`;
    const entries = coverageByMachine.get(key) ?? [];
    entries.push(coverage);
    coverageByMachine.set(key, entries);
  }
  const machines = [...coverageByMachine.values()].map((entries) => {
    const first = entries[0]!;
    const combinations = [...new Map(entries.flatMap((entry) => entry.combinations).map((value) => [
      `${value.operation}|${value.direction}|${value.carrier}|${value.rack}`,
      value,
    ] as const)).values()].sort((a, b) =>
      a.operation.localeCompare(b.operation)
      || a.direction.localeCompare(b.direction)
      || a.carrier.localeCompare(b.carrier)
      || a.rack - b.rack);
    return {
      key: `${encodeURIComponent(first.machineSerial)}::${encodeURIComponent(first.controlSoftwareVersion)}`,
      machineSerial: first.machineSerial,
      controlSoftwareVersion: first.controlSoftwareVersion,
      exactArtifactCount: entries.length,
      kcodeSha256: [...new Set(entries.map((entry) => entry.kcodeSha256))].sort(),
      operations: [...new Set(entries.flatMap((entry) => entry.operations))].sort(),
      directions: [...new Set(entries.flatMap((entry) => entry.directions))].sort(),
      carriers: [...new Set(entries.flatMap((entry) => entry.carriers))].sort(),
      racks: [...new Set(entries.flatMap((entry) => entry.racks))].sort((a, b) => a - b),
      combinations,
    };
  }).sort((a, b) =>
    a.machineSerial.localeCompare(b.machineSerial)
    || a.controlSoftwareVersion.localeCompare(b.controlSoftwareVersion));
  const byMachine = Object.fromEntries(machines.map((machine) => [machine.key, machine]));
  return {
    status: machines.length === 0 ? 'pending' : 'exact-artifact-observed',
    evidenceCount: observed.length,
    profile: {
      id: KNITERATE_7GG_KCODE_PROFILE_V2.profileId,
      version: KNITERATE_7GG_KCODE_PROFILE_V2.profileVersion,
      sha256: sha256Text(JSON.stringify(KNITERATE_7GG_KCODE_PROFILE_V2)),
      contractSha256: sha256Text(JSON.stringify(KNITERATE_7GG_KCODE_PROFILE_V2.operations)),
    },
    byMachine,
    note: 'Coverage is keyed by machine serial and control-software version and derived only from exact clean, current, non-deviated Knit-proven artifacts; software validation alone never contributes controller-observed evidence.',
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  let root = 'registry/swatches';
  let json = false;
  let checkManifest = false;
  let outPath: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '--json') json = true;
    else if (arg === '--check') checkManifest = true;
    else if (arg === '-o' || arg === '--out') outPath = argv[++index];
    else if (arg === '-h' || arg === '--help') {
      process.stdout.write('usage: pnpm kniterate:swatches [registry/swatches] [--check] [--json] [-o report.json]\n');
      process.exit(0);
    } else root = arg;
  }

  const absRoot = resolve(root);
  const registryMessages: string[] = [];
  const addRegistryMessage = (message: string, force = false): void => {
    if (registryMessages.length < LIMITS.registryMessages) registryMessages.push(message);
    else if (force) registryMessages[LIMITS.registryMessages - 1] = message;
  };
  let rootUsable = false;
  try {
    const rootStats = lstatSync(absRoot);
    if (rootStats.isSymbolicLink()) addRegistryMessage('registry root must not be a symbolic link');
    else if (!rootStats.isDirectory()) addRegistryMessage('registry root must be a directory');
    else {
      const intendedParent = realpathSync(dirname(absRoot));
      const physicalRoot = realpathSync(absRoot);
      if (dirname(physicalRoot) !== intendedParent || basename(physicalRoot) !== basename(absRoot)) {
        addRegistryMessage('registry root must remain a direct child of its intended registry parent');
      } else rootUsable = true;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') addRegistryMessage('registry root is missing');
    else addRegistryMessage(`registry root could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
  }
  const templateMessages = rootUsable ? validateTemplate(absRoot) : [];
  const currentCompilerFingerprint = computeCompilerFingerprint();
  const entryDirectories: string[] = [];
  if (rootUsable) {
    const directory = opendirSync(absRoot);
    try {
      let scannedDirents = 0;
      let entry = directory.readSync();
      while (entry !== null) {
        scannedDirents += 1;
        if (scannedDirents > LIMITS.dirents) {
          addRegistryMessage(`registry contains more than the ${LIMITS.dirents}-dirent intake limit`, true);
          break;
        }
        if (!entry.name.startsWith('.') && !['_template', '_schema.json', 'README.md'].includes(entry.name)) {
          if (entry.isSymbolicLink()) addRegistryMessage(`registry entry ${entry.name} must not be a symbolic link`);
          else if (!entry.isDirectory()) addRegistryMessage(`unexpected non-directory registry entry ${entry.name}`);
          else {
            entryDirectories.push(entry.name);
            if (entryDirectories.length > LIMITS.entries) {
              addRegistryMessage(`registry contains more than the ${LIMITS.entries}-entry limit`, true);
              break;
            }
          }
        }
        entry = directory.readSync();
      }
    } finally {
      directory.closeSync();
    }
  }
  entryDirectories.sort();
  const entries = entryDirectories.length <= LIMITS.entries ? entryDirectories : [];
  const results = entries.map((id) => validateEntry(absRoot, id, currentCompilerFingerprint));
  const manifest = {
    kind: 'kniterate-knit-proven-registry',
    schemaVersion: 1,
    compilerFingerprint: currentCompilerFingerprint,
    entries: results.flatMap((result) => result.registryEntry === null ? [] : [result.registryEntry]),
  };
  const manifestPath = resolve(absRoot, '..', 'knit-proven.json');
  const expectedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestMessages: string[] = [];
  const structurallyValid = templateMessages.length === 0
    && registryMessages.length === 0
    && results.every((result) => result.ok);
  if (checkManifest) {
    try {
      const stats = lstatSync(manifestPath);
      if (stats.isSymbolicLink()) manifestMessages.push('registry/knit-proven.json must not be a symbolic link');
      else if (!stats.isFile()) manifestMessages.push('registry/knit-proven.json must be a regular file');
      else if (stats.size > LIMITS.manifestBytes) manifestMessages.push(`registry/knit-proven.json exceeds the ${LIMITS.manifestBytes}-byte limit`);
      else if (readFileSync(manifestPath, 'utf8') !== expectedManifest) manifestMessages.push('registry/knit-proven.json is stale; run pnpm kniterate:swatches and commit the result');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') manifestMessages.push(`generated registry manifest is missing: ${manifestPath}`);
      else manifestMessages.push(`registry/knit-proven.json could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (structurallyValid) {
    writeManifestAtomically(manifestPath, expectedManifest);
  } else {
    manifestMessages.push('registry/knit-proven.json was preserved because template, intake, or entry validation failed');
  }

  const ok = structurallyValid && manifestMessages.length === 0;
  const controllerObservedCoverage = aggregateControllerCoverage(results);
  const report = {
    kind: 'kniterate-swatch-registry-report',
    schemaVersion: '1',
    ok,
    currentCommit: currentCommit(),
    compilerFingerprint: currentCompilerFingerprint,
    entryCount: entryDirectories.length,
    knitProvenCount: results.filter((result) => result.knitProven).length,
    staleCount: results.filter((result) => result.stale).length,
    nonPromotableCount: results.filter((result) => result.ok && !result.knitProven).length,
    controllerObservedCoverage,
    templateMessages,
    registryMessages,
    manifestMessages,
    entries: results,
  };

  if (outPath !== undefined) {
    const destination = resolve(outPath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    process.stdout.write(`kniterate swatch registry: ${results.filter((result) => result.ok).length}/${results.length} entries valid; ${report.knitProvenCount} knit-proven current match(es)${ok ? '' : ' · FAILED'}\n`);
    for (const message of templateMessages) process.stdout.write(`  ✗ template: ${message}\n`);
    for (const message of registryMessages) process.stdout.write(`  ✗ registry: ${message}\n`);
    for (const message of manifestMessages) process.stdout.write(`  ✗ manifest: ${message}\n`);
    if (results.length === 0) process.stdout.write('  note: no physical swatch entries yet; verdict remains swatch-recommended.\n');
    for (const result of results) {
      process.stdout.write(`  ${result.ok ? '✓' : '✗'} ${result.id}${result.outcome ? ` · ${result.outcome}` : ''}${result.stale ? ' · stale/not-current' : ''}${result.knitProven ? ' · knit-proven' : ' · not promoted'}\n`);
      for (const message of result.messages.slice(0, 8)) process.stdout.write(`      ${message}\n`);
      for (const message of result.currentnessMessages.slice(0, 8)) process.stdout.write(`      currentness: ${message}\n`);
      for (const message of result.promotionMessages.slice(0, 8)) process.stdout.write(`      promotion: ${message}\n`);
    }
  }
  if (!ok) process.exit(2);
}

main();
