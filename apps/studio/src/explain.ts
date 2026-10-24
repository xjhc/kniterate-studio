import { resolveValidatorMessage } from '@kniterate-studio/machine-lib/browser';

/**
 * Plain-language answers for `studio explain <term>`: design vocabulary,
 * Plan rules, then the validator message catalog. An unknown term says so
 * instead of guessing.
 */

const GLOSSARY: Record<string, string> = {
  chart: 'The colorwork design: width in stitches (needles) × height in rows, one palette color per cell. Its counts are the only source of truth for the knitted program.',
  palette: 'The chart colors. Each color used in the chart must be bound to a yarn on a carrier (C2–C5 in V1).',
  yarn: 'A palette color bound to a carrier with a yarn name (set-yarn-assignment). Keep carrier numbers out of yarn names.',
  carrier: 'A yarn feeder. V1 profile: C1 draw thread, C2–C5 pattern yarns, C6 waste.',
  gauge: 'Measured stitches and rows per 10 cm for this yarn, stitch size and fabric (set-gauge). Source is "measured" (from a swatch) or "assumed". Sizing in cm needs it.',
  target: 'The requested finished size in cm (set-target). It is checked against the chart at the recorded gauge, never applied automatically; size-off-target findings carry the resize edits.',
  plan: 'Derived sizing facts: stitch and row counts with provenance, needle range, yarns and carriers, predicted cm under the gauge, and size checks against the target.',
  provenance: 'Where a value came from: authored (you set it), calculated (derived by a named formula), measured (from a swatch), or assumed (a default that sizing cannot trust).',
  finding: 'A diagnostic with an owner. design: you can fix it by changing the project. compiler: needs an engine repair. operator: a check done at the machine.',
  readiness: 'Computed from the verdict and every finding. Ready only when the verdict is not Blocked and no error or warning finding remains. Info-level operator checks are listed, never counted as done.',
  verdict: 'Blocked, Surface-proven, or Knit-proven. Surface-proven means the emitted K-code passed every software check; it is not a physical claim. Knit-proven requires an exact physical registry match.',
  fairisle: 'Stranded backing: unused colors float behind the work. Float length is limited by strategy.floatLimit (warnings above it).',
  birdseye: 'Double-bed backing: unused colors are knitted on the rear bed in a speckled pattern, so there are no long floats. A scarf or blanket chart takes two to four colors (the Customist-matched frame brings in only the carriers the chart uses); a beanie birdseye body takes two to four, ties each into the back every N needles, and knits 3 extra ground rows to start and join the back layer.',
  placement: 'A motif placed as intent (studio place): its anchor (centred or a column, and rows above the cuff), color mapping and source image are stored, and it is drawn over the chart whenever the project is materialized, so it follows resizes. A placement that does not fit is a conflict that blocks export; it is never clipped.',
  'carried-yarn': 'An info check: a pattern yarn is carried from the waste section to its first stitch. Leave the strand slack while knitting and trim it after finishing.',
  'stitch-aspect': 'Knitted stitches are wider than they are tall. Charts made from images use the gauge to pick the row count; one pixel per stitch squashes a motif vertically.',
};

const PLAN_RULES: Record<string, string> = {
  'size-off-target': 'The chart does not have the stitch or row count the target size needs at the recorded gauge. Apply the finding\'s fix edits (set-width or set-height) or change the target.',
  'size-needs-gauge': 'A target size is set but no gauge is recorded. Knit and measure a swatch, then record it with set-gauge.',
  'gauge-assumed': 'Sizing uses a typical gauge. The machine file can be knitted, but the finished size is not confirmed until you measure a swatch and record its gauge.',
  'size-exceeds-capacity': 'The target needs more needles, rows, or cells than the V1 bed and capacity allow. Reduce the target or the gauge.',
  'name-encodes-carrier': 'A yarn name mentions a carrier number that is not the carrier it is loaded on. Carrier numbers belong in the carrier field only.',
  'cuff-off-target': 'The beanie cuff does not have the rows its recorded height needs at the recorded 2x2 rib gauge (twice the height when it folds up). The fix sets the cuff rows and keeps the body rows.',
  'placement-size-off': 'A motif placed from an image no longer spans the height it was asked for at the current gauge. Re-convert it from the stored image with studio place --refresh <id>.',
  'project-placement-conflict': 'A placed motif does not fit the piece at its anchor (too wide, or too tall above the cuff). Nothing is drawn and export is blocked; move it, make it smaller, or resize the piece.',
  'project-waste-too-short': 'The project sets fewer than 70 waste rows. Kniterate\'s default is 80 and it warns that fewer may not reach the rollers before the piece starts; without pull-down the knitting fails. Studio makes no program below 70. Seventy rows does not guarantee the rollers grip: check that the fabric reaches them.',
  'project-setting-outside-machine-range': 'A section\'s own stitch size, speed or roller is outside Studio\'s machine-safety limits (knitting: stitch 2 to 15, a rib 3 to 15, speed 10 to 800, roller 0 to 999; transfers: speed up to 400, roller up to 450). They come from Kniterate\'s documentation and its own files, not from measuring a machine, and a value inside them still needs a swatch with your yarn. No program is made until it is back in range.',
  'project-beanie-backing-unsupported': 'The beanie body is built only with the backings it implements (fairisle, and birdseye with every color in the back on every row). Any other strategy is refused instead of being silently knitted with a different backing.',
};

export function explain(term: string): { term: string; kind: 'term' | 'plan-rule' | 'validator-rule' | 'unknown'; title: string; explanation: string } {
  const key = term.trim().toLowerCase();
  if (GLOSSARY[key]) return { term, kind: 'term', title: key, explanation: GLOSSARY[key]! };
  if (PLAN_RULES[key]) return { term, kind: 'plan-rule', title: key, explanation: PLAN_RULES[key]! };
  const resolved = resolveValidatorMessage({ rule: term.trim(), severity: 'warning', message: '' });
  if (resolved.catalogHit) return { term, kind: 'validator-rule', title: resolved.title, explanation: resolved.explanation };
  return { term, kind: 'unknown', title: term, explanation: `No entry for "${term}". Terms: ${Object.keys(GLOSSARY).join(', ')}. Plan rules: ${Object.keys(PLAN_RULES).join(', ')}.` };
}
