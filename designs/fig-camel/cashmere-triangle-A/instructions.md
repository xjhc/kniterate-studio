# Three-column cashmere triangle with an A

Run `command.kc` from an empty bed with the feeders home on the left. The machine file has 432 passes. SHA-256 is `035a3b5dd00ae3869ddaaa14fb1fd2233b6d7a3108a2357b7e7c10e0a25f96cd`.

| Feeder | Yarn |
|---|---|
| C1 | Usual smooth draw thread |
| C3 | One end of 3/28 cashmere, Camel or lighter contrast, for the A and cast-on |
| C4 | One end of 3/28 cashmere, Fig or darker ground, for all joined increases |
| C6 | Usual waste yarn |

## What the file knits

| Machine passes | Section |
|---|---|
| 1–114 | Eight-column waste setup and introduction of the two main yarns |
| 115–161 | Sacrificial starter tapers to three columns |
| 162–168 | Draw-thread separation and main-yarn cast-on at three columns |
| 169–174 | First three body courses at three columns |
| 175–301 | Ten supported increases on the machine-right edge, one every two courses. The last reaches 13 columns |
| 302–403 | Ten inward decreases on that edge, one every two courses, ending with three courses at three columns |
| 404–432 | Eight C6 waste rounds, release and feeder exit |

There is one straight edge. A column carries one stitch on each bed. The joined swatch supplies the two-course C4 front-bed split and opposite-bed inward decrease. The gauge swatch supplies body stitch size 6, speed 150, and roller 400. The first body course runs at speed 100 and roller 100. Transfers use speed 100, transfer stitch setting 5 and zero roller. The two outer edge stitches alternate colors to join the faces.

The single A is four needles wide and five courses tall. The feet knit on body course 14, the crossbar on 16 and the two top stitches on 18, entirely on the widening half. With the straight edge horizontal and the cast-on at the left, the apex of the letter points right. The narrowing half has a plain interior. The motif appears in inverse colours on the reverse face. The 44 body courses and 13-column maximum give an estimated 7.3 cm along the straight edge and 3.0 cm deep at the measured cashmere gauge.

## What to look for

Watch passes 162–187 for a clean three-column neck and first joined increase. Compare both slopes around passes 290–311, where the last increase completes and the first decrease knits through its transferred loops. Record the pass and side if a loop misses or the yarn breaks. After knitting, secure the six live cashmere loops at the finishing tip before removing its waste. Pull the separating draw thread at the starter, retaining tails for finishing. With the sample relaxed, inspect both tips, the joins on both faces, any holes on the widening slope, and the A's crossbar.

Strict KCode parsing, machine trace validation, schedule comparison and loop replay passed. The replay checked body stitch size, carrier and color on each bed, both descendants of all 20 splits, both merged loops at each decrease, the joined edges, and zero unsupported body knits or float-distance advisories. This is the first physical trial of this shaping cadence in this cashmere.

To rebuild or verify from the repository root, run `node --import tsx designs/fig-camel/cashmere-triangle-A/build.mjs` and `node --import tsx designs/fig-camel/cashmere-triangle-A/verify.mjs`. The verification script checks the exact exported file and reports per-course pass ranges.
