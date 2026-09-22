import type { Tema } from '@shared/settings'

/**
 * Tema dell'interfaccia: scuro (quello dei mockup), chiaro, o come il sistema.
 *
 * La scelta vera è una preferenza dell'utente nel database (§10.12); qui se ne
 * tiene una copia nel browser solo per colorare subito le schermate d'ingresso,
 * prima che si sappia chi entra. I colori sono variabili CSS (`index.css`): il
 * tema chiaro le ridefinisce, e i grafici le usano direttamente.
 */

const CHIAVE = 'daprodfinanza.tema'
const SISTEMA_CHIARO = '(prefers-color-scheme: light)'

let corrente: Tema = 'scuro'

function colora(): void {
  const chiaro =
    corrente === 'chiaro' || (corrente === 'sistema' && window.matchMedia(SISTEMA_CHIARO).matches)
  document.documentElement.dataset.theme = chiaro ? 'light' : 'dark'
}

export function applicaTema(tema: Tema): void {
  corrente = tema
  colora()
  try {
    localStorage.setItem(CHIAVE, tema)
  } catch {
    // resta per questa sessione
  }
}

/** All'avvio: il tema dell'ultima volta, e l'ascolto del sistema per "come il sistema". */
export function avviaTema(): void {
  let salvato: string | null = null
  try {
    salvato = localStorage.getItem(CHIAVE)
  } catch {
    // archivio non disponibile: resta lo scuro
  }
  corrente = salvato === 'chiaro' || salvato === 'sistema' ? salvato : 'scuro'
  colora()
  window.matchMedia(SISTEMA_CHIARO).addEventListener('change', () => {
    if (corrente === 'sistema') colora()
  })
}
