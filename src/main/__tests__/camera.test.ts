import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import type { CameraService, CameraInfo } from '@shared/types'

// Mock electron before importing the module under test
vi.mock('electron', () => ({ app: { isPackaged: false } }))

// Mock electron-log
vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Mock fs (for findHdmiDevice)
vi.mock('fs', () => ({
  default: {
    readdirSync: vi.fn().mockReturnValue([]),
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue(''),
  },
  readdirSync: vi.fn().mockReturnValue([]),
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
}))

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}))

import { execFile, spawn } from 'child_process'
import type { ChildProcess } from 'child_process'

// Import the camera service factory
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

interface MockChildProcess {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { write: ReturnType<typeof vi.fn> }
  on: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
}

function createMockChildProcess(): MockChildProcess {
  const proc: MockChildProcess = {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { write: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  }
  return proc
}

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
      const mockProc = createMockChildProcess()
      mockSpawn.mockReturnValue(mockProc as unknown as ChildProcess)

      // When stdin.write is called with the capture command, emit a MSG_CAPTURE_OK response
      mockProc.stdin.write.mockImplementation((data: string) => {
        // Build binary response: [0x02][4-byte BE length][path]
        const pathBuf = Buffer.from(outputPath)
        const header = Buffer.alloc(5)
        header[0] = 0x02 // MSG_CAPTURE_OK
        header.writeUInt32BE(pathBuf.length, 1)
        const response = Buffer.concat([header, pathBuf])
        process.nextTick(() => mockProc.stdout.emit('data', response))
        return true
      })

      const result = await camera.captureImage(outputPath)

      expect(result).toBe(outputPath)
    })

    it('sends capture command to helper stdin', async () => {
      const mockProc = createMockChildProcess()
      mockSpawn.mockReturnValue(mockProc as unknown as ChildProcess)

      mockProc.stdin.write.mockImplementation((data: string) => {
        const pathBuf = Buffer.from(outputPath)
        const header = Buffer.alloc(5)
        header[0] = 0x02
        header.writeUInt32BE(pathBuf.length, 1)
        const response = Buffer.concat([header, pathBuf])
        process.nextTick(() => mockProc.stdout.emit('data', response))
        return true
      })

      await camera.captureImage(outputPath)

      expect(mockProc.stdin.write).toHaveBeenCalledWith(`capture ${outputPath}\n`)
    })

    it('rejects when capture fails', async () => {
      const mockProc = createMockChildProcess()
      mockSpawn.mockReturnValue(mockProc as unknown as ChildProcess)

      mockProc.stdin.write.mockImplementation(() => {
        // Build binary response: [0x03][4-byte BE zero length]
        const header = Buffer.alloc(5)
        header[0] = 0x03 // MSG_CAPTURE_FAIL
        header.writeUInt32BE(0, 1)
        process.nextTick(() => mockProc.stdout.emit('data', header))
        return true
      })

      await expect(camera.captureImage(outputPath)).rejects.toThrow()
    })

    it('rejects on capture timeout', async () => {
      const mockProc = createMockChildProcess()
      mockSpawn.mockReturnValue(mockProc as unknown as ChildProcess)

      // stdin.write does nothing — no response, so it should timeout
      mockProc.stdin.write.mockReturnValue(true)

      vi.useFakeTimers()
      const promise = camera.captureImage(outputPath)

      vi.advanceTimersByTime(15000)
      vi.useRealTimers()

      await expect(promise).rejects.toThrow()
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
      const mockProc = createMockChildProcess()
      mockSpawn.mockReturnValue(mockProc as unknown as ChildProcess)

      const frameCallback = vi.fn()

      camera.startPreviewStream(frameCallback)

      // Emit a MSG_PREVIEW frame: [0x01][4-byte BE length][JPEG data]
      const fakeFrame = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
      const header = Buffer.alloc(5)
      header[0] = 0x01 // MSG_PREVIEW
      header.writeUInt32BE(fakeFrame.length, 1)
      const message = Buffer.concat([header, fakeFrame])
      mockProc.stdout.emit('data', message)

      expect(frameCallback).toHaveBeenCalledTimes(1)
      expect(Buffer.isBuffer(frameCallback.mock.calls[0][0])).toBe(true)
      expect(frameCallback.mock.calls[0][0].length).toBe(fakeFrame.length)
    })

    it('returns a stop function that halts the stream', async () => {
      const mockProc = createMockChildProcess()
      mockSpawn.mockReturnValue(mockProc as unknown as ChildProcess)

      const frameCallback = vi.fn()

      const stop = camera.startPreviewStream(frameCallback)

      // Emit one frame
      const fakeFrame = Buffer.from([0xff, 0xd8])
      const header = Buffer.alloc(5)
      header[0] = 0x01
      header.writeUInt32BE(fakeFrame.length, 1)
      mockProc.stdout.emit('data', Buffer.concat([header, fakeFrame]))

      const countAtStop = frameCallback.mock.calls.length
      expect(countAtStop).toBe(1)

      // Mock kill to emit close
      mockProc.kill.mockImplementation(() => {
        // Find the 'close' handler and call it
        const closeCalls = mockProc.on.mock.calls.filter((c: [string, unknown]) => c[0] === 'close')
        for (const call of closeCalls) {
          ;(call[1] as (code: number | null) => void)(0)
        }
        return true
      })

      await stop()

      // Emit another frame after stop — should not be received
      mockProc.stdout.emit('data', Buffer.concat([header, fakeFrame]))

      expect(frameCallback.mock.calls.length).toBe(countAtStop)
    })

    it('handles multiple preview frames in sequence', async () => {
      const mockProc = createMockChildProcess()
      mockSpawn.mockReturnValue(mockProc as unknown as ChildProcess)

      const frameCallback = vi.fn()

      camera.startPreviewStream(frameCallback)

      // Emit two frames in one chunk
      const fakeFrame = Buffer.from([0xff, 0xd8])
      const header = Buffer.alloc(5)
      header[0] = 0x01
      header.writeUInt32BE(fakeFrame.length, 1)
      const oneMsg = Buffer.concat([header, fakeFrame])
      const twoMsgs = Buffer.concat([oneMsg, oneMsg])
      mockProc.stdout.emit('data', twoMsgs)

      expect(frameCallback).toHaveBeenCalledTimes(2)
    })
  })

  describe('error cases', () => {
    it('handles camera not found during capture', async () => {
      const mockProc = createMockChildProcess()
      mockSpawn.mockReturnValue(mockProc as unknown as ChildProcess)

      mockProc.stdin.write.mockImplementation(() => {
        const header = Buffer.alloc(5)
        header[0] = 0x03 // MSG_CAPTURE_FAIL
        header.writeUInt32BE(0, 1)
        process.nextTick(() => mockProc.stdout.emit('data', header))
        return true
      })

      await expect(camera.captureImage('/tmp/test.jpg')).rejects.toThrow()
    })

    it('handles USB disconnection during capture', async () => {
      const mockProc = createMockChildProcess()
      mockSpawn.mockReturnValue(mockProc as unknown as ChildProcess)

      mockProc.stdin.write.mockImplementation(() => {
        const header = Buffer.alloc(5)
        header[0] = 0x03
        header.writeUInt32BE(0, 1)
        process.nextTick(() => mockProc.stdout.emit('data', header))
        return true
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
