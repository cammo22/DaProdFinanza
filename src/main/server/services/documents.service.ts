import { createHash } from 'node:crypto'
import {
  DOCUMENT_CATEGORIES,
  estensione,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_BYTES_WEB,
  type DocumentItem
} from '@shared/documents'
import type { Role } from '@shared/enums'
import { getDatabase } from '../../db'
import { newUuid, nowIso } from '../../lib/ids'
import {
  APERTURA_ESTERNA,
  leggiDocumento,
  percorsoDocumento,
  salvaDocumento,
  statoDocumento
} from '../../lib/document-store'
import { HttpError } from '../http-error'
import { getCompany } from './companies.service'
import { registraEvento, type Attore } from './requests.service'

/**
 * Il cassetto documenti di ogni azienda — AGENTS.md §10.13 (versione 1.3.0).
 *
 * Tutti ci mettono file: lo studio (per sé o da condividere) e l'azienda (che
 * li manda allo studio). I file si aprono al volo dentro il programma, senza
 * Office, e sul computer anche col programma di sistema.
 *
 * Chi vede cosa: lo studio vede tutto; l'azienda solo i file condivisi
 * (`shared = 1`), che comprendono sempre quelli che ha mandato lei.
 */

const COLONNE = `uuid, company_uuid, name, ext, mime, size_bytes, sha256, category, shared, note, request_uuid,
                 uploaded_by_uuid, uploaded_by_name, uploaded_by_role, opened_by_studio_at,
                 opened_by_company_at, created_at, updated_at`

export function listDocuments(
  companyUuid: string,
  options: { role: Role; requestUuid?: string } = { role: 'consultant' }
): DocumentItem[] {
  getCompany(companyUuid)
  const soloCondivisi = options.role === 'company' ? 'AND shared = 1' : ''
  const perRichiesta = options.requestUuid ? 'AND request_uuid = ?' : ''
  return getDatabase()
    .prepare(
      `SELECT ${COLONNE} FROM documents
        WHERE company_uuid = ? AND deleted = 0 ${soloCondivisi} ${perRichiesta}
        ORDER BY created_at DESC`
    )
    .all(companyUuid, ...(options.requestUuid ? [options.requestUuid] : [])) as DocumentItem[]
}

function getDocument(companyUuid: string, uuid: string, role: Role): DocumentItem & { storage_key: string } {
  const row = getDatabase()
    .prepare(`SELECT ${COLONNE}, storage_key FROM documents WHERE uuid = ? AND company_uuid = ? AND deleted = 0`)
    .get(uuid, companyUuid) as (DocumentItem & { storage_key: string }) | undefined
  // Un file dello studio non condiviso, per l'azienda, non esiste.
  if (!row || (role === 'company' && !row.shared)) throw new HttpError(404, 'Documento non trovato.')
  return row
}

/** Una delle categorie proposte (DOCUMENT_CATEGORIES) o una scritta a mano; vuota = "Altro". */
function categoria(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1]
  return v.trim().slice(0, 60)
}

/** Decodifica un'intestazione mandata con encodeURIComponent (nomi con accenti e spazi). */
export function intestazione(v: string | undefined): string | null {
  if (!v) return null
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

export interface Caricamento {
  name: string | null
  mime: string | null
  category: string | null
  shared: boolean
  note: string | null
  requestUuid: string | null
}

/**
 * Salva un file nel cassetto. Il contenuto arriva così com'è (non in JSON):
 * si calcola l'impronta, si scrive su disco e poi si registra. Se il file è
 * attaccato a una richiesta, la storia della richiesta lo dice.
 */
export async function uploadDocument(
  companyUuid: string,
  bytes: Uint8Array,
  meta: Caricamento,
  attore: Attore,
  // Sul telefono (demo) i file stanno nel database del browser: meglio tenerli piccoli.
  maxBytes = APERTURA_ESTERNA ? MAX_DOCUMENT_BYTES : MAX_DOCUMENT_BYTES_WEB
): Promise<DocumentItem> {
  const company = getCompany(companyUuid)
  const name = (meta.name ?? '').trim().slice(0, 200)
  if (!name) throw new HttpError(400, 'Manca il nome del file.')
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new HttpError(400, 'Il file è vuoto o non è arrivato.')
  }
  if (bytes.byteLength > maxBytes) {
    throw new HttpError(413, `Il file supera i ${Math.round(maxBytes / (1024 * 1024))} MB: dividilo o comprimilo.`)
  }

  const studio = attore.role === 'consultant'
  if (meta.requestUuid) {
    const r = getDatabase()
      .prepare('SELECT uuid FROM requests WHERE uuid = ? AND company_uuid = ? AND deleted = 0')
      .get(meta.requestUuid, companyUuid)
    if (!r) throw new HttpError(404, 'Richiesta non trovata.')
  }

  const uuid = newUuid()
  const sha256 = createHash('sha256').update(bytes).digest('hex') as string
  const storageKey = await salvaDocumento(company.code, uuid, name, bytes)
  const now = nowIso()
  // L'azienda condivide sempre: il file è suo e lo manda allo studio.
  const shared = studio ? (meta.shared ? 1 : 0) : 1

  getDatabase()
    .prepare(
      `INSERT INTO documents (uuid, company_uuid, name, ext, mime, size_bytes, sha256, storage_key, category,
                              shared, note, request_uuid, uploaded_by_uuid, uploaded_by_name, uploaded_by_role,
                              opened_by_studio_at, opened_by_company_at, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
    )
    .run(
      uuid,
      companyUuid,
      name,
      estensione(name),
      meta.mime?.slice(0, 120) || null,
      bytes.byteLength,
      sha256,
      storageKey,
      categoria(meta.category),
      shared,
      meta.note?.trim().slice(0, 500) || null,
      meta.requestUuid,
      attore.uuid,
      attore.name,
      attore.role,
      // Chi carica un file l'ha già "visto".
      studio ? now : null,
      studio ? null : now,
      now,
      now
    )

  if (meta.requestUuid) {
    registraEvento(
      companyUuid,
      meta.requestUuid,
      'documento',
      attore,
      { text: `Ha allegato «${name}».`, document_uuid: uuid },
      studio ? (shared ? 'azienda' : null) : 'studio'
    )
  }
  return getDocument(companyUuid, uuid, attore.role)
}

/**
 * Il contenuto, per aprirlo nel programma. La prima apertura da parte dello
 * studio di un file mandato dall'azienda si segna, e se il file è di una
 * richiesta l'azienda lo legge nella storia: "Camillo ha aperto «estratto.pdf»".
 */
export async function documentContent(
  companyUuid: string,
  uuid: string,
  attore: Attore
): Promise<{ doc: DocumentItem; bytes: Uint8Array }> {
  const doc = getDocument(companyUuid, uuid, attore.role)
  const bytes = await leggiDocumento(doc.storage_key)
  const now = nowIso()
  const db = getDatabase()
  if (attore.role === 'consultant' && !doc.opened_by_studio_at) {
    db.prepare('UPDATE documents SET opened_by_studio_at = ?, updated_at = ?, synced = 0 WHERE uuid = ?').run(now, now, uuid)
    if (doc.request_uuid && doc.uploaded_by_role === 'company') {
      registraEvento(companyUuid, doc.request_uuid, 'documento', attore, {
        text: `${attore.name} ha aperto «${doc.name}».`,
        document_uuid: uuid
      }, 'azienda')
    }
  } else if (attore.role === 'company' && !doc.opened_by_company_at) {
    db.prepare('UPDATE documents SET opened_by_company_at = ?, updated_at = ?, synced = 0 WHERE uuid = ?').run(now, now, uuid)
  }
  const { storage_key: _chiave, ...pubblico } = doc
  return { doc: pubblico, bytes }
}

/**
 * Dove sta il file sul disco, per aprirlo col programma di sistema. Solo sul
 * computer; il main controlla di nuovo il percorso prima di aprirlo.
 */
export async function documentPath(companyUuid: string, uuid: string, attore: Attore): Promise<{ path: string }> {
  if (!APERTURA_ESTERNA) throw new HttpError(400, 'Sul telefono i file si aprono solo dentro il programma.')
  const doc = getDocument(companyUuid, uuid, attore.role)
  const path = percorsoDocumento(doc.storage_key)
  if (!path || !(await statoDocumento(doc.storage_key))) {
    throw new HttpError(404, 'Il file non si trova più sul disco: forse è stato spostato o cancellato a mano.')
  }
  // Aprire il file col programma del computer conta come aprirlo.
  await documentContent(companyUuid, uuid, attore)
  return { path }
}

export function updateDocument(
  companyUuid: string,
  uuid: string,
  input: { name?: unknown; category?: unknown; shared?: unknown; note?: unknown },
  attore: Attore
): DocumentItem {
  const doc = getDocument(companyUuid, uuid, attore.role)
  if (attore.role === 'company' && doc.uploaded_by_role !== 'company') {
    throw new HttpError(403, 'I file dello studio li modifica lo studio.')
  }
  const name =
    typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 200) : doc.name
  // L'estensione decide come si apre: rinominando la si conserva.
  const ext = estensione(doc.name)
  const nome = ext && estensione(name) !== ext ? `${name}.${ext}` : name
  const shared =
    attore.role === 'consultant' && doc.uploaded_by_role === 'consultant' && typeof input.shared === 'boolean'
      ? input.shared
        ? 1
        : 0
      : doc.shared
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) || null : doc.note
  getDatabase()
    .prepare(
      `UPDATE documents SET name = ?, category = ?, shared = ?, note = ?, updated_at = ?, synced = 0 WHERE uuid = ?`
    )
    .run(nome, input.category === undefined ? doc.category : categoria(input.category), shared, note, nowIso(), uuid)
  return getDocument(companyUuid, uuid, attore.role)
}

/**
 * Togliere un file dal cassetto. Il file su disco resta (come gli originali
 * importati, §12): sparisce dall'elenco, non dalla storia. L'azienda può
 * togliere solo quello che ha mandato lei e che lo studio non ha ancora aperto.
 */
export function deleteDocument(companyUuid: string, uuid: string, attore: Attore): { uuid: string } {
  const doc = getDocument(companyUuid, uuid, attore.role)
  if (attore.role === 'company') {
    if (doc.uploaded_by_role !== 'company') throw new HttpError(403, 'I file dello studio li toglie lo studio.')
    if (doc.opened_by_studio_at) {
      throw new HttpError(409, 'Lo studio ha già aperto questo file: chiedigli di toglierlo, se serve.')
    }
  }
  getDatabase()
    .prepare('UPDATE documents SET deleted = 1, updated_at = ?, synced = 0 WHERE uuid = ?')
    .run(nowIso(), uuid)
  return { uuid }
}

/** Per il riepilogo dell'azienda: i file che lo studio le ha mandato e che non ha ancora aperto. */
export function newForCompany(companyUuid: string): DocumentItem[] {
  return getDatabase()
    .prepare(
      `SELECT ${COLONNE} FROM documents
        WHERE company_uuid = ? AND deleted = 0 AND shared = 1 AND uploaded_by_role = 'consultant'
          AND opened_by_company_at IS NULL
        ORDER BY created_at DESC LIMIT 20`
    )
    .all(companyUuid) as DocumentItem[]
}
