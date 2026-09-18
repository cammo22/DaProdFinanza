import { contextBridge, ipcRenderer } from 'electron'
import type { UpdateState } from '@shared/updates'

/**
 * Unico ponte main↔renderer. Il renderer non ha accesso a Node:
 * i dati passano da qui e le operazioni applicative dalla REST locale.
 */
const api = {
  /** URL del backend Express locale (porta effimera decisa all'avvio). */
  getAppInfo: (): Promise<{
    apiBaseUrl: string
    version: string
    platform: string
    /** true solo nella versione dimostrativa. */
    demoBuild: boolean
  }> =>
    ipcRenderer.invoke('app:info'),

  /** Backup del database cifrato — AGENTS.md §7. Restituisce il percorso creato. */
  backupDatabase: (): Promise<string> => ipcRenderer.invoke('db:backup'),

  openDataFolder: (): Promise<void> => ipcRenderer.invoke('shell:open-data-folder'),

  /** Apre il dialogo di sistema per scegliere il file da importare. */
  pickExcelFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-excel'),

  /** Dialogo "Salva con nome" per un file Excel. */
  saveExcelFile: (suggestedName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save-excel', suggestedName),

  /** Apre un file .xlsx con il programma predefinito. */
  openExcelFile: (path: string): Promise<void> => ipcRenderer.invoke('shell:open-file', path),

  /** Aggiornamenti da GitHub: stato, controllo, download, installazione. */
  updates: {
    state: (): Promise<UpdateState> => ipcRenderer.invoke('update:state'),
    check: (): Promise<UpdateState> => ipcRenderer.invoke('update:check'),
    download: (): Promise<UpdateState> => ipcRenderer.invoke('update:download'),
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    /** Avvisa a ogni cambio di stato; restituisce la funzione per smettere. */
    onChange: (listener: (state: UpdateState) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, next: UpdateState): void => listener(next)
      ipcRenderer.on('update:changed', handler)
      return () => ipcRenderer.removeListener('update:changed', handler)
    }
  }
}

export type DaProdApi = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('daprod', api)
} else {
  // @ts-ignore — solo per ambienti senza context isolation
  window.daprod = api
}
