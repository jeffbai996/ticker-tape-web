import { build, loadEnv } from 'vite'
import { iosBuildOptions } from './iosBuildOptions.mjs'

// Vite's normal mode files remain available, but credentials are never tracked.
const env = { ...loadEnv('ios', process.cwd(), ''), ...process.env }
try {
  await build({ ...iosBuildOptions(env), mode: 'ios' })
} catch (error) {
  console.error(`iOS build failed: ${error.message}`)
  process.exitCode = 1
}
