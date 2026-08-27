import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: [
      'test/knitout/strict-kcode-document.test.ts',
      'test/knitout/kcode-byte-roundtrip.test.ts',
      'test/knitout/kcode-document-adversarial.test.ts',
      'test/knitout/kcode-document-property.test.ts',
      'test/knitout/kcode-machine-trace.test.ts',
      'test/knitout/kcode-machine-validator.test.ts',
      'test/knitout/kcode-independent-oracle.test.ts',
      'test/knitout/kcode-command-legality.test.ts',
      'test/knitout/kcode-scheduled-differential.test.ts',
      'test/knitout/kcode-scheduled-trace-diff.test.ts',
    ],
  },
})
