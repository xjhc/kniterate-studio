import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { knittedCounts } from './knit-log.js';
import { traceOf } from './machine-files.js';
import { buildShapedScarf, readScarfDesign, scarfHandoffSheet, scarfPreviewPng, ScarfDesignError, verifyShapedScarf } from './shaped-scarf.js';

const KIND = 'kniterate-studio-scarf';

/** `studio scarf`: design file in, checked machine file, preview and handoff sheet out. */
export async function scarfCommand(designPath: string, out: string) {
  let built: ReturnType<typeof buildShapedScarf>;
  try {
    // The knitout is named after the design file, and the machine file carries that name in its header.
    const name = basename(designPath).replace(/(\.kniterate-studio)?\.json$/, '');
    built = buildShapedScarf(readScarfDesign(JSON.parse(await readFile(designPath, 'utf8'))), `${name}.k`);
  } catch (error) {
    if (!(error instanceof ScarfDesignError)) throw error;
    return { ok: false, result: { kind: KIND, fits: false, problemCount: error.problems.length, problems: error.problems.slice(0, 12) } };
  }
  const report = verifyShapedScarf(built), { design } = built;
  const knitLog = knittedCounts(traceOf(built.compiled.kcode));
  await mkdir(out, { recursive: true });
  const files = {
    'command.kc': built.compiled.kcode,
    [built.sourceName]: built.source,
    'preview.png': scarfPreviewPng(built),
    'verification.json': `${JSON.stringify({ ...report, knitLog, settings: design.settings, yarns: design.yarns }, null, 2)}\n`,
    'instructions.md': scarfHandoffSheet(built, report, knitLog),
  };
  for (const [name, content] of Object.entries(files)) await writeFile(join(out, name), content);
  return {
    ok: true,
    result: {
      kind: KIND, fits: true, title: design.title, directory: out, files: Object.keys(files),
      ...report, settings: design.settings, yarns: design.yarns,
      // Passes of this file against every logged knit; `studio knitted <directory>/command.kc` lists them.
      knitLog,
      evidence: 'Software checks only. Not knitted.',
    },
  };
}
