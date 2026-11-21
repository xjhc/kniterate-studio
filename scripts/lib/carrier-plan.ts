import { KNITERATE_7GG_MACHINE_SAFETY_ENVELOPE_V1 as envelope, operatedNeedles } from '../../packages/machine-lib/src/knitout/kcode/machine-safety.js';
import type { MachineTraceV1 } from '../../packages/machine-lib/src/knitout/kcode/machine-trace.js';
import { ALL_CARRIERS } from '../../packages/machine-lib/src/knitout/types.js';

interface Pickup { pass: number; previous: Pickup | null }
interface Path { pickups: number; last: Pickup | null }

/**
 * Shortest path over the entire vendor trace. At a zero-roller plain movement pass a feeder
 * can stay put or follow the encoded pickup. Every other pickup and needle action is fixed.
 * At a given boundary, two paths to the same stop have identical future choices in this
 * model, so only the cheaper one is needed. Feeder states are independent for this bound.
 */
export function carrierPickupPlan(trace: MachineTraceV1) {
  const passes = trace.passes.map((pass) => ({
    pass, needles: operatedNeedles(pass),
    optional: pass.carrier !== '0' && (pass.operation === 'Tu-Tu' || pass.operation === 'Kn-Kn') && pass.roller === 0
      && pass.carrierStops?.left !== envelope.carrierHomeStops.value[pass.carrier]
      && pass.actions.length > 0 && pass.actions.every((a) => a.kind === 'move'),
  }));
  const unknown = passes.find(({ pass }) => pass.actions.some((a) => a.kind === 'unknown'));
  if (unknown) return { available: false, reason: `Unknown operation at pass ${unknown.pass.index + 1}.` };
  const carriers = ALL_CARRIERS.map((carrier) => {
    const home = envelope.carrierHomeStops.value[carrier];
    let states = new Map<number, Path>([[home, { pickups: 0, last: null }]]);
    const candidates: number[] = [];
    let firstUnreachablePass: number | null = null;
    for (const { pass, needles, optional } of passes) {
      const number = pass.index + 1;
      if (pass.carrier === carrier) {
        if (optional) candidates.push(number);
        const stops = pass.carrierStops!;
        const [from, to] = pass.direction === '>>' ? [stops.left, stops.right] : [stops.right, stops.left];
        const path = states.get(from);
        // Keeping the feeder parked is the identity edge at every optional pickup.
        if (!optional) states = new Map();
        if (path && Math.min(from, to) >= home) {
          const cost = path.pickups + Number(optional);
          if (cost < (states.get(to)?.pickups ?? Infinity)) states.set(to, {
            pickups: cost, last: optional ? { pass: number, previous: path.last } : path.last,
          });
        }
      } else if (needles.length > 0) {
        for (const stop of states.keys()) {
          if (needles.some((needle) => Math.abs(needle.position - stop) < envelope.stoppingDistance.value)) states.delete(stop);
        }
      }
      if (states.size === 0) firstUnreachablePass ??= number;
    }
    const best = states.get(home);
    const kept = new Set<number>();
    for (let node = best?.last; node; node = node.previous) kept.add(node.pass);
    return { carrier, recordedPickups: candidates.length, minimumPickups: best?.pickups ?? null,
      firstUnreachablePass, omittedInModel: best ? candidates.filter((n) => !kept.has(n)) : [] };
  });
  const available = carriers.every((c) => c.minimumPickups !== null);
  return { available, carriers, recordedPickups: carriers.reduce((sum, c) => sum + c.recordedPickups, 0),
    minimumPickups: available ? carriers.reduce((sum, c) => sum + c.minimumPickups!, 0) : null,
    scope: 'Fixed carriage passes and work order, all six home stops, pickup continuity and needle clearance at each pass. Counts zero-roller movement-only pickups away from home. Yarn drag, feeder interactions and converter rescheduling require replay before changing a program.' };
}
