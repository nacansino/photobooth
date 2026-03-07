// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import QueuedScreen from '../QueuedScreen'

describe('QueuedScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('displays "Your photo is queued for printing" message', () => {
    render(<QueuedScreen onSkip={vi.fn()} onTimeout={vi.fn()} />)
    expect(screen.getByText(/your photo is queued for printing/i)).toBeInTheDocument()
  })

  it('shows a Skip button', () => {
    render(<QueuedScreen onSkip={vi.fn()} onTimeout={vi.fn()} />)
    const skipButton = screen.getByRole('button', { name: /skip/i })
    expect(skipButton).toBeInTheDocument()
  })

  it('calls onSkip when Skip is pressed', () => {
    const onSkip = vi.fn()
    render(<QueuedScreen onSkip={onSkip} onTimeout={vi.fn()} />)
    const skipButton = screen.getByRole('button', { name: /skip/i })
    fireEvent.click(skipButton)
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('auto-calls onTimeout after 10 seconds', () => {
    const onTimeout = vi.fn()
    render(<QueuedScreen onSkip={vi.fn()} onTimeout={onTimeout} />)

    expect(onTimeout).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(9_999)
    })
    expect(onTimeout).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('does not call onTimeout if unmounted before 10 seconds', () => {
    const onTimeout = vi.fn()
    const { unmount } = render(<QueuedScreen onSkip={vi.fn()} onTimeout={onTimeout} />)

    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    unmount()

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(onTimeout).not.toHaveBeenCalled()
  })
})
