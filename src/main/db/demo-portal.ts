import { createHash } from 'node:crypto'
import { estensione } from '@shared/documents'
import { salvaDocumento } from '../lib/document-store'
import { newUuid } from '../lib/ids'
import { docx, pdf, pptx, xlsx } from './demo-files'
import { getDatabase } from './index'

/**
 * Documenti e richieste della Pizzeria DaProd (AGENTS.md §10.13-§10.14), per
 * far vedere la demo al lavoro: file dello studio da aprire al volo (PDF,
 * Excel, Word, PowerPoint), una richiesta risolta, una presa in carico, una
 * che aspetta l'azienda e una chiamata appena chiesta — che al primo ingresso
 * come consulente fa comparire il pannello della chiamata in arrivo.
 *
 * Le date sono relative al primo avvio, come per la tesoreria.
 */

interface Chi {
  uuid: string
  name: string
}

const ORA = (): number => Date.now()
const fa = (giorni: number, ore = 0): string => new Date(ORA() - giorni * 86_400_000 - ore * 3_600_000).toISOString()

function mesi(anno: number): string[] {
  return ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'].map((m) => `${m} ${anno}`)
}

async function documento(
  companyUuid: string,
  companyCode: string,
  nome: string,
  dati: Uint8Array,
  opzioni: {
    categoria: string
    chi: Chi
    ruolo: 'consultant' | 'company'
    condiviso?: boolean
    richiesta?: string | null
    quando: string
    apertoStudio?: string | null
    apertoAzienda?: string | null
    mime: string
  }
): Promise<string> {
  const uuid = newUuid()
  const chiave = await salvaDocumento(companyCode, uuid, nome, dati)
  getDatabase()
    .prepare(
      `INSERT INTO documents (uuid, company_uuid, name, ext, mime, size_bytes, sha256, storage_key, category, shared,
                              note, request_uuid, uploaded_by_uuid, uploaded_by_name, uploaded_by_role,
                              opened_by_studio_at, opened_by_company_at, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
    )
    .run(
      uuid,
      companyUuid,
      nome,
      estensione(nome),
      opzioni.mime,
      dati.byteLength,
      createHash('sha256').update(dati).digest('hex'),
      chiave,
      opzioni.categoria,
      opzioni.condiviso === false ? 0 : 1,
      opzioni.richiesta ?? null,
      opzioni.chi.uuid,
      opzioni.chi.name,
      opzioni.ruolo,
      opzioni.ruolo === 'consultant' ? opzioni.quando : (opzioni.apertoStudio ?? null),
      opzioni.ruolo === 'company' ? opzioni.quando : (opzioni.apertoAzienda ?? null),
      opzioni.quando,
      opzioni.quando
    )
  return uuid
}

function richiesta(
  companyUuid: string,
  r: {
    number: number
    kind: 'chiamata' | 'domanda' | 'documenti'
    origin: 'azienda' | 'studio'
    subject: string
    body: string | null
    status: string
    creatore: Chi
    assegnato?: Chi | null
    phone?: string | null
    preferred?: string | null
    due?: string | null
    creata: string
    vista?: string | null
    presa?: string | null
    chiusa?: string | null
    ultimo: string
    unreadStudio: 0 | 1
    unreadCompany: 0 | 1
    urgent?: 0 | 1
  }
): string {
  const uuid = newUuid()
  getDatabase()
    .prepare(
      `INSERT INTO requests (uuid, company_uuid, number, kind, origin, subject, body, status, urgent, phone,
                             preferred_time, callback_at, due_date, created_by_uuid, created_by_name, assigned_uuid,
                             assigned_name, seen_at, taken_at, closed_at, last_event_at, unread_studio, unread_company,
                             created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
    )
    .run(
      uuid,
      companyUuid,
      r.number,
      r.kind,
      r.origin,
      r.subject,
      r.body,
      r.status,
      r.urgent ?? 0,
      r.phone ?? null,
      r.preferred ?? null,
      r.due ?? null,
      r.creatore.uuid,
      r.creatore.name,
      r.assegnato?.uuid ?? null,
      r.assegnato?.name ?? null,
      r.vista ?? null,
      r.presa ?? null,
      r.chiusa ?? null,
      r.ultimo,
      r.unreadStudio,
      r.unreadCompany,
      r.creata,
      r.ultimo
    )
  return uuid
}

function evento(
  companyUuid: string,
  requestUuid: string,
  kind: string,
  chi: Chi,
  ruolo: 'consultant' | 'company',
  quando: string,
  extra: { status?: string; text?: string; document?: string } = {}
): void {
  getDatabase()
    .prepare(
      `INSERT INTO request_events (uuid, request_uuid, company_uuid, kind, status, text, document_uuid, author_uuid,
                                   author_name, author_role, created_at, updated_at, synced, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
    )
    .run(
      newUuid(),
      requestUuid,
      companyUuid,
      kind,
      extra.status ?? null,
      extra.text ?? null,
      extra.document ?? null,
      chi.uuid,
      chi.name,
      ruolo,
      quando,
      quando
    )
}

export async function seedDemoPortal(companyUuid: string, studio: Chi, azienda: Chi): Promise<void> {
  const company = getDatabase().prepare('SELECT code FROM companies WHERE uuid = ?').get(companyUuid) as
    | { code: string }
    | undefined
  if (!company) return
  const code = company.code
  const anno = new Date().getFullYear()

  // --- file dello studio, condivisi con l'azienda ---
  await documento(
    companyUuid,
    code,
    `Bilancio ${anno - 1} - sintesi.pdf`,
    pdf(`Pizzeria DaProd S.r.l. — bilancio ${anno - 1} in sintesi`, [
      `Ricavi: 1.012.400 € (+6,8% sull’anno prima)`,
      'Margine di contribuzione: 61,2% dei ricavi',
      'EBITDA: 148.900 € — 14,7% dei ricavi',
      'Utile netto: 63.700 €',
      '',
      'Food cost medio: 29,4% (obiettivo 30%)',
      'Costo del personale: 33,1% dei ricavi',
      '',
      'Punti di attenzione:',
      '- incassi con carte a 2 giorni: la cassa di fine mese è più tesa di quanto sembri;',
      '- mutuo del forno: rata in linea con i flussi, DSCR 1,9x.',
      '',
      'Documento dimostrativo: i numeri sono di esempio.'
    ]),
    { categoria: 'Report e analisi', chi: studio, ruolo: 'consultant', quando: fa(12), mime: 'application/pdf', apertoAzienda: fa(11) }
  )
  const budget = mesi(anno).map((m, i) => {
    const stagione = [0.8, 0.85, 0.95, 1, 1.05, 1.15, 1.25, 1.2, 1.05, 0.95, 0.85, 1.1][i]
    const ricavi = Math.round(84000 * stagione)
    const foodCost = Math.round(ricavi * 0.295)
    const personale = 27500
    return [m, ricavi, foodCost, personale, ricavi - foodCost - personale - 9800] as (string | number)[]
  })
  await documento(
    companyUuid,
    code,
    `Budget ${anno}.xlsx`,
    xlsx([
      {
        nome: 'Budget',
        righe: [['Mese', 'Ricavi', 'Food cost', 'Personale', 'Margine dopo costi fissi'], ...budget],
        larghezze: [14, 14, 14, 14, 24]
      },
      {
        nome: 'Ipotesi',
        righe: [
          ['Ipotesi del budget', null],
          ['Coperti medi al giorno', 180],
          ['Scontrino medio', 21.5],
          ['Food cost obiettivo', '29,5%'],
          ['Costi fissi mensili (affitto, utenze, leasing)', 9800]
        ],
        larghezze: [44, 14]
      }
    ]),
    {
      categoria: 'Report e analisi',
      chi: studio,
      ruolo: 'consultant',
      quando: fa(9),
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  )
  await documento(
    companyUuid,
    code,
    'Verbale incontro di settembre.docx',
    docx('Incontro con la Pizzeria DaProd', [
      'Presenti: Camillo (studio) e i titolari.',
      'Abbiamo guardato insieme la cassa dei prossimi tre mesi: novembre è il mese più stretto, per via degli acconti di imposta e della tredicesima.',
      'Decisioni: si rinegozia il fido di cassa con la banca prima di ottobre; si ricontrolla il food cost delle pizze speciali, che è salito al 34%.',
      'Prossimo incontro: fra un mese, con il consuntivo di settembre.',
      'Documento dimostrativo.'
    ]),
    {
      categoria: 'Documenti contabili',
      chi: studio,
      ruolo: 'consultant',
      quando: fa(5),
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
  )
  await documento(
    companyUuid,
    code,
    'Presentazione per la banca.pptx',
    pptx([
      { titolo: 'Pizzeria DaProd S.r.l.', punti: ['Richiesta di rinnovo del fido di cassa', `Situazione a ${new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`] },
      { titolo: 'I numeri', punti: ['Ricavi in crescita del 6,8%', 'EBITDA al 14,7% dei ricavi', 'Mutuo del forno regolarmente pagato'] },
      { titolo: 'La richiesta', punti: ['Fido di cassa da 30.000 a 45.000 €', 'Serve a coprire la stagionalità di novembre e febbraio'] }
    ]),
    {
      categoria: 'Report e analisi',
      chi: studio,
      ruolo: 'consultant',
      quando: fa(2),
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    }
  )
  // Un file che lo studio tiene per sé: l'azienda non lo vede.
  await documento(
    companyUuid,
    code,
    'Note interne dello studio.docx',
    docx('Note interne — Pizzeria DaProd', [
      'Da proporre: passaggio del POS a una convenzione con accredito il giorno dopo.',
      'Verificare con il titolare la possibilità di un secondo punto vendita nel 2027.'
    ]),
    {
      categoria: 'Altro',
      chi: studio,
      ruolo: 'consultant',
      condiviso: false,
      quando: fa(4),
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
  )

  // --- 1: documenti mandati dall'azienda, risolta ---
  const r1 = richiesta(companyUuid, {
    number: 1,
    kind: 'documenti',
    origin: 'azienda',
    subject: 'Estratto conto di luglio',
    body: 'Vi mando l’estratto conto di luglio della banca principale.',
    status: 'risolta',
    creatore: azienda,
    assegnato: studio,
    creata: fa(20),
    vista: fa(20, -2),
    presa: fa(20, -3),
    chiusa: fa(19),
    ultimo: fa(19),
    unreadStudio: 0,
    unreadCompany: 0
  })
  evento(companyUuid, r1, 'creata', azienda, 'company', fa(20), { status: 'inviata', text: 'Vi mando l’estratto conto di luglio della banca principale.' })
  const estratto = await documento(
    companyUuid,
    code,
    'Estratto conto luglio.pdf',
    pdf('Estratto conto — luglio', ['Saldo iniziale: 118.450,20 €', 'Entrate: 96.310,00 €', 'Uscite: 88.742,35 €', 'Saldo finale: 126.017,85 €', '', 'Documento dimostrativo.']),
    { categoria: 'Banca', chi: azienda, ruolo: 'company', richiesta: r1, quando: fa(20), apertoStudio: fa(20, -2), mime: 'application/pdf' }
  )
  evento(companyUuid, r1, 'documento', azienda, 'company', fa(20), { text: 'Ha allegato «Estratto conto luglio.pdf».', document: estratto })
  evento(companyUuid, r1, 'vista', studio, 'consultant', fa(20, -2), { status: 'vista' })
  evento(companyUuid, r1, 'documento', studio, 'consultant', fa(20, -2), { text: `${studio.name} ha aperto «Estratto conto luglio.pdf».`, document: estratto })
  evento(companyUuid, r1, 'messaggio', studio, 'consultant', fa(19), { text: 'Ricevuto, grazie: è tutto a posto, lo abbiamo già registrato.' })
  evento(companyUuid, r1, 'stato', studio, 'consultant', fa(19), { status: 'risolta' })

  // --- 2: una domanda presa in carico ---
  const r2 = richiesta(companyUuid, {
    number: 2,
    kind: 'domanda',
    origin: 'azienda',
    subject: 'Il forno nuovo si può dedurre tutto?',
    body: 'Vorremmo cambiare il forno a legna entro fine anno (circa 18.000 €). Quanto ci fa risparmiare di tasse?',
    status: 'in_carico',
    creatore: azienda,
    assegnato: studio,
    creata: fa(3),
    vista: fa(3, -1),
    presa: fa(3, -1),
    ultimo: fa(2),
    unreadStudio: 0,
    unreadCompany: 1
  })
  evento(companyUuid, r2, 'creata', azienda, 'company', fa(3), {
    status: 'inviata',
    text: 'Vorremmo cambiare il forno a legna entro fine anno (circa 18.000 €). Quanto ci fa risparmiare di tasse?'
  })
  evento(companyUuid, r2, 'vista', studio, 'consultant', fa(3, -1), { status: 'vista' })
  evento(companyUuid, r2, 'stato', studio, 'consultant', fa(3, -1), { status: 'in_carico', text: `Se ne occupa ${studio.name}.` })
  evento(companyUuid, r2, 'messaggio', studio, 'consultant', fa(2), {
    text: 'Buona idea farlo entro dicembre. Ti preparo una simulazione con ammortamento e credito d’imposta, te la mando entro venerdì.'
  })

  // --- 3: lo studio aspetta dei documenti ---
  const scadenza = new Date(ORA() + 5 * 86_400_000).toISOString().slice(0, 10)
  const r3 = richiesta(companyUuid, {
    number: 3,
    kind: 'documenti',
    origin: 'studio',
    subject: 'Fatture dei fornitori di agosto',
    body: 'Ci mancano le fatture di agosto del caseificio e della farina: le carichi qui?',
    status: 'in_attesa',
    creatore: studio,
    assegnato: studio,
    due: scadenza,
    creata: fa(1),
    ultimo: fa(1),
    unreadStudio: 0,
    unreadCompany: 1
  })
  evento(companyUuid, r3, 'creata', studio, 'consultant', fa(1), {
    status: 'in_attesa',
    text: 'Ci mancano le fatture di agosto del caseificio e della farina: le carichi qui?'
  })

  // --- 4: una chiamata appena chiesta ---
  const r4 = richiesta(companyUuid, {
    number: 4,
    kind: 'chiamata',
    origin: 'azienda',
    subject: 'Dubbio sull’F24 di settembre',
    body: 'Nel modello F24 c’è un codice tributo che non capisco. Cinque minuti al telefono?',
    status: 'inviata',
    creatore: azienda,
    phone: '081 555 1234',
    preferred: 'oggi_pomeriggio',
    creata: fa(0, 0.05),
    ultimo: fa(0, 0.05),
    unreadStudio: 1,
    unreadCompany: 0
  })
  evento(companyUuid, r4, 'creata', azienda, 'company', fa(0, 0.05), {
    status: 'inviata',
    text: 'Nel modello F24 c’è un codice tributo che non capisco. Cinque minuti al telefono?'
  })
}
