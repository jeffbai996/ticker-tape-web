import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import web from './vite.config.js'

// The Samsung TV build. A Tizen widget loads index.html from its installed
// package, where module scripts and crossorigin requests are unreliable, so
// the bundle is one classic script with relative URLs. Chromium 85 is the
// engine on Tizen 6.5 (2021 sets); the target downlevels syntax to it, and
// tv/lib/polyfills.js covers the runtime APIs a target cannot.
function classicScripts() {
  return {
    name: 'ttw-tv-classic-scripts',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"')
    },
  }
}

export default defineConfig({
  root: 'tv',
  base: './',
  plugins: [preact(), classicScripts()],
  build: {
    outDir: '../dist-tv',
    emptyOutDir: true,
    target: 'chrome85',
    cssTarget: 'chrome85',
    modulePreload: false,
    // One stylesheet linked from the document, instead of CSS injected by the
    // script after it runs.
    cssCodeSplit: false,
    rollupOptions: { output: { format: 'iife' } },
  },
  // `npm run dev:tv` reaches Yahoo through the web app's dev pass-through.
  server: web.server,
})
