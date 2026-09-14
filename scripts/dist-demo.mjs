/**
 * Costruisce la versione dimostrativa portable (vedi electron-builder.demo.yml).
 *
 *   npm run dist:demo
 *
 * Accende il flag __DEMO_BUILD__ solo per questa build, e alla fine ricompila
 * `out/` senza flag: così un `npx electron .` lanciato dopo non parte per
 * sbaglio in modalità demo.
 */
import { spawnSync } from 'node:child_process'

const demo = { ...process.env, DAPROD_DEMO_BUILD: '1' }
const normale = { ...process.env }
delete normale.DAPROD_DEMO_BUILD

function esegui(comando, env) {
  console.log(`\n> ${comando}`)
  const esito = spawnSync(comando, { stdio: 'inherit', shell: true, env })
  if (esito.status !== 0) process.exit(esito.status ?? 1)
}

esegui('npm run typecheck', normale)
esegui('npm run test', normale)
esegui('npx electron-vite build', demo)
// `portable` esplicito: con `extends` electron-builder somma i target della
// configurazione base, e produrrebbe anche un installer demo che non serve.
esegui('npx electron-builder --win portable --config electron-builder.demo.yml', demo)
esegui('npx electron-vite build', normale)

console.log('\nVersione demo pronta in release/demo/')
