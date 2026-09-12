/**
 * Avvia la build di produzione con il seed dimostrativo attivo
 * (account `cammo` e `Pizzeria DaProd`, password `1234`).
 *
 * In `npm run dev` il seed è già attivo di suo: questo script serve solo per
 * provare l'app compilata senza passare dal wizard di primo avvio.
 */
import { spawn } from 'node:child_process'
import electron from 'electron'

spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, DAPROD_DEMO: '1' }
}).on('exit', (code) => process.exit(code ?? 0))
