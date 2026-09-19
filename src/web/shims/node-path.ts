/** `node:path` per percorsi che nella versione Android non vengono mai aperti. */
export const sep = '/'
export const join = (...parti: string[]): string =>
  parti.filter(Boolean).join('/').replace(/\/+/g, '/')
export const resolve = join
export const basename = (p: string, ext?: string): string => {
  const b = p.split(/[\\/]/).pop() ?? ''
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b
}
export const dirname = (p: string): string => p.split(/[\\/]/).slice(0, -1).join('/') || '/'
export const extname = (p: string): string => /\.[^./\\]*$/.exec(p)?.[0] ?? ''

export default { sep, join, resolve, basename, dirname, extname }
