// ── IPC Channel Names ──

export const IPC_CHANNELS = {
  CAMERA_START_PREVIEW: 'camera:start-preview',
  CAMERA_STOP_PREVIEW: 'camera:stop-preview',
  CAMERA_FRAME: 'camera:frame',
  CAMERA_CAPTURE: 'camera:capture',
  CAMERA_CAPTURED: 'camera:captured',
  CAMERA_DETECT: 'camera:detect',
  PRINT_QUEUE: 'print:queue',
  PRINT_STATUS: 'print:status',
  PRINTER_DETECT: 'printer:detect',
  TEMPLATE_GET: 'template:get',
} as const

// ── Camera Types ──

export interface CameraInfo {
  model: string
  port: string
}

export interface CaptureResult {
  index: number
  path: string
}

export interface CameraService {
  detectCamera(): Promise<CameraInfo | null>
  captureImage(outputPath: string): Promise<string>
  capturePreviewFrame(): Promise<Buffer>
  startPreviewStream(callback: (frame: Buffer) => void): () => Promise<void>
}

// ── Printer Types ──

export interface PrinterInfo {
  name: string
  status: 'idle' | 'printing' | 'error' | 'offline'
}

export interface PrintJobResult {
  jobId: string
}

export interface PrintJobStatus {
  jobId: string
  status: 'pending' | 'printing' | 'completed' | 'error'
  error?: string
}

export interface PrinterService {
  detectPrinter(name?: string): Promise<PrinterInfo | null>
  printImage(imagePath: string, printerName: string, options?: PrintOptions): Promise<PrintJobResult>
  getPrintJobStatus(jobId: string): Promise<PrintJobStatus | null>
  cancelJob(jobId: string): Promise<void>
}

export interface PrintOptions {
  media?: string
  fitToPage?: boolean
}

// ── Compositor Types ──

export interface TemplateSlot {
  x: number
  y: number
  width: number
  height: number
}

export interface TemplateConfig {
  width: number
  height: number
  dpi: number
  background: string
  overlay?: string
  printEnabled?: boolean
  slots: TemplateSlot[]
}

export interface CompositorService {
  loadTemplate(configPath: string): Promise<TemplateConfig>
  compositePhotos(
    templateConfig: TemplateConfig,
    photoPaths: string[],
    outputPath: string
  ): Promise<string>
  resizeToFit(imagePath: string, width: number, height: number): Promise<Buffer>
}

// ── Storage Types ──

export interface SessionInfo {
  sessionId: string
  sessionDir: string
}

export interface SessionPhotos {
  shots: string[]
  composite: string | null
}

export interface SessionListEntry {
  sessionId: string
  sessionDir: string
  date: string
  photoCount: number
}

export interface StorageService {
  createSession(baseDir?: string): Promise<SessionInfo>
  saveShot(sessionDir: string, index: number, imageBuffer: Buffer): Promise<string>
  saveComposite(sessionDir: string, imageBuffer: Buffer): Promise<string>
  getSessionPhotos(sessionDir: string): Promise<SessionPhotos>
  listSessions(baseDir: string, date?: string): Promise<SessionListEntry[]>
}

// ── App State ──

export type Screen = 'idle' | 'capturing' | 'queued'

export interface AppState {
  screen: Screen
  shotIndex: number
  sessionId: string | null
  photos: string[]
  totalShots: number
}

export type AppAction =
  | { type: 'start'; sessionId: string; totalShots: number }
  | { type: 'captured'; photoPath: string }
  | { type: 'skip' }
  | { type: 'timeout' }
  | { type: 'cancel' }

// ── Electron API (exposed to renderer via preload) ──

export interface ElectronAPI {
  camera: {
    detect(): Promise<CameraInfo | null>
    startPreview(): Promise<void>
    stopPreview(): Promise<void>
    onFrame(callback: (frameBase64: string) => void): () => void
    capture(): Promise<CaptureResult>
  }
  printer: {
    detect(name?: string): Promise<PrinterInfo | null>
    queue(sessionId: string): Promise<void>
    onStatus(callback: (status: PrintJobStatus) => void): () => void
  }
  template: {
    get(): Promise<TemplateConfig>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
