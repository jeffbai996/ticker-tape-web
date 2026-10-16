import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import { assertFocusedVitest } from './scripts/testScope.mjs'

assertFocusedVitest(process.argv.slice(2))

export default defineConfig({
  // Most suites only read source text, but the ones that mount a component
  // need the same Preact JSX transform the app build uses — without the preset
  // the default transform emits react/jsx-runtime imports that do not exist here.
  plugins: [preact()],
  test: {
    // Bound focused invocations as well as the full/fast helper.
    maxWorkers: 2,
    include: ['test/**/*.test.js'],
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.js'],
      reporter: ['text', 'lcov'],
    },
  },
})
