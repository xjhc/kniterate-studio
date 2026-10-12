import {
  createMachineExecutionIndexV1, inspectMachineExecutionV1,
  type KCodeDocumentV1, type MachineExecutionIndexV1, type MachineExecutionInspectionV1,
  type MachineScenePassV1, type MachineSceneV1, type MachineValidationReportV1,
} from '@kniterate-studio/machine-lib/browser';
import { compareKcDocuments, openMachineDocument, type MachineDocument } from '../engine';
import { createForeignFabricCompiler } from '../fabric/compileForeignFabricPreview';
import type { ForeignFabricPreviewRequest } from '../fabric/fabricProtocol';

export type PassNavigation = Pick<MachineScenePassV1, 'passIndex' | 'direction' | 'operation' | 'carrier'>;
export interface ExecutionNavigation {
  eventCount: number;
  passes: MachineExecutionIndexV1['passes'];
  rackEvents: readonly { eventIndex: number; rackCommandIndex: number }[];
}
export function executionNavigation(index: MachineExecutionIndexV1): ExecutionNavigation {
  return {
    eventCount: index.events.length, passes: index.passes,
    rackEvents: index.events.flatMap((event) => event.kind === 'rack'
      ? [{ eventIndex: event.index, rackCommandIndex: event.rackCommandIndex }] : []),
  };
}

/** Source and verdict evidence for presentation; full parse/trace stays in its owner. */
export type MachineDocumentView = Omit<MachineDocument, 'kcode'> & {
  kcode: {
    dialect: NonNullable<MachineDocument['kcode']>['dialect'];
    document: Pick<KCodeDocumentV1, 'rawText' | 'metadata'> | null;
    inspection?: {
      hasScene: boolean;
      topologyEligible: boolean;
      navigation: ExecutionNavigation | null;
      passNavigation: readonly PassNavigation[];
      error: string | null;
    };
  } | null;
};
export type MovementValidation = Pick<MachineValidationReportV1, 'diagnostics' | 'passStates' | 'operationalAssurance'>;
export interface MachineInspection {
  selectedPass: number;
  sourceLine: number | null;
  snapshot: MachineExecutionInspectionV1 | null;
  /** Only the selected pass, within the complete program's coordinate domain. */
  scene: MachineSceneV1 | null;
  validation: MovementValidation | null;
}
export type InspectionCursor = { eventIndex: number } | { passIndex: number; actionIndex?: number };
export type TopologyCursor = Omit<Extract<ForeignFabricPreviewRequest, { kind: 'window-foreign-topology' }>, 'kind'>;

/** Owns the canonical full document and derived indices in one Worker. */
export function createMachineInspector(document: MachineDocument) {
  const evidence = document.kcode;
  let index: MachineExecutionIndexV1 | null = null;
  let executionError: string | null = null;
  if (evidence?.trace && evidence.validation) {
    try { index = createMachineExecutionIndexV1(evidence.trace, evidence.validation); }
    catch (error) { executionError = error instanceof Error ? error.message : String(error); }
  }
  const { kcode: _, ...info } = document;
  const topologyEligible = document.verdict.state === 'surface' && evidence?.validation?.ok === true && evidence.trace !== null;
  const view: MachineDocumentView = {
    ...info,
    kcode: evidence === null ? null : {
      dialect: evidence.dialect,
      document: evidence.document === null ? null : { rawText: evidence.document.rawText, metadata: evidence.document.metadata },
      inspection: {
        hasScene: evidence.scene !== null, topologyEligible,
        navigation: index === null ? null : executionNavigation(index), error: executionError,
        passNavigation: evidence.scene?.passes.map(({ passIndex, direction, operation, carrier }) => ({ passIndex, direction, operation, carrier })) ?? [],
      },
    },
  };
  const inspect = (cursor: InspectionCursor): MachineInspection => {
    let selectedPass = 'passIndex' in cursor ? cursor.passIndex : 0;
    let snapshot: MachineExecutionInspectionV1 | null = null;
    if (index !== null) {
      let eventIndex: number;
      if ('eventIndex' in cursor) eventIndex = cursor.eventIndex;
      else {
        const pass = index.passes[cursor.passIndex];
        if (!pass) throw new RangeError('Inspection pass is outside this program.');
        eventIndex = cursor.actionIndex === undefined ? pass.beginEventIndex : pass.actionEventIndices[cursor.actionIndex] ?? -2;
      }
      snapshot = inspectMachineExecutionV1(index, eventIndex);
      selectedPass = eventIndex < 0 ? 0 : snapshot.event?.passIndex ?? Math.max(0, index.passes.length - 1);
    }
    const scenePass = evidence?.scene?.passes.find((pass) => pass.passIndex === selectedPass);
    const passState = evidence?.validation?.passStates.find((pass) => pass.passIndex === selectedPass);
    return {
      selectedPass, snapshot,
      sourceLine: snapshot?.event?.sourceSpan.start.line ?? evidence?.trace?.passes[selectedPass]?.source.footer.start.line ?? null,
      scene: evidence?.scene ? { ...evidence.scene, passes: scenePass ? [scenePass] : [] } : null,
      validation: evidence?.validation ? {
        diagnostics: evidence.validation.diagnostics,
        operationalAssurance: evidence.validation.operationalAssurance,
        passStates: passState ? [passState] : [],
      } : null,
    };
  };
  const compileTopology = createForeignFabricCompiler();
  let topologyLoaded = false;
  return {
    document: view,
    initial: inspect(index?.passes.length ? { passIndex: 0 } : { eventIndex: -1 }),
    inspect,
    topology(cursor: TopologyCursor) {
      if (!topologyEligible || !evidence?.trace) throw new Error('Topology requires a validated, eligible document.');
      const response = compileTopology(topologyLoaded
        ? { kind: 'window-foreign-topology', ...cursor }
        : { kind: 'project-foreign-topology', trace: evidence.trace, ...cursor });
      topologyLoaded = response.kind === 'foreign-topology-complete';
      return response;
    },
    compare(filename: string, source: string) {
      // Direct KCode source is one code unit per original byte, including rejected bytes.
      const bytes = Uint8Array.from(source, (character) => character.charCodeAt(0));
      return compareKcDocuments(document, openMachineDocument(filename, bytes, { dialect: 'knitout-vendor' }));
    },
  };
}
