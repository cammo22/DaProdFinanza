import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { backupDatabase, closeDatabase, openDatabase } from './db'
import { seedDemoData } from './db/seed'
import { dataRoot } from './lib/paths'
import { apiBaseUrl, startServer, stopServer } from './server'

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
    platform: process.platform
  }))

  // Pulsante "Backup" della status bar — AGENTS.md §7.
  ipcMain.handle('db:backup', () => backupDatabase())

  ipcMain.handle('shell:open-data-folder', async () => {
    await shell.openPath(dataRoot())
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.daprodproduzioni.daprodfinanza')

  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window))

  try {
    openDatabase()
    seedDemoData()
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
