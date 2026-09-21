/// <reference types="vite/client" />

/**
 * La versione per il browser di ExcelJS (visualizzatore dei fogli di calcolo,
 * §10.13): stessi tipi del pacchetto, file diverso. Il pacchetto "exceljs"
 * normale nella versione Android è sostituito (lo usa solo il backend per
 * import ed export), questo no.
 */
declare module 'exceljs/dist/exceljs.min.js' {
  import ExcelJS from 'exceljs'
  export default ExcelJS
}
