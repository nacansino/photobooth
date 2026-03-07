import { execFile } from 'child_process'
import type { PrinterInfo, PrintJobResult, PrintJobStatus, PrintOptions } from '@shared/types'

function parsePrinterStatus(line: string): 'idle' | 'printing' | 'error' | 'offline' {
  if (line.includes('now printing')) return 'printing'
  if (line.includes('is idle')) return 'idle'
  if (line.includes('disabled')) return 'offline'
  return 'error'
}

export function detectPrinter(name?: string): Promise<PrinterInfo | null> {
  return new Promise((resolve, reject) => {
    execFile('lpstat', ['-p'], (error, stdout) => {
      if (error) {
        reject(error)
        return
      }

      const lines = String(stdout).split('\n')
      for (const line of lines) {
        const match = line.match(/^printer\s+(\S+)\s+(.*)$/)
        if (!match) continue

        const printerName = match[1]
        const rest = match[2]

        if (name && printerName !== name) continue

        resolve({
          name: printerName,
          status: parsePrinterStatus(rest),
        })
        return
      }

      resolve(null)
    })
  })
}

export function printImage(
  imagePath: string,
  printerName: string,
  options?: PrintOptions,
): Promise<PrintJobResult> {
  return new Promise((resolve, reject) => {
    const args = ['-d', printerName]

    if (options?.media) {
      args.push('-o', `media=${options.media}`)
    }
    if (options?.fitToPage) {
      args.push('-o', 'fit-to-page')
    }

    args.push(imagePath)

    execFile('lp', args, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }

      const match = String(stdout).match(/request id is (\S+)/)
      if (!match) {
        reject(new Error('Could not parse job ID from lp output'))
        return
      }

      resolve({ jobId: match[1] })
    })
  })
}

export function getPrintJobStatus(jobId: string): Promise<PrintJobStatus | null> {
  return new Promise((resolve) => {
    execFile('lpstat', ['-W', 'all'], (error, stdout, stderr) => {
      if (error) {
        resolve({
          jobId,
          status: 'error',
          error: String(stderr || error.message),
        })
        return
      }

      const lines = String(stdout).split('\n')
      for (const line of lines) {
        if (line.startsWith(jobId)) {
          resolve({
            jobId,
            status: 'completed',
          })
          return
        }
      }

      resolve(null)
    })
  })
}

export function cancelJob(jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('cancel', [jobId], (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}
