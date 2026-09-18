import { app, BrowserWindow, net, shell } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { access, constants } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  assetPattern,
  pickUpdate,
  UPDATE_REPO,
  type Release,
  type UpdateKind,
  type UpdateOffer,
  type UpdateState
} from '@shared/updates'
import { DEMO_BUILD } from './build-flags'
import { backupDatabase } from './db'
import { userDataDir } from './lib/paths'

/**
 * Tasto "Aggiornamenti": prende l'ultima release pubblicata su GitHub.
 *
 * Un solo meccanismo per le tre copie: si legge l'ultima release dall'API di
 * GitHub, si scarica l'eseguibile giusto per questa copia e se ne verifica
 * l'impronta SHA-256 che GitHub calcola al caricamento. Nessun servizio in più
 * e nessun file da pubblicare oltre ai tre eseguibili.
 *
 * - installer: si lancia il nuovo Setup in modalità silenziosa e aggiornamento
 *   (`--updated /S --force-run`, gli stessi argomenti di electron-updater).
 *   Rilegge dal registro la cartella d'installazione e riapre il programma.
 * - portable e demo: il nuovo file finisce accanto a quello vecchio, parte al
 *   suo posto e, al primo avvio, toglie la copia superata.
 *
 * Prima di installare si fa sempre un backup del database: la nuova versione
 * potrebbe aggiornarne lo schema.
 */

const RELEASE_URL = `https://api.github.com/repos/${UPDATE_REPO.owner}/${UPDATE_REPO.repo}/releases/latest`
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_CHECK_DELAY_MS = 8_000
/** File che dice alla versione nuova quale copia portable ha sostituito. */
const CLEANUP_FILE = 'aggiornamento-portable.json'

let state: UpdateState
let offer: UpdateOffer | null = null
let downloaded: string | null = null
/** Pagina dell'ultima release, per chi si aggiorna scaricando a mano (Mac). */
let paginaRelease: string | null = null
let busy = false

function detectKind(): UpdateKind {
  if (!app.isPackaged) return 'dev'
  // Su Mac c'è solo la demo, e senza firma Apple non può sostituirsi da sola.
  if (process.platform === 'darwin') return 'mac'
  // Lo imposta il lanciatore dei portable di electron-builder.
  if (process.env.PORTABLE_EXECUTABLE_FILE) return DEMO_BUILD ? 'demo' : 'portable'
  return DEMO_BUILD ? 'demo' : 'installer'
}

function update(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('update:changed', state)
  }
}

export function updateState(): UpdateState {
  return state
}

async function fetchLatestRelease(): Promise<Release> {
  const response = await net.fetch(RELEASE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `DaProdFinanza/${app.getVersion()}`
    }
  })
  if (response.status === 404) throw new Error('Nessuna versione pubblicata.')
  if (response.status === 403 || response.status === 429) {
    throw new Error('GitHub ha limitato le richieste: riprova fra un po’.')
  }
  if (!response.ok) throw new Error(`GitHub ha risposto ${response.status}.`)
  return (await response.json()) as Release
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (busy) return state
  busy = true
  update({ status: 'checking', error: null })
  try {
    const release = await fetchLatestRelease()
    offer = pickUpdate(release, state.kind, state.current)
    paginaRelease = release.html_url ?? null
    const tag = release.tag_name.replace(/^v/, '')
    update({
      status: offer ? 'available' : 'none',
      latest: tag,
      notes: release.body ?? null,
      publishedAt: release.published_at ?? null,
      checkedAt: new Date().toISOString(),
      progress: null
    })
    // Una versione già scaricata e poi superata non va più installata.
    if (downloaded && (!offer || !downloaded.includes(offer.version))) downloaded = null
    if (offer && downloaded) update({ status: 'ready', progress: 100 })
  } catch (error) {
    update({ status: 'error', error: messageOf(error, 'Controllo non riuscito.') })
  } finally {
    busy = false
  }
  return state
}

/** Dove salvare il nuovo eseguibile. */
async function downloadFolder(): Promise<string> {
  if (state.kind === 'portable' || state.kind === 'demo') {
    const current = process.env.PORTABLE_EXECUTABLE_FILE
    if (current) {
      const folder = dirname(current)
      try {
        await access(folder, constants.W_OK)
        return folder
      } catch {
        // Cartella in sola lettura (una chiavetta protetta, Programmi…).
      }
    }
    return app.getPath('downloads')
  }
  // L'installer serve solo il tempo di lanciarlo.
  return app.getPath('temp')
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (busy || !offer) return state
  if (state.kind === 'dev') {
    update({ status: 'error', error: 'In sviluppo non si aggiorna: serve una versione pubblicata.' })
    return state
  }
  if (state.kind === 'mac') {
    // Si apre la pagina della release: il DMG nuovo si scarica dal browser.
    const url = paginaRelease ?? `https://github.com/${UPDATE_REPO.owner}/${UPDATE_REPO.repo}/releases/latest`
    if (url.startsWith('https://github.com/')) await shell.openExternal(url)
    return state
  }
  busy = true
  const target = join(await downloadFolder(), offer.asset.name)
  const partial = `${target}.download`
  update({ status: 'downloading', progress: 0, error: null })

  try {
    const response = await net.fetch(offer.asset.browser_download_url, {
      headers: { 'User-Agent': `DaProdFinanza/${app.getVersion()}` }
    })
    if (!response.ok || !response.body) throw new Error(`Download non riuscito (${response.status}).`)

    const total = Number(response.headers.get('content-length')) || offer.asset.size
    const hash = createHash('sha256')
    const out = createWriteStream(partial)
    const reader = response.body.getReader()
    let received = 0
    let lastPercent = -1

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      received += value.length
      if (!out.write(value)) await new Promise<void>((resolve) => out.once('drain', () => resolve()))
      const percent = Math.floor((received / total) * 100)
      if (percent !== lastPercent) {
        lastPercent = percent
        update({ progress: Math.min(percent, 99) })
      }
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))

    const actual = hash.digest('hex')
    if (actual !== offer.sha256) {
      unlinkSync(partial)
      throw new Error('Il file scaricato non corrisponde a quello pubblicato: scartato.')
    }
    if (existsSync(target)) unlinkSync(target)
    renameSync(partial, target)
    downloaded = target
    update({ status: 'ready', progress: 100 })
  } catch (error) {
    if (existsSync(partial)) {
      try {
        unlinkSync(partial)
      } catch {
        // resta un file .download: verrà sovrascritto al prossimo tentativo
      }
    }
    update({ status: 'error', progress: null, error: messageOf(error, 'Download non riuscito.') })
  } finally {
    busy = false
  }
  return state
}

/** Chiude il programma e passa alla versione scaricata. */
export function installUpdate(): void {
  if (!downloaded || state.status !== 'ready') return
  backupDatabase()

  if (state.kind === 'installer') {
    spawn(downloaded, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
  } else {
    const old = process.env.PORTABLE_EXECUTABLE_FILE
    if (old && old !== downloaded) {
      writeFileSync(
        join(userDataDir(), CLEANUP_FILE),
        JSON.stringify({ old, replacement: downloaded }),
        'utf8'
      )
    }
    // Una cartella dati scelta all'avvio vale anche per la versione nuova.
    // (Si guarda anche argv: dietro il lanciatore dei portable hasSwitch
    // non sempre la vede.)
    const customData =
      app.commandLine.hasSwitch('user-data-dir') ||
      process.argv.some((arg) => arg.startsWith('--user-data-dir'))
    const args = customData ? [`--user-data-dir=${app.getPath('userData')}`] : []
    spawn(downloaded, args, { detached: true, stdio: 'ignore', cwd: dirname(downloaded) }).unref()
  }
  app.quit()
}

/**
 * Al primo avvio della versione nuova di un portable toglie quella vecchia.
 * Solo se è davvero questa la copia che l'ha sostituita, e solo se il file da
 * togliere ha il nome di un nostro eseguibile dello stesso tipo.
 */
function cleanupReplacedPortable(): void {
  const marker = join(userDataDir(), CLEANUP_FILE)
  if (!existsSync(marker)) return
  let info: { old?: string; replacement?: string }
  try {
    info = JSON.parse(readFileSync(marker, 'utf8'))
  } catch {
    unlinkSync(marker)
    return
  }
  const current = process.env.PORTABLE_EXECUTABLE_FILE
  if (!current || info.replacement !== current) return

  const pattern = assetPattern(state.kind)
  const old = info.old
  const removable = old && pattern?.test(basename(old)) && old !== current

  // La copia vecchia può metterci qualche secondo a chiudersi del tutto.
  let attempts = 0
  const tryRemove = (): void => {
    attempts++
    try {
      if (removable && existsSync(old)) unlinkSync(old)
      unlinkSync(marker)
    } catch {
      if (attempts < 10) setTimeout(tryRemove, 3_000)
    }
  }
  tryRemove()
}

export function initUpdates(): void {
  state = {
    kind: detectKind(),
    status: 'idle',
    current: app.getVersion(),
    latest: null,
    notes: null,
    publishedAt: null,
    progress: null,
    error: null,
    checkedAt: null
  }

  if (state.kind === 'portable' || state.kind === 'demo') cleanupReplacedPortable()

  // In sviluppo non si interroga GitHub da solo: il controllo resta a mano.
  if (state.kind === 'dev') return
  setTimeout(() => void checkForUpdates(), FIRST_CHECK_DELAY_MS)
  setInterval(() => void checkForUpdates(), CHECK_EVERY_MS)
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    // Senza rete net.fetch dà errori tecnici (net::ERR_…): meglio dirlo in chiaro.
    if (/net::ERR_/.test(error.message)) return 'Connessione a GitHub non riuscita: controlla la rete.'
    return error.message
  }
  return fallback
}
