import { execFile } from 'child_process'
import type { CameraService, CameraInfo } from '@shared/types'

const CAPTURE_TIMEOUT_MS = 3000

export function createCameraService(): CameraService {
  function detectCamera(): Promise<CameraInfo | null> {
    return new Promise((resolve) => {
      execFile('gphoto2', ['--auto-detect'], {}, (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }

        const lines = String(stdout).split('\n')
        // Skip header line and separator line
        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue

          // Parse fixed-width format: model followed by 2+ spaces then port
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
      let settled = false

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error('Capture timed out'))
        }
      }, CAPTURE_TIMEOUT_MS)

      execFile(
        'gphoto2',
        ['--capture-image-and-download', `--filename=${outputPath}`],
        {},
        (error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)

          if (error) {
            reject(error)
            return
          }
          resolve(outputPath)
        },
      )
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

  function startPreviewStream(callback: (frame: Buffer) => void): () => void {
    let running = true

    async function loop(): Promise<void> {
      while (running) {
        try {
          const frame = await capturePreviewFrame()
          if (running && frame.length > 0) {
            callback(frame)
          }
        } catch {
          // Continue streaming even if a single frame fails
        }

        if (running) {
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
      }
    }

    loop()

    return () => {
      running = false
    }
  }

  return {
    detectCamera,
    captureImage,
    capturePreviewFrame,
    startPreviewStream,
  }
}
