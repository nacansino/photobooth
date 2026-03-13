// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { appReducer, initialState } from '../useAppState'
import type { AppState, AppAction } from '@shared/types'

describe('appReducer', () => {
  it('has initial state of idle screen', () => {
    expect(initialState.screen).toBe('idle')
    expect(initialState.shotIndex).toBe(0)
    expect(initialState.sessionId).toBeNull()
    expect(initialState.photos).toEqual([])
  })

  it('start action transitions from idle to capturing with shotIndex 0', () => {
    const state = appReducer(initialState, { type: 'start', sessionId: 'session-abc', totalShots: 4 })
    expect(state.screen).toBe('capturing')
    expect(state.shotIndex).toBe(0)
    expect(state.sessionId).toBe('session-abc')
    expect(state.photos).toEqual([])
  })

  it('captured action increments shotIndex from 0 to 1', () => {
    const capturing: AppState = {
      screen: 'capturing',
      shotIndex: 0,
      sessionId: 'session-abc',
      photos: [],
      totalShots: 4,
    }
    const state = appReducer(capturing, { type: 'captured', photoPath: '/tmp/shot-1.jpg' })
    expect(state.screen).toBe('capturing')
    expect(state.shotIndex).toBe(1)
    expect(state.photos).toEqual(['/tmp/shot-1.jpg'])
  })

  it('captured action increments shotIndex from 1 to 2', () => {
    const capturing: AppState = {
      screen: 'capturing',
      shotIndex: 1,
      sessionId: 'session-abc',
      photos: ['/tmp/shot-1.jpg'],
      totalShots: 4,
    }
    const state = appReducer(capturing, { type: 'captured', photoPath: '/tmp/shot-2.jpg' })
    expect(state.screen).toBe('capturing')
    expect(state.shotIndex).toBe(2)
    expect(state.photos).toEqual(['/tmp/shot-1.jpg', '/tmp/shot-2.jpg'])
  })

  it('captured action increments shotIndex from 2 to 3', () => {
    const capturing: AppState = {
      screen: 'capturing',
      shotIndex: 2,
      sessionId: 'session-abc',
      photos: ['/tmp/shot-1.jpg', '/tmp/shot-2.jpg'],
      totalShots: 4,
    }
    const state = appReducer(capturing, { type: 'captured', photoPath: '/tmp/shot-3.jpg' })
    expect(state.screen).toBe('capturing')
    expect(state.shotIndex).toBe(3)
    expect(state.photos).toEqual(['/tmp/shot-1.jpg', '/tmp/shot-2.jpg', '/tmp/shot-3.jpg'])
  })

  it('captured when shotIndex === 3 transitions to queued', () => {
    const capturing: AppState = {
      screen: 'capturing',
      shotIndex: 3,
      sessionId: 'session-abc',
      photos: ['/tmp/shot-1.jpg', '/tmp/shot-2.jpg', '/tmp/shot-3.jpg'],
      totalShots: 4,
    }
    const state = appReducer(capturing, { type: 'captured', photoPath: '/tmp/shot-4.jpg' })
    expect(state.screen).toBe('queued')
    expect(state.photos).toEqual([
      '/tmp/shot-1.jpg',
      '/tmp/shot-2.jpg',
      '/tmp/shot-3.jpg',
      '/tmp/shot-4.jpg',
    ])
  })

  it('skip action from queued transitions to idle', () => {
    const queued: AppState = {
      screen: 'queued',
      shotIndex: 4,
      sessionId: 'session-abc',
      photos: ['/tmp/shot-1.jpg', '/tmp/shot-2.jpg', '/tmp/shot-3.jpg', '/tmp/shot-4.jpg'],
      totalShots: 4,
    }
    const state = appReducer(queued, { type: 'skip' })
    expect(state.screen).toBe('idle')
    expect(state.shotIndex).toBe(0)
    expect(state.sessionId).toBeNull()
    expect(state.photos).toEqual([])
  })

  it('timeout action from queued transitions to idle', () => {
    const queued: AppState = {
      screen: 'queued',
      shotIndex: 4,
      sessionId: 'session-abc',
      photos: ['/tmp/shot-1.jpg', '/tmp/shot-2.jpg', '/tmp/shot-3.jpg', '/tmp/shot-4.jpg'],
      totalShots: 4,
    }
    const state = appReducer(queued, { type: 'timeout' })
    expect(state.screen).toBe('idle')
    expect(state.shotIndex).toBe(0)
    expect(state.sessionId).toBeNull()
    expect(state.photos).toEqual([])
  })

  it('cancel action from capturing transitions to idle and resets', () => {
    const capturing: AppState = {
      screen: 'capturing',
      shotIndex: 2,
      sessionId: 'session-abc',
      photos: ['/tmp/shot-1.jpg', '/tmp/shot-2.jpg'],
      totalShots: 4,
    }
    const state = appReducer(capturing, { type: 'cancel' })
    expect(state.screen).toBe('idle')
    expect(state.shotIndex).toBe(0)
    expect(state.sessionId).toBeNull()
    expect(state.photos).toEqual([])
  })

  // Invalid transitions are no-ops
  it('start from capturing is a no-op', () => {
    const capturing: AppState = {
      screen: 'capturing',
      shotIndex: 1,
      sessionId: 'session-abc',
      photos: ['/tmp/shot-1.jpg'],
      totalShots: 4,
    }
    const state = appReducer(capturing, { type: 'start', sessionId: 'session-new', totalShots: 4 })
    expect(state).toEqual(capturing)
  })

  it('start from queued is a no-op', () => {
    const queued: AppState = {
      screen: 'queued',
      shotIndex: 4,
      sessionId: 'session-abc',
      photos: ['/tmp/shot-1.jpg', '/tmp/shot-2.jpg', '/tmp/shot-3.jpg', '/tmp/shot-4.jpg'],
      totalShots: 4,
    }
    const state = appReducer(queued, { type: 'start', sessionId: 'session-new', totalShots: 4 })
    expect(state).toEqual(queued)
  })

  it('captured from idle is a no-op', () => {
    const state = appReducer(initialState, { type: 'captured', photoPath: '/tmp/shot.jpg' })
    expect(state).toEqual(initialState)
  })

  it('skip from idle is a no-op', () => {
    const state = appReducer(initialState, { type: 'skip' })
    expect(state).toEqual(initialState)
  })

  it('cancel from idle is a no-op', () => {
    const state = appReducer(initialState, { type: 'cancel' })
    expect(state).toEqual(initialState)
  })

  it('timeout from capturing is a no-op', () => {
    const capturing: AppState = {
      screen: 'capturing',
      shotIndex: 1,
      sessionId: 'session-abc',
      photos: ['/tmp/shot-1.jpg'],
      totalShots: 4,
    }
    const state = appReducer(capturing, { type: 'timeout' })
    expect(state).toEqual(capturing)
  })

  it('full flow: idle → capture 4 shots → queued → idle', () => {
    let state: AppState = initialState

    // Start session
    state = appReducer(state, { type: 'start', sessionId: 'session-full', totalShots: 4 })
    expect(state.screen).toBe('capturing')

    // Capture 4 shots
    for (let i = 0; i < 4; i++) {
      state = appReducer(state, { type: 'captured', photoPath: `/tmp/shot-${i + 1}.jpg` })
    }
    expect(state.screen).toBe('queued')
    expect(state.photos).toHaveLength(4)

    // Return to idle
    state = appReducer(state, { type: 'skip' })
    expect(state.screen).toBe('idle')
    expect(state.photos).toEqual([])
    expect(state.sessionId).toBeNull()
  })
})
