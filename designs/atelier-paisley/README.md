# Atelier paisley triangle — first product design study

Status: **design only; no machine program and no physical approval**. Prepared 2026-11-14.

The operator asked to start a realistic final product with much better paisley artwork, aiming toward Kujten, then specified a triangle like the [Tafi Organic Beige](https://www.kujten.com/en-us/products/bandana-tafi-beige-organic-2). This replaces the provisional elongated-diamond direction. It runs alongside the small colour-preserving-increase diagnostic in issue #18; the operator now reports that the 234-pass diagnostic looked worse than the previous increase and that the grey stitch appeared not to knit properly. That experimental recipe is on hold and must not be used for the full scarf. See the [trial feedback](../../docs/development-trials/2026-11-14/colour-preserving-increase/operator-feedback.md).

The selected product page lists 141 cm width, 62.5 cm length, 100% cashmere, two-ply loose-tension jersey, reversible and two-toned printed. These are reference specifications, not claims about our construction. It is not evidence that Kujten uses our reversible jacquard structure. Printed fine detail and loose jersey handfeel cannot be promised by a double-bed chart preview.

## Fig / Camel design history

The [November 23 cashmere handoff](../fig-camel/README.md) records the nine-row design, the 4,384-pass machine export and the full-size run. The following notes describe earlier revisions.

Open Studio with `?design=fig-camel` for the starter based on the two supplied Wild Rag photographs. The alternate angle shows the four-motif border, crosses and both orientations of the small paisley. The border uses redrawn nested outlines, three-leaf sprigs, small scrolls, and scalloped edging, including on the ties. The four-leaf repeat is scaled against the seed pitch on the straight portion of the photographed border. Each separator square occupies two courses and two adjacent needles on all three sides. On the camel face, the small drops have a rounded left side and a tapered right side. The field seeds have a stitch-by-stitch inner curl. Its bowl sits in the rounded head and its stem turns toward the tail, with the entire shape flipped on alternate rows. The border crosses mirror exactly across both axes. **Paisley close-up** shows the stitch grid across a full repeat and the first rows of seeds. The first photo supplies the Fig / Camel palette and the ornament at the central point. The flat placement at the folds was reconstructed from the exposed repeats.

The revised field has 11 staggered rows with alternating direction and tapers to one paisley above the centre point. The border motif bands share one inset measured perpendicular to each edge. The one-stitch running trim follows the straight and shaped boundaries. Small paisley groups and crosses continue into the ties. Each tie ends on three columns.

The original target was 161.9 × 58.4 cm, based on the [Wild Rag product dimensions](https://guestinresidence.com/products/the-wild-rag-fig-camel). The full size-6 section of the 3/28 cashmere swatch measured 48 stitches across 11 cm and 30 rows over 5 cm. Studio now defaults to 43.64 stitches and 60 rows per 10 cm for Fig / Camel. That earlier chart is 255 columns × 971 rows with three-column tie tips. The proportional 141 cm draft used 222 columns × 847 rows. The current 141 cm draft uses 214 columns × 846 courses for a predicted depth of 49.0 cm. Every width is held for two courses through the center. The top divider repeats every four courses. Both slopes repeat every four courses and two needles. The paired central scrolls, diamond and crescent follow the dark scarf close-up. Open **Pixel editor** to paint the chart on either face, zoom into the field, border, or center point, undo strokes and save a revised project. Previously saved full-size charts reopen at their original size. The original reference depth exceeds the 252-needle bed before allowing room for transfers and carriers. The earlier acrylic draft was 223 × 729. Use **Save project** to save the chart with its active-needle mask and gauge. **File → Open project** restores the same stitches for inspection in **Scarf**, **Tie and edge**, and **Knit layout**. Confirm the cashmere dimensions after finishing and test faster shaping before compiling the scarf.

In Studio, **Knit layout** shows the order of the proposed scarf construction, the same body chart with both structural edge allowances highlighted, and the exact start and finish passes decoded from the successful 378-pass tip reference. Passes 1–174 and 350–378 are grouped by function. The outer sections in that reference use the tested two-column ends. The three-column full scarf still needs its own compile. **Print layout** includes all six reference sections.

Before the full scarf, test a three-column start and finish at the known cadence with the same 2/14 acrylic and stitch setting 7. Then validate a short joined-edge test that changes from 3 to 15 back to 3 columns over 20 row transitions each way. The current cashmere chart changes width every two courses. Its full-width three-column-tip program still needs a loop and carrier audit before machine testing. Record any stopped pass or dropped loop and inspect both faces after waste removal. Wash a reversible final-yarn gauge swatch, update the chart, and knit a short section near the calculated maximum width to check clearance and take-down before running the whole scarf.

## Full-size Studio draft, 2026-11-22

Open Kniterate Studio with `?design=atelier-paisley` or use the triangle link on the start screen. The workspace renders the actual binary stitch grid, including the shaped outline, and lets you flip the face, inspect the central paisleys, enter a new gauge and save the design and shape together.

The joined paisley measured 21 columns across 5.5 cm and 81 body rows over 18 cm, excluding waste. At that acrylic gauge (38.18 stitches and 45 rows per 10 cm), the 141 × 62.5 cm target drafts to 239 columns by 635 rows, with three-column ends. There are 236 increases over 317 row transitions in the widening half, or one increase per 1.34 rows on average. The Kniterate bed has 13 columns left over before allowing for the needle placement, transfers and carrier clearance.

The operator accepted the joined paisley and skipped the open-edge comparison. The two-column tip swatch knitted. The operator preferred three columns at each end for a less sharp, less delicate-looking point. The planned full scarf follows the joined-edge approach with an allowance for the selvedge. The acrylic measurements size this draft. The final yarn requires a fresh relaxed gauge measurement, and the faster slope and available working width still need validation before machine export.

The files listed below preserve the earlier design study and its provisional grid.

## Design

Original, editable floral paisleys with nested contours, internal rosettes and leaf details. Two large paired motifs anchor the centre, two smaller echoes lead toward the corners, and a continuous leaf-vine border frames all three sides. Background ornaments have deliberate spacing. No Kujten logo, tracing or copied image is included.

Midnight/butter is the current design palette. Final fibre, count, colours and stitch settings remain open. Orange/grey 2/14 acrylic is the construction-test pair, not a claim of cashmere-equivalent drape.

- `index.html`: interactive local preview; switch artwork/stitch draft, flip faces, zoom.
- `design-board.png` / `.svg`: full composition and both binary-chart faces.
- `composition-master.svg`, `paisley-master.svg`: editable vector artwork.
- `chart.json`: Studio ColorworkChartV1 planning chart, **232 columns × 480 design courses**.
- `shape.json`: companion active-needle mask, one fixed boundary and one shaped boundary, eight-column provisional tips.
- `front.svg`, `reverse.svg`: binary chart with the mask applied. Opposite face swaps colours and mirrors course direction in the displayed triangle.

Importing `chart.json` alone does NOT import the shaped outline: cells outside the mask are ordinary colour zero in the chart contract. Keep the companion mask and do not export this as a rectangular program. This is a design asset, not an integrated shaped Studio project.

## Construction concept and outstanding sizing work

Knit from one long-edge tip to the other. In the machine's coordinate system the left boundary stays fixed, and the right boundary grows to the triangle depth then contracts. Display orientation rotates courses into the long horizontal edge. This uses the one-sided shaping concept already explored; it does not establish physical success for this size or cadence.

141 × 62.5 cm is a reference target. The 232 × 480 grid is only a resolution study, not a measured-gauge pattern. The earlier acrylic body measured 68 columns across 18.5 cm (about 36.8 columns/10 cm), but the reported height included upper waste, so it is not a reliable course gauge. Final yarn requires a washed, relaxed reversible swatch measured within the body in both directions.

At this provisional grid the active width is 8 → 232 → 8 over 480 courses. This requires increases/decreases nearly every design course (224 changes over 239 transitions per half), faster than a once-every-two-course test. **Do not silently reuse the earlier cadence or claim this draft is executable.** Recalculate the grid from washed gauge, then explicitly validate the required cadence/direction/carrier parking or revise orientation/size. Bed capacity, needle offset, transfer scratch space, take-down, tip finish and long-edge finish also need checking.

The decorative vine is chart artwork, not a structural join. Construction must retain a proven linked edge on both sides and respect the operator's request for each face's own colour at increases. The new colour-preserving increase is a separate diagnostic; its physical result cannot be inferred from this preview. Trim engineering remains tracked in #19.

## Next product step

1. Review this full triangle composition; refine the smallest paisleys and thin contour details that lose clarity on the binary grid.
2. Select the final yarn and wash a reversible gauge/drape sample, including the accepted edge construction.
3. Recalculate motif scale, triangle dimensions and cadence. Then knit an actual-scale motif-and-border section, rather than shrinking the entire artwork into another tiny swatch.
4. Integrate the approved chart and shaped mask into a Studio project, validate every shaping/edge/startup operation and carrier path, and only then export a full garment candidate.

## Rebuild

Python 3, Node, ImageMagick, and `@resvg/resvg-js` are required. The SVG renderer is isolated from Studio dependencies:

```sh
npm install --prefix /tmp/atelier-render --no-audit --no-fund @resvg/resvg-js
NODE_PATH=/tmp/atelier-render/node_modules python3 designs/atelier-paisley/build.py
```

The script asserts rasterized artwork coverage, writes a binary palette and zeroes inactive cells. Chart-contract parsing, mask dimensions and mirrored-face checks were run separately. These checks validate design files, not knitting safety or fabric appearance.
