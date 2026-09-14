import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

/**
 * CSP del renderer, applicata solo alla build di produzione.
 * In dev viene omessa di proposito: `script-src 'self'` bloccherebbe il
 * preamble inline di React Fast Refresh e l'HMR smetterebbe di funzionare.
 *
 * `connect-src` consente solo il backend Express locale (127.0.0.1), che è
 * l'unica rete a cui la UI parla — vedi AGENTS.md §3.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:*",
  "object-src 'none'",
  "frame-src 'none'"
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'daprodfinanza:csp',
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html
      return html.replace(
        '<head>',
        `<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // Acceso solo da `npm run dist:demo`: nella build normale vale false e il
    // codice che ne dipende sparisce dal pacchetto.
    define: {
      __DEMO_BUILD__: JSON.stringify(process.env['DAPROD_DEMO_BUILD'] === '1')
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    }
  }
})
