import { dataLocale } from '@shared/engine'
import { newUuid, nowIso } from '../lib/ids'
import { getDatabase } from './index'

/**
 * Attività e ore di esempio per la Pizzeria DaProd (AGENTS.md §10.11), con
 * date relative a oggi: la bacheca e il grafico delle settimane sono pieni
 * qualunque giorno si apra la demo.
 */

const TARIFFA_CENTS = 8000 // 80 €/h

type Stato = 'todo' | 'in_progress' | 'review' | 'done'
type Priorita = 'low' | 'medium' | 'high' | 'urgent'

const ATTIVITA: {
  titolo: string
  stato: Stato
  priorita: Priorita
  /** Giorni da oggi (negativo = passata); null = senza scadenza. */
  scadenza: number | null
  stimaMinuti: number | null
  note?: string
}[] = [
  { titolo: 'Chiusura contabile di agosto', stato: 'done', priorita: 'high', scadenza: -8, stimaMinuti: 240 },
  { titolo: 'Budget 2027: prima bozza', stato: 'in_progress', priorita: 'high', scadenza: 12, stimaMinuti: 480, note: 'Partire dal forecast di settembre; sentire il titolare sui nuovi coperti.' },
  { titolo: 'Rinegoziare il fido con Banca Demo', stato: 'review', priorita: 'urgent', scadenza: 3, stimaMinuti: 180, note: 'Utilizzo sopra l’80%: preparare il prospetto dei flussi.' },
  { titolo: 'Analisi food cost per il menù autunnale', stato: 'todo', priorita: 'medium', scadenza: 20, stimaMinuti: 150 },
  { titolo: 'Sollecito incassi dal catering aziendale', stato: 'todo', priorita: 'high', scadenza: -2, stimaMinuti: 45 },
  { titolo: 'Report trimestrale per i soci', stato: 'todo', priorita: 'medium', scadenza: 25, stimaMinuti: 120 },
  { titolo: 'Verifica rate del mutuo ristrutturazione', stato: 'done', priorita: 'low', scadenza: -15, stimaMinuti: 60 },
  { titolo: 'Piano di rientro fornitore farine', stato: 'in_progress', priorita: 'medium', scadenza: 7, stimaMinuti: 90 }
]

/** Voci di tempo: [giorni fa, indice attività o null, minuti, descrizione, fatturabile]. */
const ORE: [number, number | null, number, string, boolean][] = [
  [0, 1, 75, 'Ricavi per coperto e stagionalità', true],
  [1, 2, 50, 'Prospetto flussi per la banca', true],
  [1, null, 20, 'Telefonata con il titolare', false],
  [2, 7, 40, 'Proposta di rientro in 6 rate', true],
  [3, 1, 95, 'Costi del personale 2027', true],
  [6, 0, 110, 'Quadratura banche e cassa', true],
  [7, 0, 85, 'Ratei e risconti', true],
  [8, 6, 55, 'Controllo piano di ammortamento', true],
  [10, 2, 35, 'Raccolta estratti conto', true],
  [13, null, 30, 'Incontro in pizzeria', false],
  [14, 0, 60, 'Registrazioni di agosto', true],
  [17, 3, 25, 'Prime schede ricetta', true],
  [21, 6, 40, 'Estratto mutuo', true],
  [22, null, 90, 'Revisione mensile dei conti', true],
  [28, null, 120, 'Chiusura di luglio', true],
  [31, null, 45, 'Scadenziario fornitori', true],
  [36, null, 80, 'Analisi margini estivi', true],
  [43, null, 60, 'Report per i soci', true],
  [49, null, 100, 'Chiusura di giugno', true]
]

export function seedDemoActivities(companyUuid: string): void {
  const db = getDatabase()
  const now = nowIso()
  const oggi = new Date()
  const giorno = (delta: number): string => {
    const d = new Date(oggi)
    d.setDate(d.getDate() + delta)
    return dataLocale(d)
  }

  db.transaction(() => {
    const uuids = ATTIVITA.map((a, i) => {
      const uuid = newUuid()
      db.prepare(
        `INSERT INTO tasks (uuid, company_uuid, title, notes, status, priority, due_date,
                            estimate_minutes, position, completed_at, created_at, updated_at, synced, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
      ).run(
        uuid,
        companyUuid,
        a.titolo,
        a.note ?? null,
        a.stato,
        a.priorita,
        a.scadenza === null ? null : giorno(a.scadenza),
        a.stimaMinuti,
        i + 1,
        a.stato === 'done' ? now : null,
        now,
        now
      )
      return uuid
    })

    for (const [fa, attivita, minuti, descrizione, fatturabile] of ORE) {
      db.prepare(
        `INSERT INTO time_entries (uuid, company_uuid, task_uuid, description, work_date, started_at,
                                   ended_at, minutes, billable, created_at, updated_at, synced, deleted)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, 0, 0)`
      ).run(
        newUuid(),
        companyUuid,
        attivita === null ? null : uuids[attivita],
        descrizione,
        giorno(-fa),
        minuti,
        fatturabile ? 1 : 0,
        now,
        now
      )
    }

    db.prepare(
      `INSERT OR REPLACE INTO activity_settings (company_uuid, hourly_rate_cents, updated_at, synced)
       VALUES (?, ?, ?, 0)`
    ).run(companyUuid, TARIFFA_CENTS, now)
  })()
}
