import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
  },
})
