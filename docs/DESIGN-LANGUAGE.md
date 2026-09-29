# DESIGN-LANGUAGE — typed design intent for knitters and agents

**Status: proposed contract, 2026-09-28. Not implemented.** It extends
`ColorworkProjectV1` (`packages/project-contract`) and does not replace it.
Implementation starts in roadmap M5: one rectangle must be proven through the
real pipeline before the garment parts of this schema are settled.
[`STATUS.md`](./STATUS.md) still has the final say on what has shipped.

Related:

- [`CUSTOMIST-PARITY.md`](./CUSTOMIST-PARITY.md) maps every Customist capability
  (CP-*) to a construct defined here.
- [`FOUNDING.md`](./FOUNDING.md) §1 holds the widened V1 ruling.
- [`V1-PHYSICAL-TRIAL.md`](./V1-PHYSICAL-TRIAL.md) holds the physical gate.

---

## 1. Purpose

A person, or Claude acting for them, should be able to say *"a beanie for a 56
cm head with this motif"* and get an editable project, validated `.kc` files,
previews, and complete knitting and finishing instructions. Changing the size
or the motif must regenerate everything reproducibly.

To make that reliable for an agent, the design has to be written in a small,
closed, typed vocabulary that matches how knitters talk. Every machine-level
number must be derived from it and traceable back to it. The agent writes
intent. Deterministic code does the arithmetic and the machine work. The
verdict and readiness are computed, never asserted.

## 2. Three levels, one of them authored

| Level | Written by | Contents | Status |
|---|---|---|---|
| **Design** | People and agents, only through typed edits | Object, pieces, zones, fabrics, motifs, placements, joins, yarns, gauges, recipe; lengths in cm or stitches | New (this document) |
| **Plan** | Derived, read-only | Per piece: stitch and row counts, zone row ranges, transitions, shaping schedule, crown, placement cells, carrier map, predicted dimensions, seam checks, finishing steps. Every number has provenance. | New |
| **Program** | Derived, read-only | Knitout, KCode, `RunArtifact`, verdict | Existing (`compileToRunArtifact`, `resolveAuthoredVerdict`) |

Invariants:

1. **There is exactly one authored representation.** The Plan and the Program
   are pure functions of the Design, the bundled assets, and the versioned
   templates, recipes and converters. Nothing below the Design is hand-edited.
   Existing anchored overrides remain the only lower-level escape hatch, and
   they are revalidated on every compile.
2. **Sizing arithmetic happens once, in the Plan.** The compiler consumes the
   Plan. The UI and the agent never recompute stitch counts. (UI-side
   *machine* math remains forbidden, as before.)
3. **There are no parallel intermediate representations.** knitlab2 ended up
   with FabricIR, ShapeContract, DiscretePlan and CandidateSpec describing the
   same garment, and none of them is revived here. `machine-lib` emitters may
   be reused behind the Plan → compile seam.
4. **The verdict ladder is unchanged:** Blocked, Surface-proven, Knit-proven.
   Readiness (§7) is a separate computed result, not a rung.

## 3. What is kept from `ColorworkProjectV1`

- The authority model:
  - `base` intent plus an ordered `history.entries` log;
  - `history.cursor` for undo and redo, where a new edit after undo truncates
    the redo branch;
  - checkpoints are caches, and replaying the log is authoritative;
  - a single `materialize` function;
  - views never mutate state.
- Edits keep the `{ id, source: 'human' | 'assistant' | 'system', edit }` shape.
- Stable row IDs, and anchored overrides with **quarantine instead of
  discard**.
- `ColorworkChartV1` stays the neutral chart format; in v2 it becomes one
  motif source.
- The fixed machine profile `kniterate-7gg-worsted-v1`: 252 needles; C1 draw,
  C2–C5 pattern, C6 waste. CP-B1 raises an open ruling on this (§13).

## 4. Design vocabulary (v2)

The type sketches below state the contract. The exact TypeScript and zod
schemas are written in M5 and published by `pnpm studio -- schema`.

### 4.1 Project envelope

```ts
interface KniterateProjectV2 {
  kind: 'kniterate-studio-project';
  version: 2;
  id: string;
  title: string;
  profile: 'kniterate-7gg-worsted-v1';
  assets: Record<AssetId, BundledAsset>;   // bytes travel inside the project
  base: DesignIntent;
  history: { cursor: number; entries: DesignEditEntry[]; checkpoints: DesignCheckpoint[] };
  migratedFrom?: { version: 1; sourceSha256: string };
}

interface BundledAsset {
  mediaType: 'image/png' | 'image/svg+xml' | 'image/vnd.dxf' | 'text/plain';
  sha256: string;          // identity; a motif refers to the asset, never to a path
  bytesBase64: string;
  originalName?: string;   // informational only
}
```

A project must be portable. `source: bird.png` is not allowed; the bytes and
their hash live in the project. Assets count against the project capacity
limits, which M5 raises.

### 4.2 Stored intent vs. materialized design

The stored `DesignIntent` holds only authored facts:

- the object parameters;
- the template, recipe and converter versions;
- yarns, gauges, motifs and assets;
- **overlays** keyed by stable design paths: zone fabric choices, placements,
  pinned values and overrides.

`materializeDesign` expands the object through its versioned template and
applies the overlays. The result is a fully explicit design in which every
value carries provenance (§4.8). `pnpm studio -- show` prints this form, and
agents read it.

If a template change removes the path an overlay is keyed to (for example,
switching sleeve style removes a piece), the overlay is **quarantined with a
reason**, exactly like today's overrides. It is never discarded.

Design paths are stable, human-readable strings:
`pieces/hat/zones/body`, `placements/bird-front`, `yarns/main`,
`joins/back-seam`. Templates assign piece and zone IDs (`hat`, `cuff`,
`body`, `crown`; `front`, `back`, `sleeve-left`, `sleeve-right`, `collar`).
Authors assign yarn, motif and placement IDs, and those IDs are immutable once
created.

### 4.3 Object and templates

```ts
type Length = { cm: number } | { stitches: number } | { rows: number };
type Ratio = number;   // -0.10 means 10% negative ease

type ObjectSpec =
  | { kind: 'rectangle'; width: Length; height: Length }
  | { kind: 'beanie';
      construction: 'flat-seamed';            // 'tube' is refused until its own milestone
      head: { cm: number };
      ease: Ratio;                            // finished circumference = head × (1 + ease)
      finishedHeight: { cm: number };         // fold line to crown top, cuff folded
      cuff: { knitted: Length; fold: 'up' | 'none' } | null;
      crown: CrownRecipe }
  | { kind: 'sweater';                        // Customist 2.5 template parity (CP-A3..A7)
      size: 'S' | 'M' | 'L' | 'XL' | { custom: BodyMeasurements };
      neckline: 'crew' | 'v';
      shoulders: 'straight' | 'classic' | 'raglan';
      sleeves: 'standard' | 'raglan' | 'drop-shoulder';
      ribs: { body: RibSpec | null; cuff: RibSpec | null; collar: RibSpec | null };
      ease: Partial<Record<Measurement, Ratio>>;
      options: { panelAsymmetry: boolean; evenRows: boolean } };
```

Each template (`rectangle@1`, `beanie-flat-seamed@1`, `sweater-customist-2.5@1`)
is a pure, versioned function from object parameters and gauges to pieces,
zones, edges and joins. Changing an object parameter re-runs the template.
Pinned values survive, and any conflict between a pin and the template output
becomes a design-owned finding, never a silent winner. This is the
counterpart of Customist's locked garment settings (CP-A7).

### 4.4 Pieces, zones and fabrics

```ts
interface Piece {
  id: PieceId;
  construction: 'flat';                       // one piece = one continuous .kc program
  zones: Zone[];                              // bottom-up, in knitting order
  edges: { left: EdgeShaping[]; right: EdgeShaping[] };
  start: StartSpec;                           // waste & cast-on (CP-E1/E2), from the recipe
  top: TopFinish;
}

interface Zone { id: ZoneId; height: Length; fabric: Fabric }

type Fabric =
  | { kind: 'jersey'; face: 'front' | 'rear' }
  | { kind: 'rib'; knit: number; purl: number }            // 1×1, 2×2, …
  | { kind: 'colorwork'; backing: FlatBacking;
      floatLimit?: number;                                 // preset 7, matching Customist
      yarnOrder?: YarnId[] | 'auto';                       // CP-B6
      borders?: BorderSpec }                               // CP-B7
  | { kind: 'stitch-chart'; motif: MotifId };              // stitch symbols (CP-C1)

type FlatBacking =
  | { kind: 'fairisle' }
  | { kind: 'birdseye'; algorithm: 'minimal' | 'full'; fullNeedle: boolean }
  | { kind: 'reversible-tubular' };                        // Customist "Invert Colors", 2 colours
```

A piece never spans files. Studio has no loaded-bed or resumed-job contract,
so one continuous piece must fit in one program. Program length is capacity
work (M5) plus controller evidence (`V1-PHYSICAL-TRIAL.md`), never a reason to
split a piece.

**Backing names depend on the construction.** The names above apply to flat
double-bed pieces. A future seamless tube uses both beds for its two faces and
has a different, separately named set (`stranded`, `tuck-stipple`). The word
`birdseye` is never used for tube fabric. Today's `tube-fabric.ts` calls its
tuck stipple "birdseye", and that name does not carry over into the design
language.

Zone boundaries generate their own transitions, such as rib → jersey
transfers (CP-C5). These appear in the Plan and never need hand-painted
transfer rows.

### 4.5 Motifs, assets and placements

```ts
interface Motif {
  id: MotifId;
  source:
    | { kind: 'chart'; chart: ColorworkChartV1 }            // existing contract, unchanged
    | { kind: 'image'; asset: AssetId; conversion: ImageConversion };
}

interface ImageConversion {
  size: { height: Length } | { width: Length };  // the other side comes from image aspect × gauge aspect
  colors: number;                                // ≤ 6 per row (CP-B1); ≤ 4 until the carrier ruling
  method: string;                                // named, e.g. 'nearest-palette'
  aspect: 'gauge-corrected' | 'one-pixel-one-stitch';
  converter: { id: string; version: string };
}

interface Placement {
  id: PlacementId;                 // immutable; the target for anchors, findings and fixes
  motif: MotifId;
  zone: DesignPath;                // e.g. 'pieces/hat/zones/body'
  anchor: {
    x: 'center' | 'start' | 'end' | { offset: Length; from: 'start' | 'center' | 'end' };
    y: 'center' | 'bottom' | 'top' | { offset: Length; from: 'bottom' | 'top' };
  };
  repeat?: { x?: number | 'fill'; y?: number | 'fill'; gapX?: Length; gapY?: Length };  // CP-C3
  transform?: { flipX?: boolean; flipY?: boolean; mirrorBed?: boolean };               // CP-C4
  colors: Record<string, YarnId>;  // motif colour → yarn
}
```

The chart produced from an image is part of the Plan. It is reproducible from
the asset bytes, the conversion settings, the converter version and the gauge.
One motif can be placed many times. Each use is its own placement with its own
ID, so a correction to the front bird can never touch the back bird.

### 4.6 Shaping and finishes

```ts
interface EdgeShaping {
  from: RowRef; to: RowRef;
  change: number;                                  // stitches; negative = decrease
  cadence: { stitchesPerEvent: 1 | 2; rowsPerEvent: number } | { byRepeatPeriod: number };
  style: 'fashioned' | 'simple' | 'reversible';    // CP-D1..D3
  margin?: number;                                  // fashion-mark distance from the edge
}

type TopFinish =
  | { kind: 'bind-off'; options: BindOffOptions }  // CP-D5
  | { kind: 'crown'; recipe: CrownRecipe }
  | { kind: 'neckline'; spec: NecklineSpec }       // CP-D4
  | { kind: 'waste-off'; rows: number };           // CP-E3

interface CrownRecipe {                             // flat, seamed crown
  id: string; version: string;                     // e.g. 'flat-stepped-decrease@1'
  decreasePerStep: number;                         // stitches removed per decrease event
  rowsPerStep: number;                             // knit rows per step, including the row after the transfers
  finalStitches: number;
  distribution: 'edges' | { points: number };
  style: 'fashioned' | 'simple';
  closure: 'gather' | 'bind-off';                  // gather = waste-off, then hand cinch
}
```

`decrease(points: 6)` alone does not determine a crown. The recipe fixes the
cadence, the final count and the closure, and the Plan reports the resulting
crown height. At the §10.2 gauge, `rowsPerStep` 2 gives a 4.7 cm crown and 3
gives 7.1 cm.

### 4.7 Joins, yarns, gauges and recipe

```ts
type Join =
  | { kind: 'seam'; id: JoinId; a: EdgeRef; b: EdgeRef;
      method: 'mattress' | 'backstitch'; allowance: { stitchesPerEdge: number } }
  | { kind: 'fold'; id: JoinId; zone: DesignPath; direction: 'up' }
  | { kind: 'pickup'; id: JoinId; piece: PieceId; onto: EdgeRef[] }   // e.g. collar to neckline
  | { kind: 'gather'; id: JoinId; edge: EdgeRef };                     // crown closure

interface Yarn {
  id: YarnId;
  name: string;                        // never encodes a carrier number
  color: string;                       // #RRGGBB
  material?: { fiber: string; weight: string; lot?: string };
  carrier: Valued<CarrierId>;          // 'pinned' when the author chose it, else 'calculated'
}

interface GaugeRecord {
  fabric: string;                      // 'jersey' | 'rib(2,2)' | 'colorwork:fairisle' | …
  stitchesPer10cm: number;
  rowsPer10cm: number;
  provenance: Provenance;              // 'measured' | 'preset' | 'assumed'
}
```

Joins do two jobs:

- **Compatibility checks in the Plan:** seam edges must have matching row
  counts, and a pickup edge's length must suit the collar's stitch count.
- **Finishing instructions.**

A `fold` also changes the instructions: the part of a seam that folds outward
is sewn from the other side.

`recipe: { id, version }` selects a versioned machine recipe
(`knitout/recipes/types.ts`: start, body and section settings). Speed, roller
and stitch values come from the recipe (`preset`) or from anchored setting
overrides (`pinned`). They are never inferred from dimensions or yarn colour.

### 4.8 Value provenance

Every value in the materialized design and in the Plan is a
`Valued<T> = { value: T; provenance: Provenance }`:

```ts
type Provenance =
  | { kind: 'calculated'; rule: string; formula: string; inputs: DesignPath[] }
  | { kind: 'measured'; swatch: string; method: string }
  | { kind: 'preset'; recipe: string; version: string }
  | { kind: 'assumed'; reason: string }        // a default used for lack of data
  | { kind: 'pinned'; by: 'human' | 'assistant'; editId: string };
```

An `assumed` value that affects a requested dimension is a readiness blocker
(§7). This is how "missing gauge" stays visible instead of turning into a
wrong-sized hat.

### 4.9 Edits

`DesignEdit` is a discriminated union. Its kinds, grouped by what they change:

| Group | Edit kinds |
|---|---|
| Object, template, recipe | `set-object`, `set-template-version`, `set-recipe` |
| Zones | `set-zone` (fabric or height overlay) |
| Assets and motifs | `add-asset`, `add-motif`, `set-motif-conversion` |
| Placements | `add-placement`, `update-placement`, `remove-placement` |
| Yarns and gauges | `set-yarn`, `set-gauge` |
| Joins | `add-join`, `remove-join` |
| Pins | `pin`, `unpin` (any design path) |
| Overrides | `add-override`, `remove-override` (v2 anchors) |
| Chart editing | `chart-edit`: `{ motif, edit: ProjectEdit }`, reusing today's chart edits |
| Migrated history | `v1`: `{ edit: ProjectEdit }`, replayed only by the v1 → v2 adapter (§9) |

Every edit is validated against the schema before it is appended. An invalid
edit is rejected with a typed error naming the field and the accepted values.

## 5. The Plan (derived)

```ts
interface PiecePlan {
  piece: PieceId;
  stitches: Valued<number>;
  needles: Valued<{ first: number; last: number; count: number }>;
  rows: Valued<number>;
  zones: Array<{ id: ZoneId; rows: { start: number; end: number }; fabric: Fabric;
                 gauge: GaugeRecord; transitionsBefore: string[] }>;
  shaping: Array<{ edge: 'left' | 'right'; rows: { start: number; end: number };
                   change: number; cadence: string }>;
  crown?: { steps: number; rowsPerStep: number; finalStitches: number;
            height: Valued<number>; closure: 'gather' | 'bind-off' };
  placements: Array<{ id: PlacementId; columns: [number, number]; rows: [number, number];
                      chart: ColorworkChartV1; transform: object; carriers: Record<string, CarrierId> }>;
  carriers: Array<{ carrier: CarrierId; yarn: YarnId | null; role: 'pattern' | 'draw' | 'waste' | 'frame' }>;
  predicted: Record<string, Valued<number>>;      // widthCm, heightCm, circumferenceCm, …
  seams: Array<{ join: JoinId; aRows: number; bRows: number; match: boolean }>;
  settings: Array<{ zone: ZoneId; speed: Valued<number>; roller: Valued<number>; stitch: Valued<number> }>;
  finishing: FinishingStep[];                      // ordered, human-readable, generated from joins and finishes
}
```

Predicted dimensions are only as good as the gauge. They are labelled
*predicted under gauge X*, and they are never presented as measured results.

## 6. Findings

```ts
interface Finding {
  id: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  owner: 'design' | 'compiler' | 'operator';
  path: DesignPath | null;                         // where in the design
  program: { piece: PieceId; passIndices: number[]; kcodeLines?: number[] } | null;
  title: string;
  explanation: string;                             // from the validator message catalog
  fixes: Fix[];                                    // may be empty
}

interface Fix {
  label: string;
  edits: DesignEdit[];
  appliesTo: { construction: 'flat' | 'tube'; fabric?: string };
  units: 'stitches' | 'rows' | 'cm' | 'none';
  verified: { clears: string; newBlocking: 0; compileHash: string };
}
```

Rules:

1. **Every diagnostic is kept and has an owner.** No finding is moved to a
   log, downgraded or hidden to make a design ready.
   - `design`: the author can change the design.
   - `compiler`: needs an engine repair.
   - `operator`: a procedural check at the machine.

   A finding does not need an automatic fix.
2. **Noise is fixed at its source.** Today a clean compile of the trial chart
   warns that bind-off settings were "supplied but not consumed by this compile
   path". The compile path must stop supplying unused configuration; the
   warning must not be filtered out.
3. **A fix is offered only after verification.** A speculative compile must
   show that applying it clears the original finding and adds no blocking
   finding. Fixes depend on the construction and fabric and state their units.
   A flat `birdseye` fix is never offered for a tube.
4. **Every finding is addressed to the design.** Machine locations (pass,
   KCode line) are attached, but the primary address is the design path.

## 7. Readiness (computed)

```ts
interface Readiness {
  ready: boolean;                                  // true exactly when blockers is empty
  blockers: Array<
    | { kind: 'verdict-blocked'; piece: PieceId }
    | { kind: 'finding'; findingId: string; severity: 'error' | 'warning'; owner: Finding['owner'] }
    | { kind: 'assumed-value'; path: DesignPath; reason: string }
    | { kind: 'missing-input'; path: DesignPath }  // gauge, yarn, carrier, asset
    | { kind: 'seam-mismatch'; join: JoinId }
    | { kind: 'unsupported'; path: DesignPath; nearestSupported?: string }>;
  operatorChecks: OperatorCheck[];                 // done at the machine; never marked complete by software
}
```

- `resolveReadiness(project, plans, artifacts)` is a pure engine function
  alongside `resolveAuthoredVerdict`, with unit tests for every blocker kind.
- **The verdict policy does not change.** Over-limit floats stay non-gating
  verdict warnings. A Surface-proven design can still be *not ready*, because
  every warning is a readiness blocker whoever owns it.
- Info-level, operator-owned items become `operatorChecks`. Examples: settings
  that live on the controller, such as carrier spacing and stopping distance,
  which the vendor converter currently reports as unknown headers.
- **An agent may call a design "ready" only when this function returns
  `ready: true`.** The CLI prints it, the export bundle records it, and the
  benchmark checks it (§11).

## 8. Agent interface

Every command prints JSON except `render`. Exit codes stay as they are:
0 = ok, 1 = blocked, 2 = usage error.

```text
pnpm --silent studio -- new --object rectangle|beanie|sweater [--design <file>] -o <project.json>
                        show <project.json>                 # materialized design with provenance
                        plan <project.json> [--piece <id>]
                        describe <project.json>             # ≤ 40 lines: pieces, sizes, zones, placements,
                                                             # yarns→carriers, verdicts, readiness
                        render <project.json> --view front|back|pieces|schematic|pattern|stitch|
                                                     roller|speed|stitch-size|occupancy|direction
                                              [--piece <id>] -o <file.png>
                        edit <project.json> <DesignEdit | DesignEdit[]>
                        undo | redo <project.json>
                        compile <project.json> [--piece <id>]
                        readiness <project.json>
                        export <project.json> -o <dir>      # only when ready: project, one .kc per piece,
                                                             # previews, instructions.md, run sheet, manifest
                        schema [--design | --edit | --plan]
                        explain <term | rule | design-path>
```

Each `edit` returns:

```text
{ applied, designDiff, planDiff, readinessDiff, verdicts, stats }
```

The agent sees what changed at every level without re-reading the whole
project.

A repository skill (`.claude/skills/knit-design/SKILL.md`, written in M5)
gives Claude these working rules:

- author the Design only;
- never compute stitch or row counts itself — read the Plan;
- ask when a required input is missing, or offer the swatch program;
- report the verdict and readiness exactly as computed;
- never edit `.k` or `.kc` files;
- look at `render` output before claiming placement or orientation.

## 9. Lossless migration from v1

`ColorworkProjectV1` files remain readable permanently; only v2 is written.
The migration is:

- **Base.** v1 `base` becomes a v2 `rectangle` object:
  - one piece `panel`, with one zone `body` whose colorwork fabric comes from
    the v1 strategy;
  - one chart motif, the v1 chart with its **row IDs unchanged**;
  - one placement `chart` covering the zone;
  - v1 `frame` maps to the recipe start/finish;
  - `needleOffset` maps to bed placement.
- **Techniques Studio still blocks.** Ladder, lined and complement stay as
  they are and stay blocked (`project-technique-unmatched`), exactly as today.
- **Yarns.** Palette entries and assignments become yarns with `pinned`
  carriers. **Names are kept verbatim.** A name such as "Ground (C4)" on
  carrier 2 is not renamed; it raises a design-owned `name-encodes-carrier`
  warning.
- **Overrides.** Anchors are re-expressed against the placement and motif row
  IDs. Status is kept, and a quarantined override stays quarantined with its
  reason.
- **History.** Every v1 entry is kept with the same `id`, `source` and order,
  wrapped as `{ kind: 'v1', edit }`. The cursor and the redo branch are
  unchanged. Checkpoints are recomputed and validated by replay.
- **Refusal instead of loss.** Anything that cannot be migrated exactly is a
  typed migration error. Migration never drops data.

**Acceptance:** for every v1 fixture, including autosave and the trial
project, and **at every cursor position**:

1. the compile-input hash, Knitout bytes, KCode bytes and verdict are
   identical before and after migration;
2. override statuses and reasons are identical;
3. undo and redo from every position give identical results.

## 10. Worked examples

The gauges below are illustrative; real projects use measured swatches. All
the arithmetic shown is checked.

### 10.1 Rectangle scarf (M5)

Request: *"A 25 × 180 cm scarf in three colours, 5 cm stripes. My gauge is 26
stitches and 34 rows per 10 cm."*

```yaml
object: { kind: rectangle, width: { cm: 25 }, height: { cm: 180 } }
gauges: [{ fabric: jersey, stitchesPer10cm: 26, rowsPer10cm: 34, provenance: measured }]
```

The Plan gives 65 stitches (25 × 2.6) and **612 rows** (180 × 3.4), with 5 cm
stripes of 17 rows each (5 × 3.4), 36 stripes in total. 612 rows is over
today's 300-row authored cap, so raising capacity is M5 work, not an
afterthought.

### 10.2 Flat, seamed beanie with a motif (M6 target)

Request: *"A beanie for a 56 cm head with −10% ease, black with a white bird on
the front, 2×2 rib with a 7 cm fold-up cuff, about 21 cm tall. Here are my
swatch numbers and the artwork."*

```yaml
object:
  kind: beanie
  construction: flat-seamed           # seam at centre back
  head: { cm: 56 }
  ease: -0.10                         # finished circumference 50.4 cm
  finishedHeight: { cm: 21 }          # fold line to crown top
  cuff: { knitted: { cm: 14 }, fold: up }
  crown: { id: flat-stepped-decrease, version: "1", decreasePerStep: 12, rowsPerStep: 2,
           finalStitches: 36, distribution: { points: 6 }, style: simple, closure: gather }
yarns:
  - { id: main,   name: Black merino, color: "#111111" }
  - { id: accent, name: White merino, color: "#F2F2F2" }
gauges:
  - { fabric: "rib(2,2)",           stitchesPer10cm: 36, rowsPer10cm: 32, provenance: measured }
  - { fabric: "colorwork:fairisle", stitchesPer10cm: 26, rowsPer10cm: 34, provenance: measured }
overlays:
  pieces/hat/zones/body: { fabric: { kind: colorwork, backing: { kind: fairisle }, floatLimit: 7 } }
motifs:
  - { id: bird, source: { kind: image, asset: "sha256:…",
      conversion: { size: { height: { cm: 8 } }, colors: 2, method: nearest-palette,
                    aspect: gauge-corrected, converter: { id: png-motif, version: "1" } } } }
placements:
  - { id: bird-front, motif: bird, zone: pieces/hat/zones/body,
      anchor: { x: center, y: { offset: { cm: 1 }, from: bottom } },
      colors: { ink: accent, ground: main } }
```

Plan excerpt (`plan --piece hat`):

```text
stitches   132   calculated  56 × 0.90 = 50.4 cm × 2.6 st/cm = 131.04 → 132 (multiple of 4 for 2×2 rib)
needles    134   calculated  132 + 2 seam stitches (1 per edge, used up by the mattress seam)
predicted  circumference 50.8 cm (132 ÷ 2.6), under the colorwork gauge
cuff       rows 1–44    rib(2,2)  14 cm × 3.2 = 44.8 → 44 (even: carrier ends on the start side)
           relaxed rib width 36.7 cm (132 ÷ 3.6); rib draws in and stretches over the head
           rule fold-up-cuff: the fold shows the reverse face; 2×2 rib is reversible → ok
           transition to body: rib → jersey transfers (no design rows)
body       rows 45–76   colorwork(fairisle)   32 rows = 9.4 cm (21 − 6.9 visible cuff − 4.7 crown)
bird-front needles 53–82 of 134, rows 48–74 (both 1-based, bottom-up; centred: (134 − 30) ÷ 2 = 52 before it)
           27 rows = 8 cm × 3.4 = 27.2 → 27; 30 st = 8 cm × (300/206 image aspect) × 2.6 = 30.3 → 30
           one pixel per stitch would give 30 × 21 → 6.2 cm tall (22% short)
crown      rows 77–92   8 steps × 12 st (132 → 36), 2 rows per step = 16 rows = 4.7 cm
           (rowsPerStep 3 would give 24 rows = 7.1 cm)
           gauge for plain crown rows: colorwork gauge → assumed (no plain-jersey swatch recorded)
closure    gather: 36 live stitches onto waste, cinched by hand
seam       back-seam: left edge 92 rows = right edge 92 rows → match
```

The `assumed` crown gauge is a readiness blocker until a jersey swatch is
measured or the author pins it.

Finishing instructions excerpt (generated from `joins` and `top`):

1. Pull the draw thread to release the waste yarn at the cast-on edge.
2. Crown: thread main yarn through the 36 live stitches, remove the top waste,
   cinch closed and fasten.
3. Seam the centre back with mattress stitch, one stitch in from each edge.
   **Sew the lowest 7 cm (the part that folds up) from the other side**, so
   the seam is hidden when the cuff is folded.
4. Fold the cuff up 7 cm along the fold line.
5. Finish the fabric according to the yarn label, then measure under the
   conditions in `V1-PHYSICAL-TRIAL.md`.

An example finding in this project, illustrative of the format:

```text
warning float-too-long   owner: design   path: placements/bird-front
  rows 58–61: 9-stitch floats (limit 7)
  fixes: only those a speculative compile verified, e.g.
    set pieces/hat/zones/body.fabric.backing = birdseye{minimal, fullNeedle: false}
    (flat; units: none; clears float-too-long; 0 new blocking)
```

### 10.3 Sweater (M7 sketch)

```yaml
object:
  kind: sweater
  size: M
  neckline: crew
  shoulders: classic
  sleeves: drop-shoulder
  ribs: { body: { knit: 2, purl: 2, depth: { cm: 6 } },
          cuff: { knit: 2, purl: 2, depth: { cm: 6 } },
          collar: { knit: 1, purl: 1, depth: { cm: 3 } } }
  ease: { chest: 0.12 }
  options: { panelAsymmetry: true, evenRows: true }
```

The template produces pieces `front`, `back`, `sleeve-left`, `sleeve-right`
and `collar`, plus joins:

- side seams (front ↔ back);
- shoulder seams;
- sleeve seams;
- sleeve-to-body seams;
- collar pickup onto the neckline.

The Plan checks every seam's row or stitch compatibility and the collar length
against the neckline. Finishing instructions give the assembly order.

### 10.4 Supported, clarified and refused requests

| Request | Correct response |
|---|---|
| "Beanie for a 56 cm head" with no gauge | **Clarify:** ask for gauge, or offer the swatch program. A draft may use an `assumed` gauge, but readiness blocks and no size is claimed. |
| "A seamless beanie" | **Refuse for now**, name `flat-seamed` as the supported alternative. The tube construction has no proof yet. |
| "A 7-colour fair isle band" | **Refuse:** the machine knits at most 6 colours per row. Also say that V1 is capped at 4 pattern colours until the carrier-role ruling. |
| "Put the logo on the turned-up cuff" | **Explain and offer.** The fold shows the reverse face upside down, so the motif needs `flipY`, and a rib zone cannot carry fairisle. Propose a jersey colorwork cuff with a backing that hides floats, or placement above the cuff. |
| "Bird on the front and the back" | Two placements (`bird-front`, `bird-back`). A design-owned finding if `bird-back` crosses the centre-back seam, with verified offsets as fixes. |
| "Make it 2 cm longer" | `set-object finishedHeight`. The Plan diff shows the body gaining 7 rows (2 × 3.4 = 6.8 → 7). Placement IDs and anchors are unchanged. |

## 11. Agent-legibility benchmark

This measures whether the vocabulary works for an agent. A fresh Claude
session gets only the skill, `schema`, `explain`, and the CLI.

- **Suite** (proposed `evals/design-language/`, at least 25 requests):
  supported requests with expected Plan properties, clarification requests,
  refusal requests, edit-sequence requests, and fix-application requests.
  Every §10.4 row is a case.
- **Checks** use predicted geometry under the gauge supplied in the request,
  never physical measurements. Example: 56 cm with −10% ease means a 50.4 cm
  target. The check is |predicted − 50.4| ≤ half of one rounding step, which
  here is 4 stitches ÷ 2.6 st/cm = 1.54 cm, so ±0.77 cm. Physical sizing is
  judged separately by the physical gate.
- **Metrics:**
  - behaviour-class correctness: supported, clarify or refuse;
  - readiness reached on supported requests;
  - compile rounds;
  - schema-invalid edit attempts;
  - false readiness claims.
- **Proposed thresholds, subject to approval:**
  - false readiness claims **= 0** (a hard gate);
  - clarify and refuse classes 100% correct;
  - at least 90% of supported requests reach `ready: true` within tolerance;
  - compile rounds reported, with no threshold at first.
- The suite runs on every change to the schema, templates, skill or CLI
  output format.

## 12. Implementation order and guards

1. **M5 — v2 contract on rectangles.**
   - Build: the schema, `materializeDesign`, the Plan for rectangles,
     `describe`/`plan`/`readiness`/`render`, the lossless migration (§9), the
     capacity raise for long rectangles, the bind-off warning fixed at its
     source, and the benchmark harness with rectangle cases.
   - Gate: migrated fixtures are byte-identical; the rectangle benchmark
     passes; the existing verify gates pass.
2. **Only then settle the garment schema.** M6 is the flat seamed beanie end
   to end (the goal in `ROADMAP.md`). M7 is the sweater.
3. **Guards:**
   - `compileToRunArtifact` stays the compilation seam;
   - `resolveAuthoredVerdict` stays the only verdict owner;
   - `resolveReadiness` is new and pure, and is not a verdict rung;
   - no UI-side machine math;
   - knitlab2's measurement-first CAD, schedules and prose are not imported
     wholesale — templates are small, versioned and parity-driven.

## 13. Open decisions

- **Carrier roles** for six-colour rows (CP-B1). This conflicts with the fixed
  C1 draw / C6 waste profile.
- **Platform rows** CP-J1…J4 (accounts, sharing, cloud library, bug report)
  against the local-first invariant.
- **Product nouns.** Sweaters make "piece" visible to users. The four-noun
  budget (project, chart, machine view, verdict) needs a ruling. The proposal
  is that pieces live inside the project and the four nouns stay the top-level
  vocabulary.
- **Compiler fingerprint scope.** Today it covers all of `machine-lib/src`,
  `project-contract/src`, `compileProject.ts` and the release scripts, so any
  change makes physical entries stale. The earlier question of narrowing it
  is still open.
- **Physical tolerances and measurement conditions**
  (`V1-PHYSICAL-TRIAL.md`), approved before the first qualification run.
