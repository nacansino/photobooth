import { app, BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log/main'

import path from 'path'
import { execFile } from 'child_process'
import { IPC_CHANNELS } from '@shared/types'
import { createCameraService } from './camera'
import { detectPrinter, printImage } from './printer'
import { compositePhotos, loadTemplate } from './compositor'
import { createSession, saveShot, saveComposite } from './storage'

// Initialize electron-log: writes to ~/.config/photobooth/logs/main.log
log.initialize()
log.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB

process.on('uncaughtException', (err) => {
  log.error('[uncaughtException]', err)
})
process.on('unhandledRejection', (reason) => {
  log.error('[unhandledRejection]', reason)
})

function releaseCamera(): Promise<void> {
  return new Promise((resolve) => {
    // Kill gvfs monitors that claim the camera via PTP and MTP
    execFile('pkill', ['-f', 'gvfs-(gphoto2|mtp)-volume-monitor'], (error) => {
      if (!error) {
        log.info('[camera] Killed gvfs volume monitors')
      }
      // Note: uvcvideo is NOT unloaded — needed for HDMI capture card.
      // The udev rule (99-canon-eos-m100.rules) prevents it from claiming the Canon.
      resolve()
    })
  })
}

let mainWindow: BrowserWindow | null = null

const camera = createCameraService()
let stopPreview: (() => Promise<void>) | null = null

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

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
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
  if (stopPreview) await stopPreview()

  stopPreview = camera.startPreviewStream((frame) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.CAMERA_FRAME, frame.toString('base64'))
    }
  })
})

ipcMain.handle(IPC_CHANNELS.CAMERA_STOP_PREVIEW, async () => {
  if (stopPreview) {
    await stopPreview()
    stopPreview = null
  }
})

ipcMain.handle(IPC_CHANNELS.CAMERA_CAPTURE, async () => {
  // Capture happens through the same preview-stream process — no USB handoff needed
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

ipcMain.handle(IPC_CHANNELS.TEMPLATE_GET, async () => {
  const templatePath = path.join(app.isPackaged ? process.resourcesPath : process.cwd(), 'templates', 'default.json')
  return loadTemplate(templatePath)
})

ipcMain.handle(IPC_CHANNELS.PRINTER_DETECT, async (_event, name?: string) => {
  try {
    return await detectPrinter(name)
  } catch (err) {
    log.error('[printer] Detection failed:', err)
    return null
  }
})

ipcMain.handle(IPC_CHANNELS.PRINT_QUEUE, async (_event, _sessionId: string) => {
  if (!currentSessionDir) {
    log.warn('[print] No session directory, skipping')
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

    // Resolve image paths relative to template location
    const templateDir = path.dirname(templatePath)
    templateConfig.background = path.join(templateDir, path.basename(templateConfig.background))
    if (templateConfig.overlay) {
      templateConfig.overlay = path.join(templateDir, path.basename(templateConfig.overlay))
    }

    const photoPaths = templateConfig.slots.map((_slot, i) =>
      path.join(sessionDir, `shot-${i}.jpg`)
    )

    const compositePath = path.join(sessionDir, 'composite.jpg')
    await compositePhotos(templateConfig, photoPaths, compositePath)
    log.info(`[composite] Saved: ${compositePath}`)

    // Try to print — skip if disabled or no printer
    if (templateConfig.printEnabled === false) {
      log.info('[print] Printing disabled in template config — skipping')
    } else try {
      const printer = await detectPrinter()
      if (printer) {
        const job = await printImage(compositePath, printer.name, {
          media: '89x119mm.Borderless',
          fitToPage: true,
        })
        log.info(`[print] Job queued: ${job.jobId}`)

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.PRINT_STATUS, {
            jobId: job.jobId,
            status: 'printing',
          })
        }
      } else {
        log.info('[print] No printer found — skipping print (composite saved to disk)')
      }
    } catch (err) {
      log.error('[print] Printer error — skipping:', err)
    }
  } catch (err) {
    log.error('[composite] Failed:', err)
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

  app.whenReady().then(async () => {
    await releaseCamera()
    createWindow()
  })

  app.on('window-all-closed', () => {
    if (stopPreview) stopPreview()
    app.quit()
  })
}
