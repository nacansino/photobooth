// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import StartScreen from '../StartScreen'

describe('StartScreen', () => {
  it('renders a large circular Start button', () => {
    render(<StartScreen onStart={vi.fn()} />)
    const button = screen.getByRole('button', { name: /start/i })
    expect(button).toBeInTheDocument()
    expect(button).toBeVisible()
  })

  it('calls onStart callback when button is clicked', () => {
    const onStart = vi.fn()
    render(<StartScreen onStart={onStart} />)
    const button = screen.getByRole('button', { name: /start/i })
    fireEvent.click(button)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('button has circular styling', () => {
    render(<StartScreen onStart={vi.fn()} />)
    const button = screen.getByRole('button', { name: /start/i })
    // Button should have rounded-full class for circular appearance
    expect(button.className).toMatch(/rounded-full/)
  })
})
