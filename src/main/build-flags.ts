import { app } from 'electron'
import { join } from 'node:path'

/**
 * Bandiere decise al momento della build, non a runtime.
 *
 * `__DEMO_BUILD__` viene sostituita da electron-vite: nella build normale vale
 * `false`, e il codice che dipende solo da lei sparisce dal pacchetto. Solo
 * `npm run dist:demo` la accende.
 */
export const DEMO_BUILD: boolean = __DEMO_BUILD__

/**
 * La demo non deve mai toccare i dati di un'installazione vera sulla stessa
 * macchina: database, chiave di cifratura e cartelle di lavoro stanno altrove.
 *
 * Questo modulo è il primo import di `index.ts`, così la cartella è già
 * spostata prima che chiunque legga `userData`.
 *
 * Un `--user-data-dir` esplicito vince: è lo switch standard di Chromium, e
 * serve a provare un primo avvio da zero in una cartella usa e getta senza
 * toccare la demo già presente.
 */
if (DEMO_BUILD && !app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', join(app.getPath('appData'), 'DaProdFinanza Demo'))
}
