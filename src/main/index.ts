import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { IPC_CHANNELS } from '@shared/types'
import { createCameraService } from './camera'
import { detectPrinter, printImage } from './printer'
import { compositePhotos, loadTemplate } from './compositor'
import { createSession, saveShot, saveComposite } from './storage'

let mainWindow: BrowserWindow | null = null

const camera = createCameraService()
let stopPreview: (() => void) | null = null

// Session tracking for capture indexing
let currentSessionDir: string | null = null
let currentShotIndex = 0

function createWindow(): void {
  const isDev = !app.isPackaged

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: !isDev,
    kiosk: !isDev,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── IPC Handlers ──

ipcMain.handle(IPC_CHANNELS.CAMERA_DETECT, async () => {
  return camera.detectCamera()
})

ipcMain.handle(IPC_CHANNELS.CAMERA_START_PREVIEW, async () => {
  if (stopPreview) stopPreview()

  stopPreview = camera.startPreviewStream((frame) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.CAMERA_FRAME, frame.toString('base64'))
    }
  })
})

ipcMain.handle(IPC_CHANNELS.CAMERA_STOP_PREVIEW, async () => {
  if (stopPreview) {
    stopPreview()
    stopPreview = null
  }
})

ipcMain.handle(IPC_CHANNELS.CAMERA_CAPTURE, async () => {
  if (!currentSessionDir) {
    const session = await createSession()
    currentSessionDir = session.sessionDir
    currentShotIndex = 0
  }

  const shotPath = path.join(currentSessionDir, `shot-${currentShotIndex}.jpg`)
  await camera.captureImage(shotPath)

  const result = { index: currentShotIndex, path: shotPath }
  currentShotIndex++

  return result
})

ipcMain.handle(IPC_CHANNELS.PRINTER_DETECT, async (_event, name?: string) => {
  try {
    return await detectPrinter(name)
  } catch {
    return null
  }
})

ipcMain.handle(IPC_CHANNELS.PRINT_QUEUE, async (_event, _sessionId: string) => {
  if (!currentSessionDir) {
    console.log('[print] No session directory, skipping')
    return
  }

  const sessionDir = currentSessionDir
  // Reset for next session
  currentSessionDir = null
  currentShotIndex = 0

  // Composite in background
  try {
    const templatePath = path.join(app.isPackaged ? process.resourcesPath : process.cwd(), 'templates', 'default.json')
    const templateConfig = await loadTemplate(templatePath)

    // Resolve background path relative to template location
    const templateDir = path.dirname(templatePath)
    templateConfig.background = path.join(templateDir, path.basename(templateConfig.background))

    const photoPaths = [
      path.join(sessionDir, 'shot-0.jpg'),
      path.join(sessionDir, 'shot-1.jpg'),
      path.join(sessionDir, 'shot-2.jpg'),
      path.join(sessionDir, 'shot-3.jpg'),
    ] as [string, string, string, string]

    const compositePath = path.join(sessionDir, 'composite.jpg')
    await compositePhotos(templateConfig, photoPaths, compositePath)
    console.log(`[composite] Saved: ${compositePath}`)

    // Try to print — skip gracefully if no printer
    try {
      const printer = await detectPrinter()
      if (printer) {
        const job = await printImage(compositePath, printer.name, {
          media: 'Postcard.fullbleed',
          fitToPage: true,
        })
        console.log(`[print] Job queued: ${job.jobId}`)

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.PRINT_STATUS, {
            jobId: job.jobId,
            status: 'printing',
          })
        }
      } else {
        console.log('[print] No printer found — skipping print (composite saved to disk)')
      }
    } catch (err) {
      console.log('[print] Printer error — skipping:', err)
    }
  } catch (err) {
    console.error('[composite] Failed:', err)
  }
})

// ── App Lifecycle ──

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(createWindow)

  app.on('window-all-closed', () => {
    if (stopPreview) stopPreview()
    app.quit()
  })
}
