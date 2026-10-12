/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // Many unit tests compile whole knitting programs: seconds each, and more on a shared CI runner.
  test: { testTimeout: 30_000 },
});
