import { DEFAULT_SCHEME, incomeStatement } from '@shared/engine'
import type { DocumentItem, RequestItem } from '@shared/documents'
import { permessiAzienda, visteAzienda, type VistaCondivisibile } from '@shared/settings'
import { getDatabase } from '../../db'
import { engineAccounts, listPeriods } from './analysis.service'
import { getCompany } from './companies.service'
import { newForCompany } from './documents.service'
import { descriviStato, listRequests } from './requests.service'
import { getAppSettings, getPortalSettings } from './settings.service'
import { treasuryView } from './treasury.service'

/**
 * Il riepilogo dell'azienda — la prima pagina che vede chi entra con
 * l'accesso Azienda (AGENTS.md §10.15). In poche righe: chi è il suo
 * consulente, a che punto sono le sue richieste, i documenti nuovi e i numeri
 * che contano — solo quelli delle sezioni che il consulente le ha acceso.
 *
 * Lo calcola il server, non la schermata: così un numero di una sezione
 * spenta non parte nemmeno.
 */

export interface CompanySummary {
  company: { uuid: string; name: string; code: string; business_type: string | null }
  studio: { nome: string; telefono: string; email: string }
  consulenti: { name: string; phone: string | null; email: string | null }[]
  viste: VistaCondivisibile[]
  permessi: ReturnType<typeof permessiAzienda>
  liquidita: {
    oggi: number
    tra30: number
    soglia: number | null
    tensione: { date: string; days: number } | null
  } | null
  scadenze: { date: string; description: string; cents: number; direction: 'in' | 'out'; overdue: boolean }[] | null
  periodo: {
    label: string
    ricavi: number
    ebitda: number
    utile: number
    ytd: { label: string; ricavi: number; utile: number } | null
  } | null
  richieste: (RequestItem & { descrizione: string })[]
  documentiNuovi: DocumentItem[]
}

export function companySummary(companyUuid: string): CompanySummary {
  const company = getCompany(companyUuid)
  const app = getAppSettings()
  const portale = getPortalSettings(companyUuid)
  const viste = visteAzienda(portale, app)
  const permessi = permessiAzienda(portale, app)
  const vede = (...v: VistaCondivisibile[]): boolean => v.some((x) => viste.includes(x))

  let liquidita: CompanySummary['liquidita'] = null
  let scadenze: CompanySummary['scadenze'] = null
  if (vede('tesoreria', 'panoramica')) {
    const t = treasuryView(companyUuid)
    const trenta = t.horizons.find((h) => h.days === 30)
    liquidita = {
      oggi: t.liquiditaOggi,
      tra30: trenta?.liquiditaFinale ?? t.liquiditaOggi,
      soglia: t.sogliaMinima,
      tensione: t.tensione ? { date: t.tensione.date, days: t.tensione.days } : null
    }
    if (vede('tesoreria')) {
      scadenze = [...t.flows]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 6)
        .map((f) => ({ date: f.date, description: f.description, cents: f.cents, direction: f.direction, overdue: f.overdue }))
    }
  }

  let periodo: CompanySummary['periodo'] = null
  if (vede('panoramica', 'conto-economico')) {
    const periodi = listPeriods(companyUuid).filter((p) => p.scenarios?.includes('actual'))
    const ultimo = periodi.find((p) => p.period_type === 'month') ?? periodi[0]
    if (ultimo) {
      const a = incomeStatement(engineAccounts(companyUuid, ultimo.uuid, 'actual'), DEFAULT_SCHEME).aggregates
      let ytd: NonNullable<CompanySummary['periodo']>['ytd'] = null
      if (ultimo.month !== null) {
        const mesi = periodi.filter((p) => p.period_type === 'month' && p.year === ultimo.year && (p.month ?? 0) <= ultimo.month!)
        const conti = mesi.flatMap((p) => engineAccounts(companyUuid, p.uuid, 'actual'))
        if (conti.length) {
          const y = incomeStatement(conti, DEFAULT_SCHEME).aggregates
          ytd = { label: `Da gennaio ${ultimo.year}`, ricavi: y.ricaviNetti, utile: y.utile }
        }
      }
      periodo = { label: ultimo.label, ricavi: a.ricaviNetti, ebitda: a.ebitda, utile: a.utile, ytd }
    }
  }

  const consulenti = getDatabase()
    .prepare(
      `SELECT full_name AS name, phone, email FROM users
        WHERE role = 'consultant' AND active = 1 AND deleted = 0 ORDER BY full_name COLLATE NOCASE`
    )
    .all() as CompanySummary['consulenti']

  return {
    company: { uuid: company.uuid, name: company.name, code: company.code, business_type: company.business_type },
    studio: app.studio,
    consulenti,
    viste,
    permessi,
    liquidita,
    scadenze,
    periodo,
    richieste: permessi.richieste
      ? listRequests(companyUuid)
          .slice(0, 6)
          .map((r) => ({ ...r, descrizione: descriviStato(r) }))
      : [],
    documentiNuovi: permessi.documenti ? newForCompany(companyUuid) : []
  }
}
