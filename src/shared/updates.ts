/**
 * Aggiornamenti da GitHub: tipi e regole pure, condivisi fra main e renderer.
 *
 * Le release escono sempre con tre eseguibili (installer, portable, demo) e
 * ciascuna copia del programma deve prendere il suo: un portable non si
 * aggiorna con l'installer, e la demo non deve mai diventare la versione vera.
 */

export const UPDATE_REPO = { owner: 'cammo22', repo: 'DaProdFinanza' } as const

/** Come è stata distribuita la copia in esecuzione. */
/** 'mac': la demo per Mac, che si aggiorna scaricando il DMG dalla pagina della release. */
/** 'android': la demo per telefono, che si aggiorna scaricando l'APK dalla pagina della release. */
export type UpdateKind = 'installer' | 'portable' | 'demo' | 'mac' | 'android' | 'dev'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'none'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateState {
  kind: UpdateKind
  status: UpdateStatus
  current: string
  /** Versione dell'ultima release, quando nota. */
  latest: string | null
  /** Testo della release (Markdown di GitHub), quando noto. */
  notes: string | null
  publishedAt: string | null
  /** Avanzamento del download, 0-100. */
  progress: number | null
  error: string | null
  /** Ultimo controllo andato a buon fine (ISO). */
  checkedAt: string | null
}

/** Nome del file della release che serve a ciascun tipo di copia. */
export function assetPattern(kind: UpdateKind): RegExp | null {
  switch (kind) {
    case 'installer':
      return /^DaProdFinanza-Setup-(\d+\.\d+\.\d+)\.exe$/
    case 'portable':
      return /^DaProdFinanza-(\d+\.\d+\.\d+)-portable\.exe$/
    case 'demo':
      return /^DaProdFinanza-Demo-(\d+\.\d+\.\d+)-portable\.exe$/
    case 'mac':
      return /^DaProdFinanza-Demo-(\d+\.\d+\.\d+)-mac-(?:arm64|x64)\.dmg$/
    case 'android':
      return /^DaProdFinanza-Demo-(\d+\.\d+\.\d+)-android\.apk$/
    case 'dev':
      return null
  }
}

export interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
  /** "sha256:…", calcolato da GitHub al caricamento. */
  digest?: string | null
}

export interface Release {
  tag_name: string
  /** Pagina della release su GitHub. */
  html_url?: string
  body?: string | null
  published_at?: string | null
  draft?: boolean
  prerelease?: boolean
  assets: ReleaseAsset[]
}

/** "v0.1.2" → [0, 1, 2]; null se non è una versione a tre numeri. */
export function parseVersion(text: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** Negativo se a < b, zero se uguali, positivo se a > b. */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) throw new Error(`Versione non valida: ${!va ? a : b}`)
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] - vb[i]
  }
  return 0
}

export interface UpdateOffer {
  version: string
  asset: ReleaseAsset
  /** Impronta SHA-256 attesa, in esadecimale minuscolo. */
  sha256: string
}

/**
 * Cosa offrire a una copia `kind` alla versione `current`, data l'ultima
 * release. null quando non c'è niente da fare.
 *
 * Il file deve avere la stessa versione del tag e l'impronta calcolata da
 * GitHub: senza impronta non si scarica niente, perché non si potrebbe
 * verificare che il file arrivato sia quello pubblicato.
 */
export function pickUpdate(release: Release, kind: UpdateKind, current: string): UpdateOffer | null {
  if (release.draft || release.prerelease) return null
  const pattern = assetPattern(kind)
  if (!pattern) return null

  const version = parseVersion(release.tag_name)
  if (!version) return null
  const tag = version.join('.')
  if (compareVersions(tag, current) <= 0) return null

  for (const asset of release.assets) {
    const match = pattern.exec(asset.name)
    if (!match || match[1] !== tag) continue
    const digest = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest ?? '')
    if (!digest) return null
    return { version: tag, asset, sha256: digest[1].toLowerCase() }
  }
  return null
}

/**
 * La nota della release in testo semplice, per la finestra "Novità":
 * via intestazioni, grassetti, tabelle e link, restano le frasi.
 */
export function releaseNotesText(markdown: string, maxLength = 1600): string {
  const text = markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*\|/.test(line)) // tabelle
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^\s*[-*]\s+/, '• ')
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text
}
