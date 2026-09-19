/**
 * Moduli piccoli che il backend importa e che sul telefono non servono:
 * `@electron-toolkit/utils` (mai "in sviluppo") e `cors` (nessuna richiesta
 * esce dal telefono).
 */
export const is = { dev: false }

export default function cors() {
  return (_req: unknown, _res: unknown, next: () => void): void => next()
}
