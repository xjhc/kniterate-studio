/**
 * P3.2 (2026-05-23): MachineRecipe registry.
 *
 * Each recipe lives in its own module under `src/knitout/recipes/`
 * (per decision D5 in the rearchitecture plan); this index holds the
 * lookup. New recipes register here by appending to `REGISTERED_RECIPES`
 * — that's the whole code-diff cost of adding a recipe (DoD).
 */

import type { MachineRecipe, MachineRecipeRegistry } from './types.js'
import { CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE } from './customist-studio-fairisle-7gg.js'
import { SWATCH_7GG_RECIPE } from './swatch-7gg.js'

const REGISTERED_RECIPES: MachineRecipe[] = [
  CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE,
  SWATCH_7GG_RECIPE,
]

class InMemoryRegistry implements MachineRecipeRegistry {
  private readonly recipes = new Map<string, MachineRecipe>()
  constructor(seed: readonly MachineRecipe[]) {
    for (const recipe of seed) this.recipes.set(recipe.id, recipe)
  }
  list(): readonly MachineRecipe[] {
    return [...this.recipes.values()]
  }
  get(id: string): MachineRecipe | undefined {
    return this.recipes.get(id)
  }
  register(recipe: MachineRecipe): void {
    if (this.recipes.has(recipe.id)) {
      throw new Error(`MachineRecipe id collision: "${recipe.id}" already registered`)
    }
    this.recipes.set(recipe.id, recipe)
  }
}

/** The shared registry. Recipes registered at module load are
 *  immediately discoverable. */
export const machineRecipeRegistry: MachineRecipeRegistry =
  new InMemoryRegistry(REGISTERED_RECIPES)

export { CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE } from './customist-studio-fairisle-7gg.js'
export { SWATCH_7GG_RECIPE } from './swatch-7gg.js'
export * from './types.js'
export * from './profiles.js'
