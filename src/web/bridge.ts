import { pickUpdate, releaseNotesText, UPDATE_REPO, type Release, type UpdateState } from '@shared/updates'
import type { DaProdApi } from '../preload'
import { avviaBackend, richiesta } from './backend'

/**
 * Il ponte della versione Android: fa per l'interfaccia quello che nel
 * programma per computer fanno il preload e il processo main.
 *
 * - `window.daprod`: le stesse funzioni del preload. Quelle che sul telefono
 *   non hanno senso (file Excel, backup, report PDF) lo dicono con un avviso.
 * - `fetch`: le chiamate all'indirizzo del backend non escono dal telefono,
 *   arrivano al backend in pagina (./backend.ts). Tutto il resto passa.
 */

const BASE = 'http://daprodfinanza.locale'
const pronto = avviaBackend()

const fetchDiRete = window.fetch.bind(window)

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.startsWith(BASE)) return fetchDiRete(input, init)

  await pronto
  const headers: Record<string, string> = {}
  new Headers(init?.headers).forEach((v, k) => (headers[k] = v))
  let body: unknown = undefined
  if (typeof init?.body === 'string' && init.body) {
    try {
      body = JSON.parse(init.body)
    } catch {
      body = init.body
    }
  }
  const r = await richiesta(init?.method ?? 'GET', url.slice(BASE.length), headers, body)
  return new Response(r.status === 204 ? null : JSON.stringify(r.body), {
    status: r.status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function avviso(testo: string): void {
  window.alert(testo)
}

const SOLO_COMPUTER =
  'Sul telefono questa funzione non c’è: file Excel, backup e report PDF restano nel programma per computer.'

// --- aggiornamenti: si controlla GitHub, si scarica dalla pagina della release ---

let stato: UpdateState = {
  kind: 'android',
  status: 'idle',
  current: __APP_VERSION__,
  latest: null,
  notes: null,
  publishedAt: null,
  progress: null,
  error: null,
  checkedAt: null
}
let paginaRelease: string | null = null
const ascoltatori = new Set<(s: UpdateState) => void>()

function aggiorna(parziale: Partial<UpdateState>): UpdateState {
  stato = { ...stato, ...parziale }
  ascoltatori.forEach((f) => f(stato))
  return stato
}

async function controlla(): Promise<UpdateState> {
  aggiorna({ status: 'checking', error: null })
  try {
    const r = await fetchDiRete(
      `https://api.github.com/repos/${UPDATE_REPO.owner}/${UPDATE_REPO.repo}/releases/latest`,
      { headers: { Accept: 'application/vnd.github+json' } }
    )
    if (!r.ok) throw new Error(`GitHub ha risposto ${r.status}.`)
    const release = (await r.json()) as Release
    const offerta = pickUpdate(release, 'android', __APP_VERSION__)
    paginaRelease = release.html_url ?? null
    return aggiorna({
      status: offerta ? 'available' : 'none',
      latest: offerta?.version ?? release.tag_name.replace(/^v/, ''),
      notes: release.body ? releaseNotesText(release.body) : null,
      publishedAt: release.published_at ?? null,
      checkedAt: new Date().toISOString()
    })
  } catch (err) {
    return aggiorna({
      status: 'error',
      error: `Controllo non riuscito: ${err instanceof Error ? err.message : String(err)}`
    })
  }
}

// --- zoom: con il CSS, come fa Electron con la pagina -----------------------------

let zoom = 1

const api: DaProdApi = {
  getAppInfo: async () => {
    await pronto
    return { apiBaseUrl: BASE, version: __APP_VERSION__, platform: 'android', demoBuild: true }
  },
  backupDatabase: async () => {
    throw new Error('Il backup non c’è nella versione Android: i dati sono solo di esempio.')
  },
  openDataFolder: async () => avviso(SOLO_COMPUTER),
  pickExcelFile: async () => {
    avviso(SOLO_COMPUTER)
    return null
  },
  saveExcelFile: async () => {
    avviso(SOLO_COMPUTER)
    return null
  },
  openExcelFile: async () => undefined,
  zoom: {
    get: () => zoom,
    set: (factor: number) => {
      zoom = factor
      document.documentElement.style.setProperty('zoom', String(factor))
    }
  },
  exportReport: async () => {
    avviso(SOLO_COMPUTER)
    return null
  },
  report: {
    params: async () => null,
    ready: () => undefined
  },
  updates: {
    state: async () => stato,
    check: controlla,
    download: async () => {
      // Si apre la pagina della release nel browser: l'APK nuovo si installa
      // sopra quello vecchio, i dati di esempio restano.
      if (paginaRelease) window.location.href = paginaRelease
      return stato
    },
    install: async () => undefined,
    onChange: (f) => {
      ascoltatori.add(f)
      return () => ascoltatori.delete(f)
    }
  }
}

;(window as unknown as { daprod: DaProdApi }).daprod = api

// Un primo controllo poco dopo l'avvio, come fa il programma per computer.
setTimeout(() => void controlla(), 5000)
