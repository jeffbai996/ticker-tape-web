import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  // Most suites only read source text, but the ones that mount a component
  // need the same Preact JSX transform the app build uses — without the preset
  // the default transform emits react/jsx-runtime imports that do not exist here.
  plugins: [preact()],
  test: {
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
