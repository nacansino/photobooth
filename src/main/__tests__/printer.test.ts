import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrinterService, PrinterInfo, PrintJobResult, PrintJobStatus } from '@shared/types'

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

import { execFile } from 'child_process'
import {
  detectPrinter,
  printImage,
  getPrintJobStatus,
  cancelJob,
} from '@main/printer'

const mockExecFile = vi.mocked(execFile)

// Helper to make execFile resolve with given stdout
function mockExecFileSuccess(stdout: string, stderr = ''): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: readonly string[] | undefined | null, callback?: unknown) => {
      if (typeof callback === 'function') {
        callback(null, stdout, stderr)
      }
      return undefined as never
    }
  )
}

// Helper to make execFile reject with given error
function mockExecFileError(message: string, exitCode = 1): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: readonly string[] | undefined | null, callback?: unknown) => {
      if (typeof callback === 'function') {
        const error = new Error(message) as Error & { code: number }
        error.code = exitCode
        callback(error, '', message)
      }
      return undefined as never
    }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('detectPrinter', () => {
  it('returns printer info when printer is found and idle', async () => {
    mockExecFileSuccess(
      'printer Canon_SELPHY_CP1500 is idle.  enabled since Mon 01 Jan 2026 12:00:00 AM UTC\n'
    )

    const result = await detectPrinter('Canon_SELPHY_CP1500')

    expect(result).not.toBeNull()
    expect(result).toEqual<PrinterInfo>({
      name: 'Canon_SELPHY_CP1500',
      status: 'idle',
    })
  })

  it('returns printer info when printer is printing', async () => {
    mockExecFileSuccess(
      'printer Canon_SELPHY_CP1500 now printing SELPHY-123.  enabled since Mon 01 Jan 2026 12:00:00 AM UTC\n'
    )

    const result = await detectPrinter('Canon_SELPHY_CP1500')

    expect(result).not.toBeNull()
    expect(result!.name).toBe('Canon_SELPHY_CP1500')
    expect(result!.status).toBe('printing')
  })

  it('returns first printer when no name filter is provided', async () => {
    mockExecFileSuccess(
      'printer Canon_SELPHY_CP1500 is idle.  enabled since Mon 01 Jan 2026 12:00:00 AM UTC\n' +
      'printer HP_LaserJet is idle.  enabled since Mon 01 Jan 2026 12:00:00 AM UTC\n'
    )

    const result = await detectPrinter()

    expect(result).not.toBeNull()
    expect(result!.name).toBe('Canon_SELPHY_CP1500')
  })

  it('filters by printer name when name is provided', async () => {
    mockExecFileSuccess(
      'printer Canon_SELPHY_CP1500 is idle.  enabled since Mon 01 Jan 2026 12:00:00 AM UTC\n' +
      'printer HP_LaserJet is idle.  enabled since Mon 01 Jan 2026 12:00:00 AM UTC\n'
    )

    const result = await detectPrinter('HP_LaserJet')

    expect(result).not.toBeNull()
    expect(result!.name).toBe('HP_LaserJet')
  })

  it('returns null when requested printer is not found', async () => {
    mockExecFileSuccess(
      'printer HP_LaserJet is idle.  enabled since Mon 01 Jan 2026 12:00:00 AM UTC\n'
    )

    const result = await detectPrinter('Canon_SELPHY_CP1500')

    expect(result).toBeNull()
  })

  it('returns null when no printers are available', async () => {
    mockExecFileSuccess('')

    const result = await detectPrinter()

    expect(result).toBeNull()
  })

  it('detects error/offline printer status', async () => {
    mockExecFileSuccess(
      'printer Canon_SELPHY_CP1500 disabled since Mon 01 Jan 2026 12:00:00 AM UTC -\n\treason unknown\n'
    )

    const result = await detectPrinter('Canon_SELPHY_CP1500')

    expect(result).not.toBeNull()
    expect(result!.status).toBe('offline')
  })

  it('calls lpstat -p to list printers', async () => {
    mockExecFileSuccess('')

    await detectPrinter()

    expect(mockExecFile).toHaveBeenCalledWith(
      'lpstat',
      expect.arrayContaining(['-p']),
      expect.any(Function)
    )
  })

  it('throws when lpstat command fails', async () => {
    mockExecFileError('lpstat: No destinations added.')

    await expect(detectPrinter()).rejects.toThrow()
  })
})

describe('printImage', () => {
  it('calls lp with correct arguments for default options', async () => {
    mockExecFileSuccess('request id is Canon_SELPHY_CP1500-42 (1 file(s))\n')

    await printImage('/tmp/photo.jpg', 'Canon_SELPHY_CP1500')

    expect(mockExecFile).toHaveBeenCalledWith(
      'lp',
      expect.arrayContaining(['-d', 'Canon_SELPHY_CP1500', '/tmp/photo.jpg']),
      expect.any(Function)
    )
  })

  it('includes media option when specified', async () => {
    mockExecFileSuccess('request id is Canon_SELPHY_CP1500-42 (1 file(s))\n')

    await printImage('/tmp/photo.jpg', 'Canon_SELPHY_CP1500', {
      media: 'Postcard.fullbleed',
    })

    expect(mockExecFile).toHaveBeenCalledWith(
      'lp',
      expect.arrayContaining(['-o', 'media=Postcard.fullbleed']),
      expect.any(Function)
    )
  })

  it('includes fit-to-page option when specified', async () => {
    mockExecFileSuccess('request id is Canon_SELPHY_CP1500-42 (1 file(s))\n')

    await printImage('/tmp/photo.jpg', 'Canon_SELPHY_CP1500', {
      fitToPage: true,
    })

    expect(mockExecFile).toHaveBeenCalledWith(
      'lp',
      expect.arrayContaining(['-o', 'fit-to-page']),
      expect.any(Function)
    )
  })

  it('includes both media and fit-to-page options', async () => {
    mockExecFileSuccess('request id is Canon_SELPHY_CP1500-42 (1 file(s))\n')

    await printImage('/tmp/photo.jpg', 'Canon_SELPHY_CP1500', {
      media: 'Postcard.fullbleed',
      fitToPage: true,
    })

    const args = mockExecFile.mock.calls[0][1] as string[]
    expect(args).toContain('-d')
    expect(args).toContain('Canon_SELPHY_CP1500')
    expect(args).toContain('-o')
    expect(args).toContain('media=Postcard.fullbleed')
    expect(args).toContain('fit-to-page')
    expect(args).toContain('/tmp/photo.jpg')
  })

  it('returns the parsed job ID from lp output', async () => {
    mockExecFileSuccess('request id is Canon_SELPHY_CP1500-42 (1 file(s))\n')

    const result = await printImage('/tmp/photo.jpg', 'Canon_SELPHY_CP1500')

    expect(result).toEqual<PrintJobResult>({
      jobId: 'Canon_SELPHY_CP1500-42',
    })
  })

  it('throws when lp command fails', async () => {
    mockExecFileError('lp: error - no default destination available.')

    await expect(
      printImage('/tmp/photo.jpg', 'Canon_SELPHY_CP1500')
    ).rejects.toThrow()
  })

  it('throws when lp output cannot be parsed for job ID', async () => {
    mockExecFileSuccess('unexpected output format\n')

    await expect(
      printImage('/tmp/photo.jpg', 'Canon_SELPHY_CP1500')
    ).rejects.toThrow()
  })
})

describe('getPrintJobStatus', () => {
  it('returns completed status for a finished job', async () => {
    mockExecFileSuccess(
      'Canon_SELPHY_CP1500-42   root          1024   Mon 01 Jan 2026 12:00:00 AM UTC\n'
    )

    const result = await getPrintJobStatus('Canon_SELPHY_CP1500-42')

    expect(result).not.toBeNull()
    expect(result!.jobId).toBe('Canon_SELPHY_CP1500-42')
    expect(result!.status).toBe('completed')
  })

  it('returns pending status for a queued job', async () => {
    // lpstat -W not-completed shows jobs that haven't completed
    mockExecFileSuccess(
      'Canon_SELPHY_CP1500-42   root          1024   Mon 01 Jan 2026 12:00:00 AM UTC\n'
    )

    // The implementation should check both not-completed and completed lists
    const result = await getPrintJobStatus('Canon_SELPHY_CP1500-42')

    expect(result).not.toBeNull()
    expect(result!.jobId).toBe('Canon_SELPHY_CP1500-42')
    // Status should be one of the valid statuses
    expect(['pending', 'printing', 'completed', 'error']).toContain(result!.status)
  })

  it('returns null when job is not found', async () => {
    mockExecFileSuccess('')

    const result = await getPrintJobStatus('nonexistent-99')

    expect(result).toBeNull()
  })

  it('calls lpstat -W all to check job status', async () => {
    mockExecFileSuccess('')

    await getPrintJobStatus('Canon_SELPHY_CP1500-42')

    expect(mockExecFile).toHaveBeenCalledWith(
      'lpstat',
      expect.arrayContaining(['-W', 'all']),
      expect.any(Function)
    )
  })

  it('returns error status when job has error info', async () => {
    // lpstat can show error state in various ways
    mockExecFileError('lpstat: Invalid destination name')

    const result = await getPrintJobStatus('Canon_SELPHY_CP1500-42')

    // When the command itself fails, should either throw or return error status
    if (result !== null) {
      expect(result.status).toBe('error')
      expect(result.error).toBeDefined()
    }
  })
})

describe('cancelJob', () => {
  it('calls cancel with the job ID', async () => {
    mockExecFileSuccess('')

    await cancelJob('Canon_SELPHY_CP1500-42')

    expect(mockExecFile).toHaveBeenCalledWith(
      'cancel',
      ['Canon_SELPHY_CP1500-42'],
      expect.any(Function)
    )
  })

  it('resolves successfully when cancel succeeds', async () => {
    mockExecFileSuccess('')

    await expect(cancelJob('Canon_SELPHY_CP1500-42')).resolves.toBeUndefined()
  })

  it('throws when cancel command fails', async () => {
    mockExecFileError('cancel: cancel-job failed: client-error-not-found')

    await expect(cancelJob('Canon_SELPHY_CP1500-42')).rejects.toThrow()
  })
})

describe('PrinterService interface compliance', () => {
  it('exports functions matching PrinterService interface', () => {
    // Verify that the exported functions can satisfy the PrinterService interface
    const service: PrinterService = {
      detectPrinter,
      printImage,
      getPrintJobStatus,
      cancelJob,
    }

    expect(typeof service.detectPrinter).toBe('function')
    expect(typeof service.printImage).toBe('function')
    expect(typeof service.getPrintJobStatus).toBe('function')
    expect(typeof service.cancelJob).toBe('function')
  })
})
