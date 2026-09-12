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
