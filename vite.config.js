import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  base: '/ticker-tape-web/',
  build: {
    outDir: 'dist',
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
