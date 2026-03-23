import { execFile, spawn, type ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import log from 'electron-log/main'
import type { CameraService, CameraInfo } from '@shared/types'

const CAPTURE_TIMEOUT_MS = 15000

const MSG_PREVIEW = 0x01
const MSG_CAPTURE_OK = 0x02
const MSG_CAPTURE_FAIL = 0x03

/** Find HDMI capture card V4L2 device (not a built-in webcam). */
function findHdmiDevice(): string | null {
  try {
    // Look for /dev/video* devices
    const devices = fs.readdirSync('/dev').filter((d) => /^video\d+$/.test(d))
    for (const dev of devices) {
      const sysPath = `/sys/class/video4linux/${dev}/name`
      if (!fs.existsSync(sysPath)) continue
      const name = fs.readFileSync(sysPath, 'utf-8').trim().toLowerCase()
      // Skip built-in webcams / IR cameras / Intel IPU — match common capture card names
      if (name.includes('intel') || name.includes('ipu')) continue
      if (
        name.includes('capture') ||
        name.includes('guermok') ||
        name.includes('cam link') ||
        name.includes('hdmi')
      ) {
        return `/dev/${dev}`
      }
    }
  } catch (err) {
    log.warn('[camera] Failed to scan V4L2 devices:', err)
  }
  return null
}

export function createCameraService(): CameraService {
  // ── preview-stream helper state (USB/PTP mode) ──
  let helperProc: ChildProcess | null = null
  let helperBuf = Buffer.alloc(0)
  let frameCallback: ((frame: Buffer) => void) | null = null
  let captureResolve: ((path: string) => void) | null = null
  let captureReject: ((err: Error) => void) | null = null

  // ── HDMI/V4L2 preview state ──
  let ffmpegProc: ChildProcess | null = null
  let hdmiDevice: string | null = null
  let previewMode: 'hdmi' | 'usb' | null = null

  function ensureHelper(): ChildProcess {
    if (helperProc) return helperProc

    const helperPath = app.isPackaged
      ? path.join(process.resourcesPath, 'preview-stream')
      : path.join(process.cwd(), 'src', 'main', 'preview-stream')

    helperProc = spawn(helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    helperProc.stdout!.on('data', (chunk: Buffer) => {
      helperBuf = Buffer.concat([helperBuf, chunk])

      // Parse messages: [1-byte type][4-byte BE length][payload]
      while (helperBuf.length >= 5) {
        const msgType = helperBuf[0]
        const payloadSize = helperBuf.readUInt32BE(1)
        if (helperBuf.length < 5 + payloadSize) break

        const payload = helperBuf.subarray(5, 5 + payloadSize)
        helperBuf = helperBuf.subarray(5 + payloadSize)

        if (msgType === MSG_PREVIEW) {
          // Only forward preview frames if we're in USB mode
          if (previewMode === 'usb') {
            frameCallback?.(payload)
          }
        } else if (msgType === MSG_CAPTURE_OK) {
          const filePath = payload.toString()
          captureResolve?.(filePath)
          captureResolve = null
          captureReject = null
        } else if (msgType === MSG_CAPTURE_FAIL) {
          captureReject?.(new Error('Capture failed'))
          captureResolve = null
          captureReject = null
        }
      }
    })

    helperProc.stderr!.on('data', (chunk: Buffer) => {
      log.info(`[preview-stream] ${chunk.toString().trim()}`)
    })

    helperProc.on('error', (err) => {
      log.error('[preview-stream] Failed to spawn:', err)
    })

    helperProc.on('close', (code) => {
      if (code && code !== 0) {
        log.error(`[preview-stream] Exited with code ${code}`)
      }
      helperProc = null
      helperBuf = Buffer.alloc(0)
    })

    return helperProc
  }

  function startHdmiPreview(device: string, callback: (frame: Buffer) => void): () => Promise<void> {
    // Use ffmpeg to read MJPEG frames from V4L2 and output individual JPEGs
    // -f image2pipe outputs each frame as a separate JPEG with FFD8..FFD9 markers
    ffmpegProc = spawn('ffmpeg', [
      '-f', 'v4l2',
      '-input_format', 'mjpeg',
      '-video_size', '1920x1080',
      '-framerate', '30',
      '-i', device,
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '3',
      '-',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Parse JPEG frames from the pipe — each frame starts with FFD8 and ends with FFD9
    let jpegBuf = Buffer.alloc(0)

    ffmpegProc.stdout!.on('data', (chunk: Buffer) => {
      jpegBuf = Buffer.concat([jpegBuf, chunk])

      // Scan for complete JPEG frames (FFD8...FFD9)
      while (jpegBuf.length > 4) {
        // Find JPEG start marker
        const start = jpegBuf.indexOf(Buffer.from([0xFF, 0xD8]))
        if (start === -1) {
          jpegBuf = Buffer.alloc(0)
          break
        }
        if (start > 0) {
          jpegBuf = jpegBuf.subarray(start)
        }

        // Find JPEG end marker after start
        const end = jpegBuf.indexOf(Buffer.from([0xFF, 0xD9]), 2)
        if (end === -1) break // incomplete frame, wait for more data

        const frame = jpegBuf.subarray(0, end + 2)
        jpegBuf = jpegBuf.subarray(end + 2)
        callback(frame)
      }
    })

    ffmpegProc.stderr!.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim()
      // Only log errors, not the usual ffmpeg info spam
      if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('fatal')) {
        log.error(`[hdmi-preview] ${msg}`)
      }
    })

    ffmpegProc.on('error', (err) => {
      log.error('[hdmi-preview] Failed to spawn ffmpeg:', err)
    })

    ffmpegProc.on('close', (code) => {
      if (code && code !== 0) {
        log.error(`[hdmi-preview] ffmpeg exited with code ${code}`)
        // Fallback to USB preview if HDMI failed
        if (previewMode === 'hdmi') {
          log.info('[camera] HDMI failed, falling back to USB preview')
          previewMode = 'usb'
        }
      }
      ffmpegProc = null
    })

    return async () => {
      if (!ffmpegProc) return
      return new Promise<void>((resolve) => {
        ffmpegProc!.on('close', () => resolve())
        ffmpegProc!.kill('SIGTERM')
      })
    }
  }

  function detectCamera(): Promise<CameraInfo | null> {
    return new Promise((resolve) => {
      execFile('gphoto2', ['--auto-detect'], {}, (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }

        const lines = String(stdout).split('\n')
        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue

          const match = line.match(/^(.+?)\s{2,}(\S+)$/)
          if (match) {
            resolve({
              model: match[1].trim(),
              port: match[2].trim(),
            })
            return
          }
        }

        resolve(null)
      })
    })
  }

  function captureImage(outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const p = ensureHelper()

      const timer = setTimeout(() => {
        captureResolve = null
        captureReject = null
        reject(new Error('Capture timed out'))
      }, CAPTURE_TIMEOUT_MS)

      captureResolve = (filePath: string) => {
        clearTimeout(timer)
        resolve(filePath)
      }
      captureReject = (err: Error) => {
        clearTimeout(timer)
        reject(err)
      }

      p.stdin!.write(`capture ${outputPath}\n`)
    })
  }

  function capturePreviewFrame(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      execFile(
        'gphoto2',
        ['--capture-preview', '--stdout'],
        { encoding: 'buffer' },
        (error, stdout) => {
          if (error) {
            reject(error)
            return
          }
          resolve(stdout)
        },
      )
    })
  }

  function startPreviewStream(callback: (frame: Buffer) => void): () => Promise<void> {
    frameCallback = callback

    // Check for HDMI capture card
    hdmiDevice = findHdmiDevice()

    if (hdmiDevice) {
      log.info(`[camera] HDMI preview via ${hdmiDevice}`)
      previewMode = 'hdmi'
      const stopHdmi = startHdmiPreview(hdmiDevice, callback)

      // Also start the helper in the background for capture (but don't forward its preview frames)
      ensureHelper()

      return async () => {
        frameCallback = null
        previewMode = null
        await stopHdmi()
        // Keep helper alive for capture — it'll be cleaned up on app exit
      }
    }

    // Fallback: USB preview via preview-stream helper
    log.info('[camera] USB preview via preview-stream helper')
    previewMode = 'usb'
    ensureHelper()

    return async () => {
      frameCallback = null
      previewMode = null
      if (!helperProc) return

      return new Promise<void>((resolve) => {
        helperProc!.on('close', () => resolve())
        helperProc!.kill('SIGTERM')
      })
    }
  }

  return {
    detectCamera,
    captureImage,
    capturePreviewFrame,
    startPreviewStream,
  }
}
