/**
 * Machine-setting consumption registry.
 *
 * Pattern 5 guardrail: the compiler may accept machine knobs even when a
 * selected path does not consume them. Keep that contract explicit and warn
 * at compile time instead of silently dropping user-supplied settings.
 */

import {
  CHAIN_BINDOFF_DEFAULTS,
  FAIRISLE_PARK_BINDOFF_DEFAULTS,
  type BindOffStyle,
} from '../passes/bind-off.js';
import { FAIRISLE_CARRIER_INTRO_DEFAULTS } from '../passes/carrier-intro.js';
import { WASTE_BASE_DEFAULTS } from '../passes/waste-section.js';
import type { ValidationMessage } from '../../validators/knitout-program.js';
import type { CompileChartToPlanInput } from './compile-chart.js';
import { MACHINE_EFFECTIVE_KNITERATE_SETTINGS } from './kniterate-settings-ops.js';

interface PackageMachineSettingsInput {
  readonly kniterate?: unknown;
}

type MachineSettingPrefix =
  | 'kniterate'
  | 'wasteMachineConfig'
  | 'bindOffMachineConfig'
  | 'fairisleParkConfig'
  | 'fairisleCarrierIntro';

export type MachineSettingPath =
  | `kniterate.${string}`
  | `wasteMachineConfig.${string}`
  | `bindOffMachineConfig.${string}`
  | `fairisleParkConfig.${string}`
  | `fairisleCarrierIntro.${string}`
  | 'fairisleCarrierIntro';

interface MachineSettingsConsumptionContext {
  readonly input: CompileChartToPlanInput;
  readonly bindOff: BindOffStyle;
}

interface MachineSettingConsumptionRule {
  readonly prefix: MachineSettingPrefix;
  readonly consumedBy: string;
  readonly isActive: (ctx: MachineSettingsConsumptionContext) => boolean;
}

const MACHINE_SETTING_CONSUMPTION_RULES: readonly MachineSettingConsumptionRule[] = [
  {
    prefix: 'kniterate',
    consumedBy: 'compile-chart body/settings ops and knitout headers',
    isActive: () => true,
  },
  {
    prefix: 'wasteMachineConfig',
    consumedBy: 'waste-section',
    isActive: () => true,
  },
  {
    prefix: 'bindOffMachineConfig',
    consumedBy: 'machine-bindoff',
    isActive: ({ bindOff }) => bindOff === 'machine-bindoff',
  },
  {
    prefix: 'fairisleParkConfig',
    consumedBy: 'fairisle-park-bindoff',
    isActive: ({ bindOff }) => bindOff === 'fairisle-park-bindoff',
  },
  {
    prefix: 'fairisleCarrierIntro',
    consumedBy: 'floats fairisle carrier intro',
    isActive: ({ input }) => input.backBedStyle === 'floats' && input.fairisleCarrierIntro !== undefined,
  },
];

const MACHINE_SETTING_FIELD_REGISTRY: Readonly<Record<MachineSettingPrefix, readonly string[]>> = {
  kniterate: MACHINE_EFFECTIVE_KNITERATE_SETTINGS,
  wasteMachineConfig: Object.keys(WASTE_BASE_DEFAULTS),
  bindOffMachineConfig: Object.keys(CHAIN_BINDOFF_DEFAULTS),
  fairisleParkConfig: Object.keys(FAIRISLE_PARK_BINDOFF_DEFAULTS),
  fairisleCarrierIntro: Object.keys(FAIRISLE_CARRIER_INTRO_DEFAULTS),
};

export function machineSettingConsumptionWarnings(
  input: CompileChartToPlanInput,
  bindOff: BindOffStyle,
): ValidationMessage[] {
  const ctx: MachineSettingsConsumptionContext = { input, bindOff };
  const out: ValidationMessage[] = [...unknownChartMachineSettingWarnings(input)];

  for (const rule of MACHINE_SETTING_CONSUMPTION_RULES) {
    const paths = suppliedSettingPaths(input, rule.prefix);
    if (paths.length === 0) continue;
    if (rule.isActive(ctx)) continue;
    out.push({
      severity: 'warning',
      rule: 'machine-setting-ignored',
      message: `${paths.join(', ')} supplied but not consumed by this compile path; active consumer would be ${rule.consumedBy}.`,
    });
  }

  return out;
}

export function packageMachineSettingConsumptionWarnings(
  input: PackageMachineSettingsInput,
): ValidationMessage[] {
  return unknownMachineSettingFieldWarnings('kniterate', input.kniterate);
}

export function consumedMachineSettingPrefixes(): readonly string[] {
  return MACHINE_SETTING_CONSUMPTION_RULES.map((rule) => rule.prefix);
}

function unknownChartMachineSettingWarnings(
  input: CompileChartToPlanInput,
): ValidationMessage[] {
  return [
    ...unknownMachineSettingFieldWarnings('kniterate', input.kniterate),
    ...unknownMachineSettingFieldWarnings('wasteMachineConfig', input.wasteMachineConfig),
    ...unknownMachineSettingFieldWarnings('bindOffMachineConfig', input.bindOffMachineConfig),
    ...unknownMachineSettingFieldWarnings('fairisleParkConfig', input.fairisleParkConfig),
    ...unknownMachineSettingFieldWarnings('fairisleCarrierIntro', input.fairisleCarrierIntro),
  ];
}

function unknownMachineSettingFieldWarnings(
  prefix: MachineSettingPrefix,
  settings: unknown,
): ValidationMessage[] {
  if (settings === undefined) return [];
  if (!isRecord(settings)) return [];
  const known = new Set<string>(MACHINE_SETTING_FIELD_REGISTRY[prefix]);
  const unknown = Object.keys(settings).filter((key) => !known.has(key)).sort();
  if (unknown.length === 0) return [];
  const supported = MACHINE_SETTING_FIELD_REGISTRY[prefix].map((key) => `${prefix}.${key}`);
  return [{
    severity: 'warning',
    rule: 'machine-setting-unknown',
    message: `${unknown.map((key) => `${prefix}.${key}`).join(', ')} supplied but not recognized by the machine-setting registry; supported keys are ${supported.join(', ')}.`,
  }];
}

function suppliedSettingPaths(
  input: CompileChartToPlanInput,
  prefix: MachineSettingPrefix,
): MachineSettingPath[] {
  switch (prefix) {
    case 'kniterate':
      return objectSettingPaths(prefix, input.kniterate);
    case 'wasteMachineConfig':
      return objectSettingPaths(prefix, input.wasteMachineConfig);
    case 'bindOffMachineConfig':
      return objectSettingPaths(prefix, input.bindOffMachineConfig);
    case 'fairisleParkConfig':
      return objectSettingPaths(prefix, input.fairisleParkConfig);
    case 'fairisleCarrierIntro':
      if (input.fairisleCarrierIntro === undefined) return [];
      if (typeof input.fairisleCarrierIntro !== 'object') return ['fairisleCarrierIntro'];
      return objectSettingPaths(prefix, input.fairisleCarrierIntro);
  }
}

function objectSettingPaths(
  prefix: MachineSettingPrefix,
  value: object | undefined,
): MachineSettingPath[] {
  if (value === undefined) return [];
  return Object.keys(value)
    .sort()
    .map((key) => `${prefix}.${key}` as MachineSettingPath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
