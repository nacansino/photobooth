// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import StartScreen from '../StartScreen'

// Mock window.api.camera.detect
beforeEach(() => {
  Object.defineProperty(window, 'api', {
    value: {
      camera: {
        detect: vi.fn().mockResolvedValue({ model: 'Canon EOS M100', port: 'usb:001,004' }),
      },
    },
    writable: true,
    configurable: true,
  })
})

describe('StartScreen', () => {
  it('renders a large circular Start button', async () => {
    render(<StartScreen onStart={vi.fn()} />)
    const button = screen.getByRole('button', { name: /start/i })
    expect(button).toBeInTheDocument()
    expect(button).toBeVisible()
  })

  it('calls onStart callback when button is clicked after camera detected', async () => {
    const onStart = vi.fn()
    render(<StartScreen onStart={onStart} />)
    const button = screen.getByRole('button', { name: /start/i })

    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })

    fireEvent.click(button)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('disables Start button when no camera detected', async () => {
    window.api.camera.detect = vi.fn().mockResolvedValue(null)
    render(<StartScreen onStart={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start/i })).toBeDisabled()
    })
  })

  it('shows "No camera detected" when camera is missing', async () => {
    window.api.camera.detect = vi.fn().mockResolvedValue(null)
    render(<StartScreen onStart={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/no camera detected/i)).toBeInTheDocument()
    })
  })

  it('button has circular styling', () => {
    render(<StartScreen onStart={vi.fn()} />)
    const button = screen.getByRole('button', { name: /start/i })
    expect(button.className).toMatch(/rounded-full/)
  })
})
