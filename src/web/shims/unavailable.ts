/**
 * File, cartelle ed Excel: nella versione Android non ci sono. I moduli del
 * backend che li importano (`node:fs`, `node:os`, `exceljs`…) si caricano lo
 * stesso, e se qualcosa prova a usarli riceve un errore chiaro.
 */
const MESSAGGIO = 'Non disponibile nella versione Android: usa il programma per computer.'

function nonDisponibile(): never {
  throw new Error(MESSAGGIO)
}

export const existsSync = (): boolean => false
export const mkdirSync = nonDisponibile
export const readFileSync = nonDisponibile
export const writeFileSync = nonDisponibile
export const copyFileSync = nonDisponibile
export const statSync = nonDisponibile
export const readdirSync = nonDisponibile
export const unlinkSync = nonDisponibile
export const renameSync = nonDisponibile
export const createWriteStream = nonDisponibile
export const createReadStream = nonDisponibile
export const copyFile = async (): Promise<never> => nonDisponibile()
export const writeFile = async (): Promise<never> => nonDisponibile()
export const readFile = async (): Promise<never> => nonDisponibile()
export const mkdir = async (): Promise<never> => nonDisponibile()
export const stat = async (): Promise<never> => nonDisponibile()
export const unlink = async (): Promise<never> => nonDisponibile()
export const homedir = (): string => '/'
export const tmpdir = (): string => '/'
export const platform = (): string => 'android'

export class Workbook {
  constructor() {
    nonDisponibile()
  }
}

export default { Workbook, existsSync, homedir, tmpdir, platform }
