/**
 * Machine files are named the same way for every kind of project: for the
 * piece, as the status panel lists it (`back.kc`, `scarf.kc`, `beanie.kc`).
 * A download puts the project first, so files from different projects never
 * collide in a downloads folder or on the machine's card.
 */

/** What a one-file project's piece is called, on its stage and its file. */
export function onePieceName(beanie: boolean): string {
  return beanie ? 'Beanie' : 'Colour chart';
}

export function machineFileName(piece: string): string {
  return `${piece.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.kc`;
}

export function downloadFileName(projectId: string, piece: string): string {
  return `${projectId}-${machineFileName(piece)}`;
}
