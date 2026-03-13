import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/types'
import type { ElectronAPI } from '@shared/types'

const api: ElectronAPI = {
  camera: {
    detect: () => ipcRenderer.invoke(IPC_CHANNELS.CAMERA_DETECT),
    startPreview: () => ipcRenderer.invoke(IPC_CHANNELS.CAMERA_START_PREVIEW),
    stopPreview: () => ipcRenderer.invoke(IPC_CHANNELS.CAMERA_STOP_PREVIEW),
    onFrame: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, frameBase64: string) => {
        callback(frameBase64)
      }
      ipcRenderer.on(IPC_CHANNELS.CAMERA_FRAME, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CAMERA_FRAME, handler)
      }
    },
    capture: () => ipcRenderer.invoke(IPC_CHANNELS.CAMERA_CAPTURE),
  },
  template: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_GET),
  },
  printer: {
    detect: (name?: string) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_DETECT, name),
    queue: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.PRINT_QUEUE, sessionId),
    onStatus: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, status: unknown) => {
        callback(status as Parameters<typeof callback>[0])
      }
      ipcRenderer.on(IPC_CHANNELS.PRINT_STATUS, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.PRINT_STATUS, handler)
      }
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
