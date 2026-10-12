import { defineConfig } from 'vite'
import web from './vite.config.js'
import { downlevelCss, findUnsupported } from './tv/build/cssCompat.js'

// The Samsung TV build of the web app. Same source, same plugins, same CSS;
// only the output changes. A Tizen widget loads its page from the installed
// package, where module scripts and lazy chunks are unreliable, so the
// bundle is one classic script with relative URLs. Tizen 6.5 (2021 sets)
// renders with Chromium 85: the target downlevels syntax, tv/lib/polyfills.js
// covers missing runtime APIs, and Lightning CSS lowers the stylesheet.
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

/** Lower the finished stylesheet and refuse a build that still holds
 *  something the TV would silently drop. */
function chromium85Css() {
  return {
    name: 'ttw-tv-chromium85-css',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.css')) continue
        const lowered = downlevelCss(String(asset.source))
        const left = findUnsupported(lowered)
        if (left.length) {
          this.error(`${asset.fileName} still uses ${left.join(', ')}, which Chromium 85 ignores`)
        }
        asset.source = lowered
      }
    },
  }
}

export default defineConfig({
  ...web,
  // The service-worker stamp has no worker to stamp in this build.
  plugins: [...web.plugins.filter((p) => p?.name !== 'ttw-sw-build-id'), classicScripts(), chromium85Css()],
  base: './',
  define: { 'import.meta.env.VITE_TV': JSON.stringify('1') },
  build: {
    outDir: 'dist-tv',
    emptyOutDir: true,
    target: 'chrome85',
    cssTarget: 'chrome85',
    cssMinify: 'lightningcss',
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: { input: 'tv.html', output: { format: 'iife' } },
  },
})
