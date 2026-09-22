/**
 * Impostazioni — AGENTS.md §10.12 (versione 1.3.0).
 *
 * Tre livelli, tutti nel database (tabella `settings`, migrazione 008) e non nel
 * browser: così valgono per chiunque entri da questo computer e un giorno
 * viaggeranno con la sincronizzazione (Fase 8).
 *
 * - **del programma**: valgono per tutta l'installazione (moduli, backup, aggiornamenti);
 * - **dell'utente**: le preferenze di chi è entrato (tema, avvisi);
 * - **dell'azienda**: cosa vede e cosa può fare l'operatore Azienda (§4). I
 *   consulenti sono gli amministratori; un'azienda vede solo quello che le serve.
 *
 * Qui stanno i predefiniti e la normalizzazione: un valore mancante o sbagliato
 * torna al predefinito invece di rompere una schermata. Aggiungere
 * un'impostazione vuol dire aggiungerla qui: i database già esistenti la
 * ricevono col suo predefinito, senza migrazioni.
 */

// --- moduli -----------------------------------------------------------------

/** Moduli che il consulente può togliere dal menu, se non gli servono. */
export const MODULI = [
  'documenti',
  'richieste',
  'personale',
  'fiscale',
  'marginalita',
  'simulazioni',
  'attivita'
] as const
export type Modulo = (typeof MODULI)[number]

export const MODULO_INFO: Record<Modulo, { label: string; descrizione: string }> = {
  documenti: {
    label: 'Documenti',
    descrizione: 'Il cassetto dei file di ogni azienda: si caricano e si aprono al volo.'
  },
  richieste: {
    label: 'Richieste e chiamate',
    descrizione: 'Le aziende chiedono una chiamata o mandano una domanda; lo studio risponde.'
  },
  personale: {
    label: 'Personale',
    descrizione: 'Dipendenti, costo aziendale e costo orario.'
  },
  fiscale: {
    label: 'Area fiscale e contributi',
    descrizione: 'Stima di imposte e contributi, acconti e scadenze.'
  },
  marginalita: {
    label: 'Marginalità',
    descrizione: 'Food cost, costo per commessa, margine per prodotto: secondo il tipo di attività.'
  },
  simulazioni: {
    label: 'Analisi & Simulazioni',
    descrizione: 'Il "cosa succede se": leve, scenari e confronto.'
  },
  attivita: {
    label: 'Attività e Tempi',
    descrizione: 'Bacheca, timer e ore dello studio su ogni azienda.'
  }
}

// --- viste che si possono condividere con l'azienda -------------------------

export const VISTE_CONDIVISIBILI = [
  'panoramica',
  'conto-economico',
  'stato-patrimoniale',
  'capitale-circolante',
  'tesoreria',
  'banche',
  'simulazioni',
  'personale',
  'fiscale',
  'marginalita'
] as const
export type VistaCondivisibile = (typeof VISTE_CONDIVISIBILI)[number]

export const VISTA_LABELS: Record<VistaCondivisibile, string> = {
  panoramica: 'Panoramica',
  'conto-economico': 'Conto Economico',
  'stato-patrimoniale': 'Stato Patrimoniale',
  'capitale-circolante': 'Capitale Circolante',
  tesoreria: 'Tesoreria / Cash Flow',
  banche: 'Banche e Finanziamenti',
  simulazioni: 'Analisi & Simulazioni',
  personale: 'Personale',
  fiscale: 'Area fiscale e contributi',
  marginalita: 'Marginalità'
}

/** Le viste che dipendono da un modulo: se il modulo è spento, non le vede nessuno. */
export const MODULO_DI_VISTA: Partial<Record<VistaCondivisibile, Modulo>> = {
  simulazioni: 'simulazioni',
  personale: 'personale',
  fiscale: 'fiscale',
  marginalita: 'marginalita'
}

/**
 * Di partenza l'azienda vede quello che serve a un titolare — i numeri
 * principali, la cassa, le tasse da mettere da parte e i margini — e non tutto
 * il gestionale. Il resto lo accende il consulente, azienda per azienda.
 */
export const VISTE_AZIENDA_PREDEFINITE: Record<VistaCondivisibile, boolean> = {
  panoramica: true,
  'conto-economico': true,
  'stato-patrimoniale': false,
  'capitale-circolante': false,
  tesoreria: true,
  banche: false,
  simulazioni: false,
  personale: false,
  fiscale: true,
  marginalita: true
}

// --- tipi ---------------------------------------------------------------------

export type Tema = 'scuro' | 'chiaro' | 'sistema'

export interface AppSettings {
  moduli: Record<Modulo, boolean>
  /** Controllo degli aggiornamenti all'avvio e ogni 6 ore. */
  aggiornamentiAutomatici: boolean
  /** Una copia del database al giorno, al primo avvio della giornata. */
  backupAutomatico: boolean
  /** Quante copie automatiche tenere: le più vecchie si cancellano. */
  backupDaTenere: number
  /** Come lo studio si presenta alle aziende ("Il tuo consulente"). */
  studio: { nome: string; telefono: string; email: string }
}

export interface UserSettings {
  tema: Tema
  /** Avviso di sistema quando arriva una richiesta o una risposta. */
  avvisiDesktop: boolean
  /** Squillo quando un'azienda chiede una chiamata. */
  suonoChiamate: boolean
}

export interface PortalSettings {
  viste: Record<VistaCondivisibile, boolean>
  inviareDocumenti: boolean
  richiedereChiamate: boolean
  scrivereMessaggi: boolean
}

// --- predefiniti --------------------------------------------------------------

export const BACKUP_MIN = 3
export const BACKUP_MAX = 60

export function appPredefinite(): AppSettings {
  return {
    moduli: Object.fromEntries(MODULI.map((m) => [m, true])) as Record<Modulo, boolean>,
    aggiornamentiAutomatici: true,
    backupAutomatico: true,
    backupDaTenere: 14,
    studio: { nome: '', telefono: '', email: '' }
  }
}

export function utentePredefinite(): UserSettings {
  return { tema: 'scuro', avvisiDesktop: true, suonoChiamate: true }
}

export function portalePredefinito(): PortalSettings {
  return {
    viste: { ...VISTE_AZIENDA_PREDEFINITE },
    inviareDocumenti: true,
    richiedereChiamate: true,
    scrivereMessaggi: true
  }
}

// --- normalizzazione ----------------------------------------------------------

const oggetto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

const booleano = (v: unknown, base: boolean): boolean => (typeof v === 'boolean' ? v : base)

const testo = (v: unknown, base: string, max = 120): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : base

function mappaBooleani<K extends string>(
  chiavi: readonly K[],
  v: unknown,
  base: Record<K, boolean>
): Record<K, boolean> {
  const o = oggetto(v)
  return Object.fromEntries(chiavi.map((k) => [k, booleano(o[k], base[k])])) as Record<K, boolean>
}

/**
 * Da un valore qualsiasi (letto dal database o arrivato da una richiesta) alle
 * impostazioni complete. `base` sono le impostazioni correnti: una modifica
 * parziale tocca solo quello che contiene.
 */
export function normalizzaApp(v: unknown, base: AppSettings = appPredefinite()): AppSettings {
  const o = oggetto(v)
  const studio = oggetto(o.studio)
  const tenere = Number(o.backupDaTenere)
  return {
    moduli: mappaBooleani(MODULI, o.moduli, base.moduli),
    aggiornamentiAutomatici: booleano(o.aggiornamentiAutomatici, base.aggiornamentiAutomatici),
    backupAutomatico: booleano(o.backupAutomatico, base.backupAutomatico),
    backupDaTenere: Number.isInteger(tenere)
      ? Math.min(BACKUP_MAX, Math.max(BACKUP_MIN, tenere))
      : base.backupDaTenere,
    studio: {
      nome: testo(studio.nome, base.studio.nome),
      telefono: testo(studio.telefono, base.studio.telefono, 40),
      email: testo(studio.email, base.studio.email)
    }
  }
}

export function normalizzaUtente(v: unknown, base: UserSettings = utentePredefinite()): UserSettings {
  const o = oggetto(v)
  const tema = o.tema === 'scuro' || o.tema === 'chiaro' || o.tema === 'sistema' ? o.tema : base.tema
  return {
    tema,
    avvisiDesktop: booleano(o.avvisiDesktop, base.avvisiDesktop),
    suonoChiamate: booleano(o.suonoChiamate, base.suonoChiamate)
  }
}

export function normalizzaPortale(v: unknown, base: PortalSettings = portalePredefinito()): PortalSettings {
  const o = oggetto(v)
  return {
    viste: mappaBooleani(VISTE_CONDIVISIBILI, o.viste, base.viste),
    inviareDocumenti: booleano(o.inviareDocumenti, base.inviareDocumenti),
    richiedereChiamate: booleano(o.richiedereChiamate, base.richiedereChiamate),
    scrivereMessaggi: booleano(o.scrivereMessaggi, base.scrivereMessaggi)
  }
}

/**
 * Quello che l'operatore Azienda vede davvero: la vista accesa per lui **e** il
 * suo modulo acceso nel programma. Il consulente che spegne un modulo lo spegne
 * per tutti.
 */
export function visteAzienda(portale: PortalSettings, app: AppSettings): VistaCondivisibile[] {
  return VISTE_CONDIVISIBILI.filter((v) => {
    if (!portale.viste[v]) return false
    const modulo = MODULO_DI_VISTA[v]
    return modulo ? app.moduli[modulo] : true
  })
}

/** Cosa può fare l'operatore Azienda, tenendo conto dei moduli spenti. */
export function permessiAzienda(
  portale: PortalSettings,
  app: AppSettings
): { documenti: boolean; inviareDocumenti: boolean; richieste: boolean; richiedereChiamate: boolean; scrivereMessaggi: boolean } {
  return {
    documenti: app.moduli.documenti,
    inviareDocumenti: app.moduli.documenti && portale.inviareDocumenti,
    richieste: app.moduli.richieste,
    richiedereChiamate: app.moduli.richieste && portale.richiedereChiamate,
    scrivereMessaggi: app.moduli.richieste && portale.scrivereMessaggi
  }
}
