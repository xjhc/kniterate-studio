/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: [
    'src/knitout/kcode/parser.ts',
    'src/knitout/kcode/machine-trace.ts',
    'src/knitout/kcode/machine-validator.ts',
    'src/knitout/kcode/scheduled-trace-diff.ts',
  ],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.stryker.config.ts',
    related: true,
  },
  coverageAnalysis: 'perTest',
  // The proof receipt reads this effective value and blocks any global mutator
  // exclusion. Reviewed site-local directives are the only suppression seam.
  mutator: { excludedMutations: [] },
  concurrency: 1,
  maxTestRunnerReuse: 100,
  timeoutMS: 20_000,
  timeoutFactor: 2,
  // Re-evaluate module-initialized constants on every proof run. Stryker's
  // incremental relation can otherwise reuse stale outcomes after a test-only
  // change, which would make the receipt weaker than the current test suite.
  incremental: false,
  reporters: ['clear-text', 'json'],
  jsonReporter: {
    fileName: 'out/kcode-proof/stryker-report.json',
  },
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
  cleanTempDir: true,
  disableTypeChecks: true,
}

export default config
