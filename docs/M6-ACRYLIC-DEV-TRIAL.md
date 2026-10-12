# M6 acrylic development trial: bird toque

**Status:** prepared, waiting for an operator run. This is a **development
run** in the sense of [`V1-PHYSICAL-TRIAL.md`](./V1-PHYSICAL-TRIAL.md): it
finds physical defects in the M6 beanie construction early. It does not
qualify `1.0.0`, and no verdict changes because of it.

Everything the operator needs is in one batch below: two programs, how to
load them, what to watch, what to measure, and how the result is judged.

## What is being tested

| Piece | File | Purpose |
|---|---|---|
| A. Control | `control-kniterate-2x2-rib-beanie.kc` (Kniterate's own file, `packages/machine-lib/reference/2x2-rib-beanie.kc`) | Calibrates the machine, yarn and loading. Studio reproduces it trace-for-trace. If A fails, the cause is setup, not the M6 engine. |
| B. Candidate | `package/program.kc` | The M6 construction end to end: 2×2 rib cuff (fold-up), rib → front transfer, birdseye colourwork body with the bird, back-layer join, eight-line jersey crown, knit-off. |

Knit A first. Knit B only if A runs clean.

## Regenerating the exact package

From a checkout of commit `f2a5439` (or any later commit that re-emits the
same bytes):

```bash
T=output/m6-acrylic-trial; mkdir -p $T; P=$T/bird-toque.json
pnpm --silent studio -- new --object beanie --head-cm 56 --body-cm 13 --gauge 26,34 \
  --cuff-cm 7 --fold --rib-gauge 30,32 --backing birdseye \
  --color "Black acrylic=#111111" --accent "White acrylic=#F2F2F2" \
  --title "M6 acrylic dev trial: bird toque" -o $P
pnpm --silent studio -- place $P --image ~/pro/knitlab2/reference/arc.png --height-cm 8 --id bird --above-cuff 3
pnpm --silent studio -- fit $P --gauge 26,34 --rib-gauge 30,32 --gauge-source assumed
pnpm --silent studio -- package $P -o $T/package
cp packages/machine-lib/reference/2x2-rib-beanie.kc $T/control-kniterate-2x2-rib-beanie.kc
```

The package holds:

- `program.kc`, the file to knit;
- `program.k`;
- the editable project;
- `instructions.md`, which carries readiness, operator checks and finishing;
- `schematic.svg` and `chart.png`;
- `measurement-form.md` and `measurements.json`;
- `manifest.json`, with every file's hash.

The same package can be exported from the browser (**Package**).

Expected hashes (SHA-256):

- `package/program.kc`: `79670c31402cb4ff7f7113a4c9e3e1935dab33169ba3fe597ccbbbf8ee62817d`
  (950 passes, 134 needles, KCode columns 59–192; bird 31 × 27 stitches,
  cropped to its artwork so its visible height is 8 cm)
- `control-kniterate-2x2-rib-beanie.kc`: `de0002e2ac7f36ea95f87940ac83c39439c97eea8ab9ed98427c5bf29f5c2b4a`

Knit the file whose hash matches. Do not edit either file. If the hash
differs, stop and regenerate. The bird image is Arc'teryx's mark; it is read
from its own location and not committed here.

An earlier candidate (`c26b1b90…`, prepared at `1cf6a6f`, never knitted) is
superseded. Its bird was converted with the image's margin, so the visible
bird was shorter than 8 cm.

**Readiness of B is NOT READY, deliberately:** both gauges are assumed
placeholders (`gauge-assumed` on the body and the rib). No acrylic swatch has
been measured. Construction is what B tests. Its dimensions are recorded to
calibrate the next candidate, and are not judged.

## Loading and settings

| Carrier | A (control) | B (candidate) |
|---|---|---|
| C1 | draw thread (smooth, contrasting) | draw thread |
| C3 | main yarn | **black acrylic** (cuff, body ground, crown) |
| C4 | not used | **white acrylic** (the bird) |
| C6 | waste yarn | waste yarn |

- Yarn: worsted-weight acrylic on the 7gg profile; use the same lot for
  both colours if possible. Record brand, weight, fibre and lot.
- Stitch, speed and roller values are encoded in the files. Do not override
  them on the machine. For reference, B uses:
  - waste: stitch 5;
  - rib: stitch 8 front / 7 rear, speed 300, roller 500;
  - birdseye body: stitch 7, speed 400, roller 450 (from Kniterate's `dbj.kc`);
  - join row: stitch 9, speed 200;
  - crown: stitch 6, speed 300, roller 450;
  - top: stitch 5, speed 100 then 250, roller 300;
  - transfers: speed 120–150.
- Yarn tension and carrier setup: the machine's standard worsted
  procedure. Record any deviation.
- B is double-bed in the body (birdseye at half rack). Watch the first
  body rows after the cuff closely.

## What to watch during the run (B)

Write down the pass or row number shown on the machine for each of these:

1. **Cuff → body transfer** (end of the rib): any stitch that misses the
   front needle.
2. **Birdseye start** (the first half-rack rows): the back layer forming on
   empty rear needles; any dropped or tuck-looking stitches.
3. **The bird rows**: carrier C4 entering and leaving, any snagged or
   loose white strands.
4. **Back-layer join** (every rear loop moved to the front, then one black
   row): any stitch left on the rear bed or dropped.
5. **Crown transfers**: racked moves up to 4 needles; any dropped stitch or a
   stack that will not knit.
6. **Knit-off**: thread the tail through the live top stitches immediately.

Record every stop: when it happened, the message, what you did, and whether
the run continued.

## Measurements to collect

After the finishing steps in `package/instructions.md` (draw thread out,
seam, fold, wash or steam as the label says, dry flat, rest 24 h), lay the
piece flat without tension and use a rigid rule.

| # | Measure | How |
|---|---|---|
| M1 | Body gauge, birdseye | Stitches and rows over 10 cm in a plain black area of the body, before seaming if you can, on the face side |
| M2 | Rib gauge, 2×2 | Stitches and rows over 10 cm in the cuff, unstretched |
| M3 | Flat width at mid-body | ×2 after seaming = circumference |
| M4 | Knitted cuff height (unfolded) and folded visible height | |
| M5 | Body height, cuff top → first crown decrease | |
| M6 | Crown height, first decrease → top | |
| M7 | Bird | Width and height in cm; distance from the cuff top to the bird's lowest stitch; its offset from the centre of the front (centre-back is the seam) |
| M8 | Weight of the finished hat | grams |

Also photograph:

- the front;
- the inside (birdseye back);
- the crown from above;
- the cuff folded and unfolded;
- any defect, with a ruler in the frame.

Compare A against its known Kniterate result: the same seam, crown and
finishing.

## Acceptance (declared before the run)

A **passes** if it knits to the end with no dropped stitches. If it fails,
fix the setup and do not run B.

B **passes the construction trial** if all of these hold:

1. It knits to the end with no dropped or laddered stitches and no stop
   that needed more than re-threading or clearing a yarn.
2. The cuff is 2×2 rib throughout and folds cleanly. The rib → body
   transition has no holes.
3. The bird is legible, upright, and centred within ±1 stitch of the front
   centre (Plan: 31 stitches wide and 27 rows tall, starting 3 body rows above the cuff, which
   is 5 knitted rows counting the 2 birdseye start rows).
4. The back is a closed birdseye layer: no free float longer than about
   1 cm, and no open pocket at the top of the body (the join holds).
5. The crown closes with eight even decrease lines, with no hole larger than
   a normal stitch, and the top gathers closed.
6. The seam can be sewn one stitch in from each edge along the full height.

Dimensions are **recorded, not judged**, because the gauges are
placeholders. They become the measured gauges for the next candidate.
The proposed ±3% / ±1 cm tolerance applies from that candidate on.

## After the run

1. **Return the measurements.** Fill `package/measurements.json`. It is a
   form, not part of the hashed candidate, so filling it never invalidates
   the package. It also carries what this candidate predicted, so results are
   compared with the file that was knitted, not a later draft. Fill in:
   - outcome, gauges, finished cm and notes;
   - `"synthetic": false` for a real knit.

   Send it back with the photographs and the stop log. Record it with
   `pnpm studio -- measure $P package/measurements.json`, or with **Record
   measurements** in the browser. This records the trial against this
   candidate's hash and makes the gauges measured. It then re-sizes the
   project and re-converts the bird at the measured gauge, as one undoable
   operation. The knitted candidate's files stay untouched; `package` then
   makes the next candidate.
   If conversion reveals a new image color without a yarn choice, the trial
   and gauges are still recorded. The old motif stays unchanged and marked
   for refresh. Use **Refresh** to choose its yarn or background in the preview,
   or `studio place <project.json> --refresh <id> --map "2=<yarn id>"`
   (`--leave 2` deliberately leaves that color as background).
2. **Register the run as development evidence.** From a clean checkout that
   re-emits the same bytes, run
   `pnpm release:register -- <short-name> --package output/m6-acrylic-trial/package`.
   This recompiles the project and refuses unless `program.kc` and
   `program.k` are re-emitted byte for byte. It scaffolds `machine.json`,
   `yarn.json`, `run.json` and `outcome.md` for the operator's facts. It
   registers only the exact file knitted, and qualifies nothing for `1.0.0`.
3. **If something failed,** each construction defect gets its own engine
   fix, a new hash-bound candidate and a re-run. A failed candidate is never
   rehabilitated by editing its file.
