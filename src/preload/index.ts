import { contextBridge, ipcRenderer } from 'electron'

/**
 * Unico ponte main↔renderer. Il renderer non ha accesso a Node:
 * i dati passano da qui e le operazioni applicative dalla REST locale.
 */
const api = {
  /** URL del backend Express locale (porta effimera decisa all'avvio). */
  getAppInfo: (): Promise<{ apiBaseUrl: string; version: string; platform: string }> =>
    ipcRenderer.invoke('app:info'),

  /** Backup del database cifrato — AGENTS.md §7. Restituisce il percorso creato. */
  backupDatabase: (): Promise<string> => ipcRenderer.invoke('db:backup'),

  openDataFolder: (): Promise<void> => ipcRenderer.invoke('shell:open-data-folder')
}

export type DaProdApi = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('daprod', api)
} else {
  // @ts-ignore — solo per ambienti senza context isolation
  window.daprod = api
}
