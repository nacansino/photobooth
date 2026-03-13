import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

vi.mock('electron-log/main', () => ({
  default: {
    initialize: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    transports: { file: {} },
  },
}))
