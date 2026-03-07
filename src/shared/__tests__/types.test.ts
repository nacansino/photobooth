import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS } from '../types'

describe('IPC_CHANNELS', () => {
  it('defines all required channels', () => {
    expect(IPC_CHANNELS.CAMERA_START_PREVIEW).toBe('camera:start-preview')
    expect(IPC_CHANNELS.CAMERA_STOP_PREVIEW).toBe('camera:stop-preview')
    expect(IPC_CHANNELS.CAMERA_FRAME).toBe('camera:frame')
    expect(IPC_CHANNELS.CAMERA_CAPTURE).toBe('camera:capture')
    expect(IPC_CHANNELS.CAMERA_CAPTURED).toBe('camera:captured')
    expect(IPC_CHANNELS.CAMERA_DETECT).toBe('camera:detect')
    expect(IPC_CHANNELS.PRINT_QUEUE).toBe('print:queue')
    expect(IPC_CHANNELS.PRINT_STATUS).toBe('print:status')
    expect(IPC_CHANNELS.PRINTER_DETECT).toBe('printer:detect')
  })
})
