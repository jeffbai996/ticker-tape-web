import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  // component tests import .jsx directly; without the preact transform the
  // build reaches for React's JSX runtime and fails to resolve
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.js'],
      reporter: ['text', 'lcov'],
    },
  },
})
