import { expect, it } from 'vitest';
import { AUTHORED_CAPACITY_LIMITS_V1 } from '@kniterate-studio/project-contract';
import { KCODE_RESOURCE_LIMITS_V1, MACHINE_EXECUTION_LIMITS_V1 } from '@kniterate-studio/machine-lib/browser';

it('keeps every admitted authored program within the execution event budget', () => {
  const selections = AUTHORED_CAPACITY_LIMITS_V1.selectedCells;
  const passes = Math.min(AUTHORED_CAPACITY_LIMITS_V1.loweredPasses, KCODE_RESOURCE_LIMITS_V1['authored-v1'].passRecords);
  const records = Math.min(AUTHORED_CAPACITY_LIMITS_V1.kcodeRecords, KCODE_RESOURCE_LIMITS_V1['authored-v1'].records);
  // MachineTrace projects at most one action per selected cell, or one action
  // for an empty pass. Execution adds two boundary events per pass and one per
  // RACK record. Counting every admitted record as RACK deliberately overbounds
  // their total. This guards the admission/replay contracts, not physical size.
  const maximumEvents = selections + 3 * passes + records;
  expect(maximumEvents).toBeLessThanOrEqual(MACHINE_EXECUTION_LIMITS_V1.events);
});
