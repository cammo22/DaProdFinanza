/**
 * Vocabolari di riferimento condivisi tra main e renderer.
 * Fonte: docs/MODELLO_FINANZIARIO.md §8 (foglio DICTIONARY del file del consulente)
 * e AGENTS.md §1-bis / §4.
 *
 * Convenzione DaProd: identificatori in inglese, etichette UI in italiano.
 */

/** Ruoli utente — AGENTS.md §4. */
export const ROLES = ['consultant', 'company'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  consultant: 'Consulente',
  company: 'Azienda'
}

/** Forme giuridiche — MODELLO_FINANZIARIO.md §8. Guidano il regime fiscale (AGENTS.md §11.6). */
export const LEGAL_FORMS = [
  'SPA',
  'SRL',
  'SAPA',
  'SCPA',
  'SNC',
  'SAS',
  'SS',
  'Società consortile',
  'Società cooperativa',
  'Ditta individuale',
  'Istituzione',
  'Fondazione',
  'Da costituire',
  'Altro'
] as const
export type LegalForm = (typeof LEGAL_FORMS)[number]

/**
 * Tipo di attività (modello di business) — AGENTS.md §1-bis.
 * In Fase 3 precompilerà le % di costo diretto/indiretto per sezione
 * (MODELLO_FINANZIARIO.md §7). Qui è solo anagrafica.
 */
export const BUSINESS_TYPES = [
  'Produzione/Manifattura',
  'Commercio',
  'Servizi',
  'Ristorazione',
  'Edilizia',
  'Studio professionale',
  'Altro'
] as const
export type BusinessType = (typeof BUSINESS_TYPES)[number]
