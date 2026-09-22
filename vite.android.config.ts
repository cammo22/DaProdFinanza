import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Build della versione Android (demo): una pagina web autosufficiente che
 * Capacitor impacchetta in un APK (vedi capacitor.config.json e
 * .github/workflows/android-demo.yml).
 *
 * Dentro c'è tutto il programma: l'interfaccia di src/renderer e il backend di
 * src/main — rotte, servizi, migrazioni, seed della demo, motore di calcolo —
 * senza riscriverne una riga. Cambiano solo i pezzi che sul telefono non
 * esistono (Electron, file, SQLite nativo cifrato), sostituiti qui sotto con
 * gli equivalenti di src/web.
 *
 *   npm run android:web      → out/web (si prova anche in un browser qualsiasi)
 */

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }
// Barre in avanti: Vite identifica i moduli dal percorso, e su Windows
// "C:\…\db.ts" e "C:/…/db.ts" sarebbero due moduli (e due database).
const posix = (p: string): string => p.replace(/\\/g, '/')
const web = (p: string): string => posix(resolve('src/web', p))

/** Moduli di src/main sostituiti per intero: percorso (senza estensione) → sostituto. */
const SOSTITUTI: Record<string, string> = {
  [posix(resolve('src/main/db/index'))]: web('db.ts'),
  [posix(resolve('src/main/lib/tokens'))]: web('lib/tokens.ts'),
  [posix(resolve('src/main/lib/paths'))]: web('lib/stubs.ts'),
  [posix(resolve('src/main/lib/secrets'))]: web('lib/stubs.ts'),
  [posix(resolve('src/main/lib/auto-backup'))]: web('lib/stubs.ts'),
  [posix(resolve('src/main/build-flags'))]: web('lib/stubs.ts')
}

/** Moduli di Node, Electron e dipendenze native → equivalenti per il browser. */
const MODULI: Record<string, string> = {
  express: web('shims/express.ts'),
  electron: web('shims/electron.ts'),
  cors: web('shims/small.ts'),
  '@electron-toolkit/utils': web('shims/small.ts'),
  jsonwebtoken: web('shims/unavailable.ts'),
  exceljs: web('shims/unavailable.ts'),
  'better-sqlite3-multiple-ciphers': web('shims/unavailable.ts'),
  'node:crypto': web('shims/node-crypto.ts'),
  'node:path': web('shims/node-path.ts'),
  'node:fs': web('shims/unavailable.ts'),
  'node:fs/promises': web('shims/unavailable.ts'),
  'node:os': web('shims/unavailable.ts')
}

function sostituzioni(): Plugin {
  return {
    name: 'daprodfinanza:android-sostituzioni',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (MODULI[source]) return MODULI[source]
      if (!importer || !source.startsWith('.')) return null
      const base = posix(resolve(importer, '..', source)).replace(/\.(ts|tsx|js)$/, '')
      const pulito = base.replace(/[\\/]index$/, '')
      return SOSTITUTI[base] ?? SOSTITUTI[`${pulito}/index`] ?? SOSTITUTI[pulito] ?? null
    },
    // password.ts usa il Buffer globale di Node (`Buffer.from(hex, 'hex')`): gli
    // si dà il suo, senza crearne uno globale che confonderebbe le librerie.
    transform(code, id) {
      if (!posix(id).endsWith('/src/main/lib/password.ts')) return null
      return `import { Buffer } from '${web('shims/node-crypto.ts')}'
${code}`
    }
  }
}

export default defineConfig({
  root: resolve('src/web'),
  base: './',
  publicDir: false,
  plugins: [sostituzioni(), react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Il backend legge process.env solo per il seed di sviluppo, che qui è
    // già deciso: la versione Android è sempre la demo.
    'process.env': '{}'
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
      '@main': resolve('src/main')
    }
  },
  build: {
    outDir: resolve('out/web'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000
  }
})
