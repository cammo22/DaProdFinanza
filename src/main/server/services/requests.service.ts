import {
  REQUEST_OPEN_STATUSES,
  preferredTimeLabel,
  type InboxSummary,
  type RequestAction,
  type RequestDetail,
  type RequestEvent,
  type RequestEventKind,
  type RequestItem,
  type RequestKind,
  type RequestStatus
} from '@shared/documents'
import type { Role } from '@shared/enums'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import { HttpError } from '../http-error'
import { addTimeEntry } from './activities.service'
import { getCompany } from './companies.service'
import { listDocuments } from './documents.service'
import { getAppSettings } from './settings.service'

/**
 * Richieste fra le aziende e lo studio — AGENTS.md §10.14 (versione 1.3.0).
 *
 * L'azienda chiede (una chiamata, una risposta, di guardare dei documenti) e
 * deve poter vedere a che punto è: vista, presa in carico, in attesa di lei,
 * risolta. Lo studio risponde a voce o per scritto, con i pulsanti della
 * chiamata in arrivo. Ogni passaggio lascia una riga nella storia, con chi
 * l'ha fatto e quando: è quella che l'azienda legge.
 */

export interface Attore {
  uuid: string
  name: string
  role: Role
}

const OPEN = REQUEST_OPEN_STATUSES as readonly string[]

// --- lettura ---------------------------------------------------------------------

const SELECT = `SELECT r.*, c.name AS company_name,
                       (SELECT count(*) FROM documents d WHERE d.request_uuid = r.uuid AND d.deleted = 0) AS document_count
                  FROM requests r JOIN companies c ON c.uuid = r.company_uuid`

function getRequest(companyUuid: string, uuid: string): RequestItem {
  const row = getDatabase()
    .prepare(`${SELECT} WHERE r.uuid = ? AND r.company_uuid = ? AND r.deleted = 0`)
    .get(uuid, companyUuid) as RequestItem | undefined
  if (!row) throw new HttpError(404, 'Richiesta non trovata.')
  return row
}

export function listRequests(companyUuid: string, options: { aperte?: boolean } = {}): RequestItem[] {
  getCompany(companyUuid)
  const filtro = options.aperte ? `AND r.status IN (${OPEN.map(() => '?').join(', ')})` : ''
  return getDatabase()
    .prepare(`${SELECT} WHERE r.company_uuid = ? AND r.deleted = 0 ${filtro} ORDER BY r.last_event_at DESC`)
    .all(companyUuid, ...(options.aperte ? OPEN : [])) as RequestItem[]
}

/** Tutte le richieste dello studio, in tutte le aziende: la casella "Richieste". */
export function listAllRequests(options: { aperte?: boolean } = {}): RequestItem[] {
  const filtro = options.aperte ? `AND r.status IN (${OPEN.map(() => '?').join(', ')})` : ''
  return getDatabase()
    .prepare(
      `${SELECT} WHERE r.deleted = 0 AND c.deleted = 0 ${filtro}
        ORDER BY r.unread_studio DESC, r.last_event_at DESC LIMIT 300`
    )
    .all(...(options.aperte ? OPEN : [])) as RequestItem[]
}

function events(requestUuid: string): RequestEvent[] {
  return getDatabase()
    .prepare(
      `SELECT uuid, request_uuid, kind, status, text, document_uuid, author_uuid, author_name, author_role, created_at
         FROM request_events WHERE request_uuid = ? AND deleted = 0 ORDER BY created_at, rowid`
    )
    .all(requestUuid) as RequestEvent[]
}

/**
 * Il dettaglio di una richiesta. Aprirla conta come "vista": per lo studio, la
 * prima volta, lo stato passa da Inviata a Vista e l'azienda lo sa; per
 * ciascuno dei due si spegne il pallino delle novità.
 */
export function openRequest(companyUuid: string, uuid: string, attore: Attore): RequestDetail {
  const db = getDatabase()
  const r = getRequest(companyUuid, uuid)
  const now = nowIso()
  db.transaction(() => {
    if (attore.role === 'consultant') {
      if (r.status === 'inviata') {
        db.prepare(
          `UPDATE requests SET status = 'vista', seen_at = ?, unread_studio = 0, unread_company = 1,
                  last_event_at = ?, updated_at = ?, synced = 0 WHERE uuid = ?`
        ).run(now, now, now, uuid)
        evento(r, 'vista', attore, { status: 'vista', text: null }, now)
      } else if (r.unread_studio) {
        db.prepare('UPDATE requests SET unread_studio = 0, updated_at = ?, synced = 0 WHERE uuid = ?').run(now, uuid)
      }
    } else if (r.unread_company) {
      db.prepare('UPDATE requests SET unread_company = 0, updated_at = ?, synced = 0 WHERE uuid = ?').run(now, uuid)
    }
  })()
  const aggiornata = getRequest(companyUuid, uuid)
  return {
    ...aggiornata,
    events: events(uuid),
    documents: listDocuments(companyUuid, { role: attore.role, requestUuid: uuid })
  }
}

// --- scrittura -------------------------------------------------------------------

function evento(
  r: Pick<RequestItem, 'uuid' | 'company_uuid'>,
  kind: RequestEventKind,
  attore: Attore,
  extra: { status?: RequestStatus | null; text?: string | null; document_uuid?: string | null },
  at = nowIso()
): void {
  getDatabase()
    .prepare(
      `INSERT INTO request_events (uuid, request_uuid, company_uuid, kind, status, text, document_uuid,
                                   author_uuid, author_name, author_role, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
    )
    .run(
      newUuid(),
      r.uuid,
      r.company_uuid,
      kind,
      extra.status ?? null,
      extra.text ?? null,
      extra.document_uuid ?? null,
      attore.uuid,
      attore.name,
      attore.role,
      at,
      at
    )
}

/** Registra un evento dall'esterno di questo modulo (es. un documento aperto). */
export function registraEvento(
  companyUuid: string,
  requestUuid: string,
  kind: RequestEventKind,
  attore: Attore,
  extra: { text?: string | null; document_uuid?: string | null },
  notifica: 'studio' | 'azienda' | null
): void {
  const r = getRequest(companyUuid, requestUuid)
  const now = nowIso()
  evento(r, kind, attore, extra, now)
  const unread =
    notifica === 'studio' ? ', unread_studio = 1' : notifica === 'azienda' ? ', unread_company = 1' : ''
  getDatabase()
    .prepare(`UPDATE requests SET last_event_at = ?, updated_at = ?, synced = 0 ${unread} WHERE uuid = ?`)
    .run(now, now, requestUuid)
}

function testo(v: unknown, campo: string, max: number, obbligatorio = false): string | null {
  if (v === undefined || v === null || v === '') {
    if (obbligatorio) throw new HttpError(400, `${campo}: è obbligatorio.`)
    return null
  }
  if (typeof v !== 'string') throw new HttpError(400, `${campo} non valido.`)
  const t = v.trim()
  if (obbligatorio && !t) throw new HttpError(400, `${campo}: è obbligatorio.`)
  if (t.length > max) throw new HttpError(400, `${campo}: al massimo ${max} caratteri.`)
  return t || null
}

function prossimoNumero(companyUuid: string): number {
  const row = getDatabase()
    .prepare('SELECT max(number) AS n FROM requests WHERE company_uuid = ?')
    .get(companyUuid) as { n: number | null }
  return (row.n ?? 0) + 1
}

export interface NuovaRichiesta {
  kind?: unknown
  subject?: unknown
  body?: unknown
  urgent?: unknown
  phone?: unknown
  preferred_time?: unknown
  due_date?: unknown
}

/**
 * Una richiesta nuova. Dall'azienda: chiamata, domanda o documenti, e lo
 * studio riceve il pallino (e, per le chiamate, lo squillo). Dallo studio: una
 * domanda o una richiesta di documenti, che parte già "in attesa" dell'azienda.
 */
export function createRequest(companyUuid: string, input: NuovaRichiesta, attore: Attore): RequestItem {
  getCompany(companyUuid)
  const kind = input.kind as RequestKind
  if (!['chiamata', 'domanda', 'documenti'].includes(kind)) {
    throw new HttpError(400, 'Tipo di richiesta non valido.')
  }
  const origin = attore.role === 'consultant' ? 'studio' : 'azienda'
  if (kind === 'chiamata' && origin === 'studio') {
    throw new HttpError(400, 'Per chiamare un’azienda basta telefonarle: le richieste di chiamata le fanno le aziende.')
  }

  const predefinito =
    kind === 'chiamata' ? 'Vorrei essere richiamato' : kind === 'documenti' ? 'Documenti' : null
  const subject = testo(input.subject, 'Oggetto', 160) ?? predefinito
  if (!subject) throw new HttpError(400, 'Scrivi in due parole di cosa si tratta.')
  const body = testo(input.body, 'Messaggio', 4000)
  const phone = kind === 'chiamata' ? testo(input.phone, 'Telefono', 40, true) : null
  const preferred = kind === 'chiamata' ? (testo(input.preferred_time, 'Quando', 80) ?? 'subito') : null
  const due = testo(input.due_date, 'Scadenza', 10)
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new HttpError(400, 'Scadenza: data non valida.')

  const uuid = newUuid()
  const now = nowIso()
  const status: RequestStatus = origin === 'studio' ? 'in_attesa' : 'inviata'
  const db = getDatabase()
  db.transaction(() => {
    db.prepare(
      `INSERT INTO requests (uuid, company_uuid, number, kind, origin, subject, body, status, urgent,
                             phone, preferred_time, callback_at, due_date, created_by_uuid, created_by_name,
                             assigned_uuid, assigned_name, seen_at, taken_at, closed_at, last_event_at,
                             unread_studio, unread_company, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, 0, 0)`
    ).run(
      uuid,
      companyUuid,
      prossimoNumero(companyUuid),
      kind,
      origin,
      subject,
      body,
      status,
      input.urgent === true ? 1 : 0,
      phone,
      preferred,
      due,
      attore.uuid,
      attore.name,
      origin === 'studio' ? attore.uuid : null,
      origin === 'studio' ? attore.name : null,
      now,
      origin === 'azienda' ? 1 : 0,
      origin === 'studio' ? 1 : 0,
      now,
      now
    )
    evento({ uuid, company_uuid: companyUuid }, 'creata', attore, { status, text: body }, now)
  })()
  return getRequest(companyUuid, uuid)
}

/**
 * Un messaggio. Chi scrive passa la palla all'altro: se l'azienda risponde a
 * una richiesta "in attesa di risposta" o già chiusa, torna allo studio.
 */
export function addMessage(
  companyUuid: string,
  uuid: string,
  input: { text?: unknown; risolvi?: unknown },
  attore: Attore
): RequestItem {
  const r = getRequest(companyUuid, uuid)
  const text = testo(input.text, 'Messaggio', 4000, true)
  const now = nowIso()
  const db = getDatabase()
  db.transaction(() => {
    evento(r, 'messaggio', attore, { text }, now)
    if (attore.role === 'consultant') {
      const chiudi = input.risolvi === true
      const status: RequestStatus = chiudi ? 'risolta' : r.status === 'inviata' ? 'vista' : r.status
      db.prepare(
        `UPDATE requests SET status = ?, seen_at = coalesce(seen_at, ?), closed_at = ?,
                unread_company = 1, unread_studio = 0, last_event_at = ?, updated_at = ?, synced = 0
          WHERE uuid = ?`
      ).run(status, now, chiudi ? now : r.closed_at, now, now, uuid)
      if (chiudi && r.status !== 'risolta') evento(r, 'stato', attore, { status: 'risolta' }, now)
    } else {
      const riapre = r.status === 'risolta' || r.status === 'annullata'
      const status: RequestStatus = riapre ? 'inviata' : r.status === 'in_attesa' ? 'in_carico' : r.status
      db.prepare(
        `UPDATE requests SET status = ?, closed_at = ?, unread_studio = 1, unread_company = 0,
                last_event_at = ?, updated_at = ?, synced = 0 WHERE uuid = ?`
      ).run(status, riapre ? null : r.closed_at, now, now, uuid)
      if (riapre) evento(r, 'stato', attore, { status: 'inviata', text: 'Riaperta con un nuovo messaggio' }, now)
    }
  })()
  return getRequest(companyUuid, uuid)
}

function oraItaliana(iso: string): string {
  const d = new Date(iso)
  const oggi = new Date()
  const domani = new Date()
  domani.setDate(oggi.getDate() + 1)
  const stessoGiorno = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (stessoGiorno(d, oggi)) return `oggi alle ${ora}`
  if (stessoGiorno(d, domani)) return `domani alle ${ora}`
  return `${d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} alle ${ora}`
}

/**
 * I pulsanti dello studio (e i due dell'azienda: annullare e riaprire).
 * Ognuno cambia lo stato e scrive nella storia una frase che l'azienda capisce.
 */
export function requestAction(
  companyUuid: string,
  uuid: string,
  input: {
    action?: unknown
    text?: unknown
    callback_at?: unknown
    minutes?: unknown
    assignee_uuid?: unknown
  },
  attore: Attore
): RequestItem {
  const r = getRequest(companyUuid, uuid)
  const action = input.action as RequestAction
  const studio = attore.role === 'consultant'
  const consentite: RequestAction[] = studio
    ? ['prendi_in_carico', 'chiamo_ora', 'richiamo', 'chiamata_fatta', 'non_risponde', 'in_attesa', 'risolvi', 'riapri', 'annulla', 'assegna']
    : ['annulla', 'riapri']
  // Chiunque dell'azienda può annullare o riaprire le richieste della sua azienda: sono sue.
  if (!consentite.includes(action)) throw new HttpError(400, 'Azione non valida.')

  const note = testo(input.text, 'Nota', 2000)
  const now = nowIso()
  const db = getDatabase()
  const aperta = OPEN.includes(r.status)
  const chiamata = r.kind === 'chiamata'

  let status: RequestStatus = r.status
  let callback: string | null = r.callback_at
  let assegnato: { uuid: string | null; name: string | null } = { uuid: r.assigned_uuid, name: r.assigned_name }
  const eventi: { kind: RequestEventKind; status?: RequestStatus; text: string | null }[] = []

  const prendi = (): void => {
    if (assegnato.uuid !== attore.uuid) assegnato = { uuid: attore.uuid, name: attore.name }
  }

  switch (action) {
    case 'prendi_in_carico':
      if (!aperta) throw new HttpError(409, 'La richiesta è già chiusa: riaprila prima.')
      prendi()
      status = 'in_carico'
      eventi.push({ kind: 'stato', status, text: note ?? `Se ne occupa ${attore.name}.` })
      break
    case 'chiamo_ora':
      if (!chiamata) throw new HttpError(400, 'Non è una richiesta di chiamata.')
      prendi()
      status = 'in_carico'
      callback = null
      eventi.push({ kind: 'chiamata', status, text: note ?? `${attore.name} ti sta chiamando.` })
      break
    case 'richiamo': {
      if (!chiamata) throw new HttpError(400, 'Non è una richiesta di chiamata.')
      const quando = typeof input.callback_at === 'string' ? input.callback_at : ''
      const d = new Date(quando)
      if (!quando || Number.isNaN(d.getTime())) throw new HttpError(400, 'Indica quando richiamare.')
      prendi()
      status = 'in_carico'
      callback = d.toISOString()
      eventi.push({ kind: 'richiamo', status, text: `${attore.name} ti richiama ${oraItaliana(callback)}.${note ? ` ${note}` : ''}` })
      break
    }
    case 'chiamata_fatta': {
      if (!chiamata) throw new HttpError(400, 'Non è una richiesta di chiamata.')
      status = 'risolta'
      callback = null
      eventi.push({ kind: 'chiamata', status, text: note ? `Chiamata fatta. ${note}` : 'Chiamata fatta.' })
      break
    }
    case 'non_risponde':
      if (!chiamata) throw new HttpError(400, 'Non è una richiesta di chiamata.')
      prendi()
      status = 'in_carico'
      eventi.push({
        kind: 'chiamata',
        status,
        text: `${attore.name} ha provato a chiamarti, senza risposta.${note ? ` ${note}` : ''}`
      })
      break
    case 'in_attesa':
      if (!aperta) throw new HttpError(409, 'La richiesta è già chiusa.')
      prendi()
      status = 'in_attesa'
      eventi.push({ kind: 'stato', status, text: note ?? 'Lo studio aspetta una tua risposta.' })
      break
    case 'risolvi':
      status = 'risolta'
      eventi.push({ kind: 'stato', status, text: note })
      break
    case 'riapri':
      if (aperta) throw new HttpError(409, 'La richiesta è già aperta.')
      status = studio ? 'in_carico' : 'inviata'
      if (studio) prendi()
      eventi.push({ kind: 'stato', status, text: note ?? 'Riaperta.' })
      break
    case 'annulla':
      if (!aperta) throw new HttpError(409, 'La richiesta è già chiusa.')
      status = 'annullata'
      callback = null
      eventi.push({ kind: 'stato', status, text: note })
      break
    case 'assegna': {
      const chi = typeof input.assignee_uuid === 'string' ? input.assignee_uuid : ''
      const collega = db
        .prepare(`SELECT uuid, full_name FROM users WHERE uuid = ? AND role = 'consultant' AND active = 1 AND deleted = 0`)
        .get(chi) as { uuid: string; full_name: string } | undefined
      if (!collega) throw new HttpError(400, 'Scegli un consulente attivo dello studio.')
      assegnato = { uuid: collega.uuid, name: collega.full_name }
      if (status === 'inviata' || status === 'vista') status = 'in_carico'
      eventi.push({ kind: 'assegnata', status, text: `Affidata a ${collega.full_name}.` })
      break
    }
  }

  const chiusa = status === 'risolta' || status === 'annullata'
  db.transaction(() => {
    db.prepare(
      `UPDATE requests SET status = ?, callback_at = ?, assigned_uuid = ?, assigned_name = ?,
              seen_at = CASE WHEN ? THEN coalesce(seen_at, ?) ELSE seen_at END,
              taken_at = CASE WHEN ? = 'in_carico' THEN coalesce(taken_at, ?) ELSE taken_at END,
              closed_at = ?, last_event_at = ?,
              unread_company = CASE WHEN ? THEN 1 ELSE unread_company END,
              unread_studio = CASE WHEN ? THEN 1 ELSE 0 END,
              updated_at = ?, synced = 0
        WHERE uuid = ?`
    ).run(
      status,
      callback,
      assegnato.uuid,
      assegnato.name,
      studio ? 1 : 0,
      now,
      status,
      now,
      chiusa ? now : null,
      now,
      studio ? 1 : 0,
      studio ? 0 : 1,
      now,
      uuid
    )
    for (const e of eventi) evento(r, e.kind, attore, { status: e.status ?? null, text: e.text }, now)

    // A chiamata fatta, i minuti finiscono nelle ore dello studio (Attività e Tempi).
    const minuti = Number(input.minutes)
    if (action === 'chiamata_fatta' && Number.isInteger(minuti) && minuti > 0 && getAppSettings().moduli.attivita) {
      addTimeEntry(companyUuid, {
        description: `Chiamata: ${r.subject}`.slice(0, 300),
        minutes: minuti,
        billable: true
      })
    }
  })()
  return getRequest(companyUuid, uuid)
}

// --- il campanello ---------------------------------------------------------------

/**
 * Riepilogo leggero, chiesto ogni pochi secondi: quante novità ci sono, e per
 * lo studio le chiamate che aspettano una risposta (quelle non ancora prese,
 * e quelle da richiamare adesso).
 */
export function inboxSummary(role: Role, companyUuid: string | null): InboxSummary {
  const db = getDatabase()
  const aperte = `status IN (${OPEN.map(() => '?').join(', ')})`
  if (role === 'company') {
    if (!companyUuid) return { unread: 0, open: 0, calls: [], last_event_at: null }
    const row = db
      .prepare(
        `SELECT sum(unread_company) AS unread, sum(CASE WHEN ${aperte} THEN 1 ELSE 0 END) AS open,
                max(last_event_at) AS last
           FROM requests WHERE company_uuid = ? AND deleted = 0`
      )
      .get(...OPEN, companyUuid) as { unread: number | null; open: number | null; last: string | null }
    return { unread: row.unread ?? 0, open: row.open ?? 0, calls: [], last_event_at: row.last }
  }
  const row = db
    .prepare(
      `SELECT sum(r.unread_studio) AS unread, sum(CASE WHEN r.${aperte} THEN 1 ELSE 0 END) AS open,
              max(r.last_event_at) AS last
         FROM requests r JOIN companies c ON c.uuid = r.company_uuid
        WHERE r.deleted = 0 AND c.deleted = 0`
    )
    .get(...OPEN) as { unread: number | null; open: number | null; last: string | null }
  const now = nowIso()
  const calls = db
    .prepare(
      `${SELECT}
        WHERE r.deleted = 0 AND c.deleted = 0 AND r.kind = 'chiamata'
          AND (r.status IN ('inviata', 'vista') OR (r.status = 'in_carico' AND r.callback_at IS NOT NULL AND r.callback_at <= ?))
        ORDER BY r.urgent DESC, r.created_at`
    )
    .all(now) as RequestItem[]
  return { unread: row.unread ?? 0, open: row.open ?? 0, calls, last_event_at: row.last }
}

/** Novità non lette dallo studio, azienda per azienda (per i pallini nel menu). */
export function unreadByCompany(): Record<string, number> {
  const rows = getDatabase()
    .prepare(
      `SELECT company_uuid, count(*) AS n FROM requests
        WHERE deleted = 0 AND unread_studio = 1 GROUP BY company_uuid`
    )
    .all() as { company_uuid: string; n: number }[]
  return Object.fromEntries(rows.map((r) => [r.company_uuid, r.n]))
}

/** Per il riepilogo dell'azienda: la frase che dice a che punto è, in una riga. */
export function descriviStato(r: RequestItem): string {
  switch (r.status) {
    case 'inviata':
      return 'Inviata, lo studio non l’ha ancora aperta'
    case 'vista':
      return 'Vista dallo studio'
    case 'in_carico':
      if (r.kind === 'chiamata' && r.callback_at) return `${r.assigned_name ?? 'Lo studio'} ti richiama ${oraItaliana(r.callback_at)}`
      return `Presa in carico da ${r.assigned_name ?? 'lo studio'}`
    case 'in_attesa':
      return 'Lo studio aspetta una tua risposta'
    case 'risolta':
      return 'Risolta'
    case 'annullata':
      return 'Annullata'
  }
}

export { preferredTimeLabel }
