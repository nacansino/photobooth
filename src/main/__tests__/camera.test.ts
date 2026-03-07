import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CameraService, CameraInfo } from '@shared/types'

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}))

import { execFile, spawn } from 'child_process'
import type { ChildProcess } from 'child_process'

// Import the camera service factory/constructor — Team B decides the export shape.
// We expect a default export or named `createCameraService` function.
import { createCameraService } from '../camera'

const mockExecFile = vi.mocked(execFile)
const mockSpawn = vi.mocked(spawn)

// Sample gphoto2 --auto-detect output
const DETECT_OUTPUT_FOUND = `Model                          Port
----------------------------------------------------------
Canon EOS M100                 usb:001,004
`

const DETECT_OUTPUT_EMPTY = `Model                          Port
----------------------------------------------------------
`

const DETECT_OUTPUT_MULTIPLE = `Model                          Port
----------------------------------------------------------
Canon EOS M100                 usb:001,004
Canon EOS R5                   usb:002,007
`

describe('CameraService', () => {
  let camera: CameraService

  beforeEach(() => {
    vi.clearAllMocks()
    camera = createCameraService()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('detectCamera()', () => {
    it('returns camera info when a camera is detected', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        cb(null, DETECT_OUTPUT_FOUND, '')
        return undefined as unknown as ChildProcess
      })

      const result = await camera.detectCamera()

      expect(result).not.toBeNull()
      expect(result).toEqual<CameraInfo>({
        model: 'Canon EOS M100',
        port: 'usb:001,004',
      })
    })

    it('returns null when no camera is detected', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        cb(null, DETECT_OUTPUT_EMPTY, '')
        return undefined as unknown as ChildProcess
      })

      const result = await camera.detectCamera()

      expect(result).toBeNull()
    })

    it('returns the first camera when multiple are detected', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        cb(null, DETECT_OUTPUT_MULTIPLE, '')
        return undefined as unknown as ChildProcess
      })

      const result = await camera.detectCamera()

      expect(result).not.toBeNull()
      expect(result!.model).toBe('Canon EOS M100')
      expect(result!.port).toBe('usb:001,004')
    })

    it('calls gphoto2 with --auto-detect flag', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        cb(null, DETECT_OUTPUT_FOUND, '')
        return undefined as unknown as ChildProcess
      })

      await camera.detectCamera()

      expect(mockExecFile).toHaveBeenCalledWith(
        'gphoto2',
        expect.arrayContaining(['--auto-detect']),
        expect.anything(),
        expect.any(Function)
      )
    })

    it('returns null when gphoto2 command fails', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        cb(new Error('gphoto2 not found'), '', 'command not found: gphoto2')
        return undefined as unknown as ChildProcess
      })

      const result = await camera.detectCamera()

      expect(result).toBeNull()
    })
  })

  describe('captureImage()', () => {
    const outputPath = '/tmp/photobooth/session-abc/shot-1.jpg'

    it('captures an image and returns the file path', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        cb(null, 'New file is in location /tmp/photobooth/session-abc/shot-1.jpg\n', '')
        return undefined as unknown as ChildProcess
      })

      const result = await camera.captureImage(outputPath)

      expect(result).toBe(outputPath)
    })

    it('calls gphoto2 with --capture-image-and-download and correct filename', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        cb(null, '', '')
        return undefined as unknown as ChildProcess
      })

      await camera.captureImage(outputPath)

      expect(mockExecFile).toHaveBeenCalledWith(
        'gphoto2',
        expect.arrayContaining([
          '--capture-image-and-download',
          `--filename=${outputPath}`,
        ]),
        expect.anything(),
        expect.any(Function)
      )
    })

    it('rejects when capture fails', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        cb(new Error('Could not capture image'), '', 'ERROR: Could not capture.')
        return undefined as unknown as ChildProcess
      })

      await expect(camera.captureImage(outputPath)).rejects.toThrow()
    })

    it('rejects on capture timeout', async () => {
      mockExecFile.mockImplementation(() => {
        // Simulate a command that never completes — the service should enforce a timeout
        return undefined as unknown as ChildProcess
      })

      // The service should reject with a timeout error if gphoto2 hangs
      await expect(camera.captureImage(outputPath)).rejects.toThrow()
    })
  })

  describe('capturePreviewFrame()', () => {
    it('returns a Buffer of JPEG data', async () => {
      const fakeJpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])

      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: Buffer,
          stderr: string
        ) => void
        cb(null, fakeJpegData, '')
        return undefined as unknown as ChildProcess
      })

      const frame = await camera.capturePreviewFrame()

      expect(Buffer.isBuffer(frame)).toBe(true)
      expect(frame.length).toBeGreaterThan(0)
    })

    it('calls gphoto2 with --capture-preview and --stdout flags', async () => {
      const fakeJpegData = Buffer.from([0xff, 0xd8])

      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: Buffer,
          stderr: string
        ) => void
        cb(null, fakeJpegData, '')
        return undefined as unknown as ChildProcess
      })

      await camera.capturePreviewFrame()

      expect(mockExecFile).toHaveBeenCalledWith(
        'gphoto2',
        expect.arrayContaining(['--capture-preview', '--stdout']),
        expect.anything(),
        expect.any(Function)
      )
    })

    it('rejects when preview capture fails', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        cb(new Error('Camera not found'), '', 'ERROR: No camera detected')
        return undefined as unknown as ChildProcess
      })

      await expect(camera.capturePreviewFrame()).rejects.toThrow()
    })
  })

  describe('startPreviewStream()', () => {
    it('invokes callback with frame buffers', async () => {
      const fakeFrame = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
      const frameCallback = vi.fn()

      // Mock capturePreviewFrame to return fake frames
      // The stream internally calls capturePreviewFrame in a loop
      let callCount = 0
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: Buffer,
          stderr: string
        ) => void
        callCount++
        cb(null, fakeFrame, '')
        return undefined as unknown as ChildProcess
      })

      const stop = camera.startPreviewStream(frameCallback)

      // Give the loop time to run a few iterations
      await new Promise((resolve) => setTimeout(resolve, 200))

      stop()

      expect(frameCallback).toHaveBeenCalled()
      expect(Buffer.isBuffer(frameCallback.mock.calls[0][0])).toBe(true)
    })

    it('returns a stop function that halts the stream', async () => {
      const fakeFrame = Buffer.from([0xff, 0xd8])
      const frameCallback = vi.fn()

      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: Buffer,
          stderr: string
        ) => void
        cb(null, fakeFrame, '')
        return undefined as unknown as ChildProcess
      })

      const stop = camera.startPreviewStream(frameCallback)

      // Let some frames accumulate
      await new Promise((resolve) => setTimeout(resolve, 100))

      const countAtStop = frameCallback.mock.calls.length
      stop()

      // Wait and verify no more frames arrive
      await new Promise((resolve) => setTimeout(resolve, 150))
      const countAfterStop = frameCallback.mock.calls.length

      expect(countAfterStop).toBe(countAtStop)
    })

    it('continues streaming even if a single frame capture fails', async () => {
      const fakeFrame = Buffer.from([0xff, 0xd8])
      const frameCallback = vi.fn()
      let callCount = 0

      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: Buffer,
          stderr: string
        ) => void
        callCount++
        if (callCount === 2) {
          // Second call fails
          cb(new Error('Temporary USB error'), Buffer.alloc(0), '')
        } else {
          cb(null, fakeFrame, '')
        }
        return undefined as unknown as ChildProcess
      })

      const stop = camera.startPreviewStream(frameCallback)

      await new Promise((resolve) => setTimeout(resolve, 300))

      stop()

      // Should have received frames despite the error on call #2
      expect(frameCallback).toHaveBeenCalled()
      // The callback should only have been called with successful frames
      for (const call of frameCallback.mock.calls) {
        expect(Buffer.isBuffer(call[0])).toBe(true)
        expect(call[0].length).toBeGreaterThan(0)
      }
    })
  })

  describe('error cases', () => {
    it('handles camera not found during capture', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        const error = new Error('Could not detect any camera') as NodeJS.ErrnoException
        error.code = 'ERR_CAMERA_NOT_FOUND'
        cb(error, '', '*** Error: No camera found. ***')
        return undefined as unknown as ChildProcess
      })

      await expect(camera.captureImage('/tmp/test.jpg')).rejects.toThrow()
    })

    it('handles USB disconnection during capture', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        const error = new Error('PTP I/O error') as NodeJS.ErrnoException
        cb(error, '', '*** Error: I/O in progress ***')
        return undefined as unknown as ChildProcess
      })

      await expect(camera.captureImage('/tmp/test.jpg')).rejects.toThrow()
    })

    it('handles USB disconnection during preview', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        const error = new Error('USB device disconnected')
        cb(error, '', '*** Error: Could not claim the USB device ***')
        return undefined as unknown as ChildProcess
      })

      await expect(camera.capturePreviewFrame()).rejects.toThrow()
    })

    it('handles gphoto2 process exit with non-zero code', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
          error: Error | null,
          stdout: string,
          stderr: string
        ) => void
        const error = new Error('Process exited with code 1') as NodeJS.ErrnoException
        error.code = '1'
        cb(error, '', 'An error occurred')
        return undefined as unknown as ChildProcess
      })

      await expect(camera.detectCamera()).resolves.toBeNull()
    })
  })
})
