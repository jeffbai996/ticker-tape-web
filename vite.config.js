import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

// Stamp the service worker with a build id so each deploy gets its own cache
// and activates over the last one. public/sw.js ships the placeholder; the
// built copy carries the id. No plugin dependency for one string replace.
function swBuildId() {
  let outDir = 'dist'
  return {
    name: 'ttw-sw-build-id',
    configResolved(cfg) { outDir = cfg.build.outDir },
    closeBundle() {
      const file = resolve(outDir, 'sw.js')
      if (!existsSync(file)) return
      const id = `${Date.now().toString(36)}`
      writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD__', id))
    },
  }
}

// The public document and bundle never contain the licensed UI face. Private
// builds opt in at build time; their deploy scripts copy the local asset beside
// index.html after Vite has finished. A document-relative URL works for both
// the tailnet root and the family host subpath.
export function privateFontHtml(enabled) {
  if (!enabled) return ''
  return `<style data-ttw-private-font>
@font-face {
  font-family: "Anthropic Sans";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("./fonts/AnthropicSansVariable-TextRegular.woff2") format("woff2");
}
:root { --font-sans: "Anthropic Sans", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
</style>`
}

function privateFont() {
  const enabled = process.env.VITE_PRIVATE === '1' || process.env.VITE_FAMILY_BUILD === '1'
  const html = privateFontHtml(enabled)
  return {
    name: 'ttw-private-font',
    transformIndexHtml(document) {
      return html ? document.replace('</head>', `${html}\n</head>`) : document
    },
  }
}

export default defineConfig({
  plugins: [preact(), tailwindcss(), privateFont(), swBuildId()],
  // Where the bundle will be served from. The public GitHub Pages deploy keeps
  // the repo-name base; the family build is hosted elsewhere at its own path,
  // so both are env-driven rather than forked configs (Jeff 2026-08-25).
  base: process.env.TTW_BASE || '/ticker-tape-web/',
  build: {
    outDir: process.env.TTW_OUT_DIR || 'dist',
  },
  server: {
    // Built-in Yahoo pass-through so `npm run dev` has live data with zero
    // setup: no worker, no secrets, no cron. Production uses a proxy URL
    // (see src/lib/feed.js proxyBase).
    proxy: {
      '/yf': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yf/, ''),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        },
      },
    },
  },
})
