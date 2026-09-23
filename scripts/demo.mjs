/**
 * Avvia la build compilata (`out/`) fuori pacchetto, quindi con il seed
 * dimostrativo attivo (account `cammo` e `Pizzeria DaProd`, password `1234`).
 *
 * Serve a provare l'app compilata senza passare dal wizard di primo avvio.
 * Il seed si accende perché l'app non è impacchettata, non per una variabile
 * d'ambiente: un eseguibile vero non lo accende mai (vedi db/seed.ts).
 */
import { spawn } from 'node:child_process'
import electron from 'electron'

spawn(electron, ['.'], {
  stdio: 'inherit'
}).on('exit', (code) => process.exit(code ?? 0))
