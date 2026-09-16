import type { BusinessType, LegalForm, Role } from './enums'

/**
 * Campi comuni a ogni record sincronizzabile — AGENTS.md §6.
 * `synced` e `deleted` non sono ancora usati (il sync arriva in Fase 8)
 * ma lo schema li prevede fin dall'inizio per non migrare dopo.
 */
export interface BaseRecord {
  uuid: string
  created_at: string
  updated_at: string
  synced: 0 | 1
  deleted: 0 | 1
}

export interface User extends BaseRecord {
  username: string
  full_name: string
  role: Role
  /** Valorizzato solo per il ruolo `company`: l'unica azienda che può vedere (§4). */
  company_uuid: string | null
  active: 0 | 1
  last_login: string | null
}

/** Cliente dello studio: può possedere più Aziende — AGENTS.md §1-bis. */
export interface Client extends BaseRecord {
  /** Codice leggibile progressivo, es. `CLI-0001` — AGENTS.md §5. */
  code: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  notes: string | null
  start_date: string | null
  archived: 0 | 1
}

/** Azienda: la singola società/P.IVA analizzata — AGENTS.md §1-bis. */
export interface Company extends BaseRecord {
  client_uuid: string
  /** Codice leggibile, es. `CLI-0001-AZ-01` — AGENTS.md §5. */
  code: string
  name: string
  /** Chiave naturale consigliata (AGENTS.md §5): univoca quando presente. */
  vat_number: string | null
  tax_code: string | null
  legal_form: LegalForm | null
  business_type: BusinessType | null
  start_date: string | null
  notes: string | null
  archived: 0 | 1
}

/** Cliente con le sue aziende — payload dell'anagrafica (§10.1). */
export interface ClientWithCompanies extends Client {
  companies: Company[]
}

export interface SessionUser {
  uuid: string
  username: string
  full_name: string
  role: Role
  company_uuid: string | null
}

export interface LoginResponse {
  token: string
  user: SessionUser
}

/** Credenziali del seed dimostrativo, mostrate sulle card di scelta ruolo. */
export interface DemoCredential {
  role: Role
  username: string
  password: string
}

export interface SetupState {
  /** false finché non esiste alcun utente: il primo avvio crea il Consulente. */
  configured: boolean
  version: string
  /** Valorizzato solo nelle build di sviluppo con il seed attivo. */
  demo: DemoCredential[] | null
}

/** Stato mostrato nella status bar — AGENTS.md §7. */
export interface HealthState {
  database: 'ok' | 'error'
  server: 'ok' | 'error'
  /** Il trasporto di rete arriva in Fase 8: per ora sempre 'not-configured'. */
  tailscale: 'active' | 'fallback' | 'not-configured'
  last_sync: string | null
  version: string
}

export interface ApiError {
  error: string
}

// --- Payload di creazione -------------------------------------------------

export interface CreateClientInput {
  name: string
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  notes?: string | null
  start_date?: string | null
}

export interface CreateCompanyInput {
  client_uuid: string
  name: string
  vat_number?: string | null
  tax_code?: string | null
  legal_form?: LegalForm | null
  business_type?: BusinessType | null
  start_date?: string | null
  notes?: string | null
}

// --- Motore finanziario (Fase 2) ------------------------------------------
// Schema dati di docs/MODELLO_FINANZIARIO.md §1-§2. Le formule che lo usano
// arrivano in Fase 3.

/** §1 — i cinque TIPI di conto del piano dei conti. */
export type AccountType =
  | 'RICAVO'
  | 'COSTO'
  | "ATTIVITA'"
  | "ATTIVITA' NEGATIVO"
  | "PASSIVITA'"

/** Prospetto di destinazione: conto economico o stato patrimoniale. */
export type Statement = 'CE' | 'SP'

/** §2.2 — un costo è variabile o fisso. */
export type CostBehaviour = 'Costi Variabili' | 'Costi Fissi'

/** §3.4 — le tre viste del file del consulente. */
export type Scenario = 'actual' | 'budget' | 'forecast'

/**
 * Sezione del piano dei conti (§2): scegliere la sezione di un conto determina
 * automaticamente i suoi tag, e quindi dove finisce nel bilancio riclassificato.
 * Dato di riferimento comune a tutte le aziende, non configurazione per cliente.
 */
export interface AccountSection {
  code: string
  label: string
  statement: Statement
  account_type: AccountType
  cost_behaviour: CostBehaviour | null
  /** §2.2 — punto di partenza, sovrascrivibile per azienda e per conto. */
  default_direct_cost_pct: number | null
  sort_order: number
  /** Tag applicati a ogni conto della sezione. */
  tags: string[]
  /** Alternative fra cui il singolo conto ne sceglie una (le voci "/" di §2.3-§2.4). */
  detail_tags: string[]
}

/** Riga del piano dei conti di una singola azienda. */
export interface Account extends BaseRecord {
  company_uuid: string
  code: string
  name: string
  section_code: string
  account_type: AccountType
  detail_tag: string | null
  /** NULL = eredita l'impostazione dell'azienda, e a sua volta il default di sezione. */
  direct_cost_pct: number | null
  active: 0 | 1
  notes: string | null
}

/** §2.2 / §7 — % di costo diretto di una sezione per una specifica azienda. */
export interface CompanySectionSetting extends BaseRecord {
  company_uuid: string
  section_code: string
  direct_cost_pct: number
}

/** §1 — periodo contabile: l'anno, oppure un mese dell'anno. */
export interface FiscalPeriod extends BaseRecord {
  company_uuid: string
  period_type: 'year' | 'month'
  year: number
  month: number | null
  label: string
  /** Un periodo chiuso non viene più sovrascritto da un import (§6). */
  closed: 0 | 1
  /** Scenari che hanno saldi in questo periodo. Presente solo nell'elenco dei periodi. */
  scenarios?: Scenario[]
}

/**
 * Saldo di un conto in un periodo.
 *
 * ⚠️ `amount_cents` è un intero in centesimi, non euro: sommare centinaia di
 * righe in virgola mobile può far sfalsare di 0,01 e "non far quadrare" attivo
 * e passivo. La conversione avviene al bordo (import, UI, export).
 */
export interface AccountBalance extends BaseRecord {
  company_uuid: string
  account_uuid: string
  period_uuid: string
  scenario: Scenario
  amount_cents: number
  import_document_uuid: string | null
}

/** §5 / §12 — file importato, conservato per tracciabilità e anti-doppione. */
export interface ImportDocument extends BaseRecord {
  company_uuid: string
  kind: string
  filename: string
  sha256: string
  stored_path: string | null
  row_count: number | null
  notes: string | null
  imported_at: string
}

// --- Tesoreria (Fase 5) ---------------------------------------------------

/** Movimento atteso: scadenza dello scadenziario o previsione manuale (§10.6). */
export interface TreasuryItem extends BaseRecord {
  company_uuid: string
  direction: 'in' | 'out'
  source: 'scadenziario' | 'manuale' | 'finanziamento'
  category: string
  description: string
  counterparty: string | null
  document_ref: string | null
  document_date: string | null
  payment_terms: 'RD' | 'DF' | 'FM' | null
  payment_days: number | null
  payment_method: string | null
  due_date: string
  amount_cents: number
  paid_cents: number
  paid_date: string | null
  recurrence: 'none' | 'monthly'
  recurrence_until: string | null
  notes: string | null
}

export type TreasuryItemInput = Partial<
  Omit<TreasuryItem, keyof BaseRecord | 'company_uuid'>
>

export interface TreasurySettings {
  min_liquidity_cents: number | null
  opening_cash_cents: number | null
  opening_cash_date: string | null
}

// --- Banche e finanziamenti (Fase 6) --------------------------------------

export interface Bank extends BaseRecord {
  company_uuid: string
  name: string
  branch: string | null
  contact: string | null
  notes: string | null
}

export interface CreditLine extends BaseRecord {
  company_uuid: string
  bank_uuid: string
  kind: 'fido_cassa' | 'anticipo_fatture' | 'carta' | 'altro'
  label: string
  granted_cents: number
  used_cents: number
  used_as_of: string | null
  annual_rate_percent: number | null
  expiry_date: string | null
  notes: string | null
}

export interface Loan extends BaseRecord {
  company_uuid: string
  bank_uuid: string
  kind: 'mutuo' | 'finanziamento' | 'leasing'
  label: string
  principal_cents: number
  annual_rate_percent: number
  first_due_date: string
  installments: number
  frequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual'
  grace_installments: number
  amortization: 'francese' | 'italiano'
  balloon_cents: number
  notes: string | null
}

// --- Simulazioni (Fase 7) -------------------------------------------------

export interface SimulationScenario extends BaseRecord {
  company_uuid: string
  name: string
  /** JSON di `SimulationParams`: i risultati si ricalcolano sempre. */
  params: string
  notes: string | null
}
