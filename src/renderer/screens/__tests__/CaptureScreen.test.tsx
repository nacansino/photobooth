// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import CaptureScreen from '../CaptureScreen'
import type { ElectronAPI, CaptureResult } from '@shared/types'

function createMockApi(): ElectronAPI {
  return {
    camera: {
      detect: vi.fn().mockResolvedValue({ model: 'Canon EOS M100', port: 'usb:001,004' }),
      startPreview: vi.fn().mockResolvedValue(undefined),
      stopPreview: vi.fn().mockResolvedValue(undefined),
      onFrame: vi.fn().mockReturnValue(vi.fn()),
      capture: vi.fn().mockResolvedValue({ index: 0, path: '/tmp/shot.jpg' } satisfies CaptureResult),
    },
    printer: {
      detect: vi.fn().mockResolvedValue(null),
      queue: vi.fn().mockResolvedValue(undefined),
      onStatus: vi.fn().mockReturnValue(vi.fn()),
    },
  }
}

describe('CaptureScreen', () => {
  let mockApi: ElectronAPI

  beforeEach(() => {
    vi.useFakeTimers()
    mockApi = createMockApi()
    window.api = mockApi
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('displays a countdown starting at 10', () => {
    render(<CaptureScreen onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('countdown decrements each second', () => {
    render(<CaptureScreen onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('10')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('9')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('shows the current shot number (e.g., "Photo 1 of 4")', () => {
    render(<CaptureScreen onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText(/photo 1 of 4/i)).toBeInTheDocument()
  })

  it('displays a live preview area', () => {
    render(<CaptureScreen onComplete={vi.fn()} onCancel={vi.fn()} />)
    // Expect a canvas or img element for the live preview
    const preview = document.querySelector('canvas') ?? document.querySelector('img[data-testid="live-preview"]')
    expect(preview).toBeInTheDocument()
  })

  it('shows a cancel button', () => {
    render(<CaptureScreen onComplete={vi.fn()} onCancel={vi.fn()} />)
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    expect(cancelButton).toBeInTheDocument()
  })

  it('calls onCancel when cancel is clicked and confirmed', () => {
    const onCancel = vi.fn()
    render(<CaptureScreen onComplete={vi.fn()} onCancel={onCancel} />)

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    // A confirmation dialog should appear
    const confirmButton = screen.getByRole('button', { name: /confirm|yes/i })
    fireEvent.click(confirmButton)

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not call onCancel if cancel is dismissed', () => {
    const onCancel = vi.fn()
    render(<CaptureScreen onComplete={vi.fn()} onCancel={onCancel} />)

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    // Dismiss the confirmation
    const dismissButton = screen.getByRole('button', { name: /no|go back|dismiss/i })
    fireEvent.click(dismissButton)

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('triggers capture when countdown reaches 0', async () => {
    render(<CaptureScreen onComplete={vi.fn()} onCancel={vi.fn()} />)

    // Advance 10 seconds to reach 0
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(mockApi.camera.capture).toHaveBeenCalled()
  })

  it('calls onComplete with photos after all 4 shots are done', async () => {
    const onComplete = vi.fn()
    const captureMock = vi.fn()

    // Mock capture to return successive paths
    for (let i = 0; i < 4; i++) {
      captureMock.mockResolvedValueOnce({ index: i, path: `/tmp/shot-${i + 1}.jpg` } satisfies CaptureResult)
    }
    mockApi.camera.capture = captureMock

    render(<CaptureScreen onComplete={onComplete} onCancel={vi.fn()} />)

    // Simulate 4 rounds of countdown (10s each)
    for (let shot = 0; shot < 4; shot++) {
      await act(async () => {
        vi.advanceTimersByTime(10_000)
      })
      // Allow capture promise to resolve
      await act(async () => {
        await Promise.resolve()
      })
    }

    expect(onComplete).toHaveBeenCalledWith([
      '/tmp/shot-1.jpg',
      '/tmp/shot-2.jpg',
      '/tmp/shot-3.jpg',
      '/tmp/shot-4.jpg',
    ])
  })

  it('advances shot number after each capture', async () => {
    const captureMock = vi.fn()
    for (let i = 0; i < 4; i++) {
      captureMock.mockResolvedValueOnce({ index: i, path: `/tmp/shot-${i + 1}.jpg` } satisfies CaptureResult)
    }
    mockApi.camera.capture = captureMock

    render(<CaptureScreen onComplete={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText(/photo 1 of 4/i)).toBeInTheDocument()

    // Complete first countdown and capture
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText(/photo 2 of 4/i)).toBeInTheDocument()
  })

  it('starts camera preview on mount', () => {
    render(<CaptureScreen onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(mockApi.camera.startPreview).toHaveBeenCalled()
  })

  it('stops camera preview on unmount', () => {
    const { unmount } = render(<CaptureScreen onComplete={vi.fn()} onCancel={vi.fn()} />)
    unmount()
    expect(mockApi.camera.stopPreview).toHaveBeenCalled()
  })
})
