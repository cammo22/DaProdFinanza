import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReportParams } from '@shared/report'
import { companyFolder } from './lib/paths'

/**
 * Report PDF di un'azienda e di un periodo.
 *
 * Il report è una pagina React come le altre, impaginata per la carta: la si
 * apre in una finestra nascosta, larga quanto un A4, e Chromium la stampa in
 * PDF con i numeri di pagina. Grafici e tabelle vengono dagli stessi dati delle
 * schermate: il PDF non può raccontare una cosa diversa dal programma.
 */

const READY_TIMEOUT_MS = 60_000
/** Parametri di ciascuna finestra di report, letti dal renderer al via. */
const pending = new Map<number, ReportParams>()

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** Nome di file sicuro su Windows. */
function fileName(text: string): string {
  return text.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function registerReportIpc(): void {
  ipcMain.handle('report:params', (event) => pending.get(event.sender.id) ?? null)

  ipcMain.handle('report:export', async (event, params: ReportParams) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const suggested = `Report ${fileName(params.companyName)} - ${fileName(params.periodLabel)}.pdf`
    const options = {
      title: 'Salva il report PDF',
      defaultPath: join(companyFolder(params.companyCode), 'export', suggested),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    // Solo per le prove automatiche in sviluppo: niente dialogo, niente apertura.
    const testDir = !app.isPackaged ? process.env['DAPROD_REPORT_TEST_DIR'] : undefined
    const choice = testDir
      ? { canceled: false, filePath: join(testDir, suggested) }
      : parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options)
    if (choice.canceled || !choice.filePath) return null

    const pdf = await renderReport(params)
    await writeFile(choice.filePath, pdf)
    if (!testDir) await shell.openPath(choice.filePath)
    return choice.filePath
  })
}

async function renderReport(params: ReportParams): Promise<Buffer> {
  // 794 px = 210 mm a 96 dpi: la pagina si impagina alla larghezza della carta.
  const win = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  pending.set(win.webContents.id, params)

  try {
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Il report non è stato pronto in tempo.')), READY_TIMEOUT_MS)
      const onReady = (event: Electron.IpcMainEvent, error?: string): void => {
        if (event.sender.id !== win.webContents.id) return
        clearTimeout(timer)
        ipcMain.removeListener('report:ready', onReady)
        if (error) reject(new Error(error))
        else resolve()
      }
      ipcMain.on('report:ready', onReady)
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      await win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#report`)
    } else {
      await win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'report' })
    }
    await ready

    const footer = `
      <div style="width:100%;padding:0 14mm;font-family:'Segoe UI',sans-serif;font-size:7.5px;color:#64748b;display:flex;justify-content:space-between">
        <span>${escapeHtml(params.companyName)} · ${escapeHtml(params.periodLabel)} · DaProdFinanza ${escapeHtml(app.getVersion())}</span>
        <span>Pagina <span class="pageNumber"></span> di <span class="totalPages"></span></span>
      </div>`

    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footer,
      // Pollici: 12 mm ai lati, 14 mm in basso per il piè di pagina.
      margins: { top: 0.45, bottom: 0.6, left: 0.47, right: 0.47 },
      preferCSSPageSize: false
    })
  } finally {
    pending.delete(win.webContents.id)
    win.destroy()
  }
}
