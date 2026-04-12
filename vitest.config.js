import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['test/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.js'],
      reporter: ['text', 'lcov'],
    },
  },
})
