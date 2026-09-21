import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { backupDatabase } from '../db'
import { getAppSettings } from '../server/services/settings.service'
import { backupRoot } from './paths'

/**
 * Backup automatico — impostazione "Una copia al giorno" (AGENTS.md §10.12,
 * già prevista da §8: "giornaliero, ultimi N conservati").
 *
 * Una copia per giorno di calendario, fatta al primo avvio della giornata (e
 * ricontrollata ogni ora, per chi tiene il programma aperto per giorni). Le
 * copie automatiche stanno in una cartella a parte, così la pulizia delle più
 * vecchie non tocca mai quelle fatte a mano dal pulsante "Backup". Come le
 * altre, restano cifrate con la chiave di questa installazione.
 */

const PREFISSO = 'daprodfinanza-auto-'
const OGNI_ORA_MS = 60 * 60 * 1000

function cartella(): string {
  const dir = join(backupRoot(), 'automatici')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function oggi(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Fa la copia di oggi se manca, poi tiene solo le ultime N. Non lancia mai: un backup non deve fermare il lavoro. */
export function applicaBackupAutomatico(): string | null {
  try {
    const settings = getAppSettings()
    if (!settings.backupAutomatico) return null
    const dir = cartella()
    const target = join(dir, `${PREFISSO}${oggi()}.db`)
    let creato: string | null = null
    if (!existsSync(target)) creato = backupDatabase(target)

    const copie = readdirSync(dir)
      .filter((f) => f.startsWith(PREFISSO) && f.endsWith('.db'))
      .sort()
    for (const vecchia of copie.slice(0, Math.max(0, copie.length - settings.backupDaTenere))) {
      unlinkSync(join(dir, vecchia))
    }
    if (creato) console.log(`[backup] copia automatica: ${creato}`)
    return creato
  } catch (err) {
    console.error('[backup] copia automatica non riuscita:', err)
    return null
  }
}

let timer: ReturnType<typeof setInterval> | null = null

export function avviaBackupAutomatico(): void {
  applicaBackupAutomatico()
  if (!timer) timer = setInterval(applicaBackupAutomatico, OGNI_ORA_MS)
}
