// Primo import di proposito: sposta la cartella dati della demo prima di tutto.
import { DEMO_BUILD } from './build-flags'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { existsSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { eseguibile } from '@shared/documents'
import { backupDatabase, closeDatabase, openDatabase } from './db'
import { seedDemoData } from './db/seed'
import { avviaBackupAutomatico } from './lib/auto-backup'
import { companiesRoot, dataRoot } from './lib/paths'
import { apiBaseUrl, startServer, stopServer } from './server'
import { registerReportIpc } from './report'
import { checkForUpdates, downloadUpdate, initUpdates, installUpdate, updateState } from './updates'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'DaProdFinanza',
    backgroundColor: '#0b1120',
    autoHideMenuBar: true,
    // In pacchetto l'icona la dà l'eseguibile; in sviluppo va indicata a mano,
    // altrimenti la finestra mostra quella di Electron.
    ...(is.dev ? { icon: join(__dirname, '../../build/icon.png') } : {}),
    webPreferences: {
      // La build è ESM: electron-vite emette il preload come `.mjs`.
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // Il lampeggio per una chiamata in arrivo si ferma quando si torna sulla finestra.
  mainWindow.on('focus', () => mainWindow?.flashFrame(false))

  // I link esterni escono nel browser di sistema, mai in una finestra Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  // Dati di bootstrap che il renderer legge prima di qualsiasi chiamata REST.
  ipcMain.handle('app:info', () => ({
    apiBaseUrl: apiBaseUrl(),
    version: app.getVersion(),
    platform: process.platform,
    demoBuild: DEMO_BUILD
  }))

  // Pulsante "Backup" della status bar — AGENTS.md §7.
  ipcMain.handle('db:backup', () => backupDatabase())

  ipcMain.handle('shell:open-data-folder', async () => {
    await shell.openPath(dataRoot())
  })

  // Scelta del file Excel da importare. Il dialogo di sistema vive nel main:
  // il renderer non ha, e non deve avere, accesso al filesystem.
  ipcMain.handle('dialog:pick-excel', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Scegli il file del piano dei conti',
      properties: ['openFile'],
      filters: [{ name: 'Fogli di calcolo', extensions: ['xlsx', 'xlsm'] }]
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // "Salva con nome" per il modello Excel da compilare.
  ipcMain.handle('dialog:save-excel', async (_event, suggestedName: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Salva il modello Excel',
      defaultPath: join(app.getPath('documents'), suggestedName),
      filters: [{ name: 'Cartella di lavoro Excel', extensions: ['xlsx'] }]
    })
    return result.canceled ? null : (result.filePath ?? null)
  })

  // Apre un file appena creato con il programma predefinito (Excel).
  ipcMain.handle('shell:open-file', async (_event, path: string) => {
    if (typeof path !== 'string' || !path.toLowerCase().endsWith('.xlsx')) return
    await shell.openPath(path)
  })

  // Cassetto documenti (§10.13): il percorso arriva dal servizio interno, ma qui
  // si ricontrolla che stia davvero dentro le cartelle delle aziende e che non
  // sia un programma — un file mandato da fuori non si esegue con un clic.
  const documentoSicuro = (path: unknown): string => {
    if (typeof path !== 'string') throw new Error('Percorso non valido.')
    const file = resolve(path)
    if (!file.startsWith(resolve(companiesRoot()) + sep) || !existsSync(file)) {
      throw new Error('Il file non è nel cassetto documenti.')
    }
    return file
  }

  ipcMain.handle('documenti:apri', async (_event, path: unknown) => {
    const file = documentoSicuro(path)
    if (eseguibile(file)) throw new Error('Questo è un programma: non si apre da qui. Salvane una copia se ti serve.')
    const errore = await shell.openPath(file)
    // openPath risponde con una stringa vuota se è andata bene.
    if (errore) throw new Error(`Nessun programma sul computer apre questo file (${errore}).`)
  })

  ipcMain.handle('documenti:salva-copia', async (_event, path: unknown) => {
    const file = documentoSicuro(path)
    const scelta = await dialog.showSaveDialog({
      title: 'Salva una copia',
      defaultPath: join(app.getPath('downloads'), basename(file))
    })
    if (scelta.canceled || !scelta.filePath) return null
    await copyFile(file, scelta.filePath)
    return scelta.filePath
  })

  ipcMain.handle('documenti:mostra', (_event, path: unknown) => {
    shell.showItemInFolder(documentoSicuro(path))
  })

  // Chiamata in arrivo: la finestra lampeggia nella barra delle applicazioni.
  ipcMain.on('finestra:attenzione', () => {
    if (mainWindow && !mainWindow.isFocused()) mainWindow.flashFrame(true)
  })

  // Aggiornamenti da GitHub (vedi updates.ts).
  ipcMain.handle('update:state', () => updateState())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => installUpdate())

  // Report PDF (vedi report.ts).
  registerReportIpc()
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.daprodproduzioni.daprodfinanza')

  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window))

  try {
    openDatabase()
    await seedDemoData()
    await startServer()
  } catch (error) {
    dialog.showErrorBox(
      'Avvio non riuscito',
      error instanceof Error ? error.message : String(error)
    )
    app.quit()
    return
  }

  registerIpc()
  initUpdates()
  // Una copia del database al giorno, se l'impostazione è accesa (§10.12).
  avviaBackupAutomatico()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopServer()
  closeDatabase()
})
