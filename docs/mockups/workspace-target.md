# Workspace target contract

Status: accepted implementation contract, 2026-10-11. It replaces the
2026-07-13 three-column "Chart / Strategy / Machine" contract, which the user
retired. `workspace-target.html` is that retired mockup, kept for history
only.

## Point of view

Every project, whether a scarf or blanket, a beanie or a sweater, is
designed in one workspace. It looks the same and its controls are always in
the same place. Each project is turned into machine files the Kniterate
runs, and the workspace shows exactly what those files knit.

## Layout

- **Top bar:** the project name, one menu bar (File, Edit, View) and the
  verdict badge. There are no icon ribbons; every project action is in a
  menu.
  - File: new, open, save, download the knitting package, download the
    machine file(s), print the knitting sheet, check a machine file.
  - Edit: undo, redo, name and colours.
  - View: Design, Schematic, Machine file, History, Dark mode.
- **Left panel:** what you are making, as collapsible sections.
  - Sweater: style, size, measurements, stitch, edges, yarn and gauge.
  - Beanie: fit, cuff, body, gauge, motifs, swatch measurements, colours
    and backing.
  - Colorwork scarf or blanket: size, colours and backing.
- **Middle:** the pieces, when there are several, on the left of the stage
  bar. On its right, always in the same place, the three views:
  - **Design:** what you edit. That is the chart, or a piece's stitches and
    shape, or the garment as worn.
  - **Schematic:** the measured flat drawing. For a charted project it is
    drawn from the machine file read back. It shows the whole run, from the
    waste yarn and draw thread through the piece to its finish.
  - **Machine file:** exactly what each `.kc` knits, read back from the
    emitted file. It shows the fabric, the sections in machine order, and
    every pass in words and as written. "Step through" holds the exact
    machine movement, the checks and the source.
  - A sweater's Whole sweater view lists every file in the order the machine
    runs them.
- **Right panel:** the same order for every project.
  1. Can it be knitted.
  2. What to fix, with buttons that show or fix it.
  3. The machine files: open, or download each one. The open piece's
     shaping steps are shown under its file.
  4. Download knitting package and Print knitting sheet.
  5. What to do at the machine.
- **The knitting sheet** is for after exporting, at the machine. It traps
  focus and returns it to the menu.

## Words

Plain words, little text. There is no developer jargon ("machine truth",
"compiler intent", "trials"), no "≈" and no "~". Technical detail lives only
in the Machine file view.

## Responsive behavior

- Below 1100 px the status panel moves under the workspace.
- Below 720 px everything stacks, with the stage first.
- The page never scrolls sideways.

## Invariants kept

- The verdict ladder is Blocked, Surface-proven and Knit-proven, and Blocked
  disables export.
- Views render from the compiled artifacts. The schematic and the machine
  file come from the emitted file's strict trace and the compiler's row
  links, not from UI-side machine math.
- Physical needle labels stay unverified; needles use Studio's numbering.
- No waiver or Experimental verdict, no per-stitch machine overrides, and no
  manual pass editing.
