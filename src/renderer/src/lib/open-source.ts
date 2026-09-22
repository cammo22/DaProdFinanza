/**
 * I progetti open source dentro il programma, mostrati in Impostazioni ›
 * Informazioni. Le licenze permissive (MIT, Apache, BSD, MPL) chiedono di
 * citare gli autori: questo elenco lo fa. Aggiungendo una libreria che finisce
 * nel pacchetto, va aggiunta anche qui.
 *
 * ⚠ Niente codice AGPL/GPL nel pacchetto: renderebbe AGPL tutto DaProdFinanza
 * (per questo di Ever Teams ed Ever Gauzy si sono prese solo idee).
 */
export const CREDITI_OPEN_SOURCE: { nome: string; aCosaServe: string; licenza: string }[] = [
  { nome: 'PDF.js (Mozilla)', aCosaServe: 'apre i PDF', licenza: 'Apache-2.0' },
  { nome: 'ExcelJS', aCosaServe: 'apre i fogli Excel, importa ed esporta', licenza: 'MIT' },
  { nome: 'docx-preview', aCosaServe: 'apre i documenti Word', licenza: 'Apache-2.0' },
  { nome: 'JSZip', aCosaServe: 'legge i file di Office (usato da docx-preview)', licenza: 'MIT' },
  { nome: 'pptx-glimpse', aCosaServe: 'apre le presentazioni PowerPoint', licenza: 'MIT' },
  { nome: 'opentype.js', aCosaServe: 'disegna i caratteri delle presentazioni', licenza: 'MIT' },
  { nome: 'Carlito e Arimo (Fontsource)', aCosaServe: 'caratteri compatibili con Calibri e Arial', licenza: 'SIL OFL 1.1' },
  { nome: 'Electron', aCosaServe: 'il programma per computer', licenza: 'MIT' },
  { nome: 'React', aCosaServe: "l'interfaccia", licenza: 'MIT' },
  { nome: 'Recharts', aCosaServe: 'i grafici', licenza: 'MIT' },
  { nome: 'Tailwind CSS', aCosaServe: 'la grafica', licenza: 'MIT' },
  { nome: 'Express', aCosaServe: 'il servizio interno', licenza: 'MIT' },
  { nome: 'better-sqlite3-multiple-ciphers', aCosaServe: 'il database cifrato', licenza: 'MIT' },
  { nome: 'sql.js', aCosaServe: 'il database della versione Android', licenza: 'MIT' },
  { nome: 'Capacitor', aCosaServe: 'la versione Android', licenza: 'MIT' }
]
