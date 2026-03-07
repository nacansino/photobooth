import { useReducer } from 'react'
import type { AppState, AppAction } from '@shared/types'

export const initialState: AppState = {
  screen: 'idle',
  shotIndex: 0,
  sessionId: null,
  photos: [],
}

const TOTAL_SHOTS = 4

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'start':
      if (state.screen !== 'idle') return state
      return {
        screen: 'capturing',
        shotIndex: 0,
        sessionId: action.sessionId,
        photos: [],
      }

    case 'captured':
      if (state.screen !== 'capturing') return state
      const newPhotos = [...state.photos, action.photoPath]
      if (state.shotIndex + 1 >= TOTAL_SHOTS) {
        return { ...state, screen: 'queued', photos: newPhotos }
      }
      return { ...state, shotIndex: state.shotIndex + 1, photos: newPhotos }

    case 'skip':
    case 'timeout':
      if (state.screen !== 'queued') return state
      return { ...initialState }

    case 'cancel':
      if (state.screen !== 'capturing') return state
      return { ...initialState }

    default:
      return state
  }
}

export function useAppState() {
  return useReducer(appReducer, initialState)
}
