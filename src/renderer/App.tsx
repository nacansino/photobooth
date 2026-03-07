import { useCallback } from 'react'
import { useAppState } from './hooks/useAppState'
import StartScreen from './screens/StartScreen'
import CaptureScreen from './screens/CaptureScreen'
import QueuedScreen from './screens/QueuedScreen'

export default function App() {
  const [state, dispatch] = useAppState()

  const handleStart = useCallback(() => {
    const sessionId = crypto.randomUUID()
    dispatch({ type: 'start', sessionId })
  }, [dispatch])

  const handleComplete = useCallback(
    (photos: string[]) => {
      // Dispatch captured for the last photo to transition to queued
      // Note: CaptureScreen already collected all photos via its own state,
      // but we need to sync them into the app reducer
      for (const photo of photos) {
        dispatch({ type: 'captured', photoPath: photo })
      }
      // Queue for printing
      if (state.sessionId) {
        window.api.printer.queue(state.sessionId)
      }
    },
    [dispatch, state.sessionId]
  )

  const handleCancel = useCallback(() => {
    dispatch({ type: 'cancel' })
  }, [dispatch])

  const handleSkip = useCallback(() => {
    dispatch({ type: 'skip' })
  }, [dispatch])

  const handleTimeout = useCallback(() => {
    dispatch({ type: 'timeout' })
  }, [dispatch])

  switch (state.screen) {
    case 'idle':
      return <StartScreen onStart={handleStart} />
    case 'capturing':
      return <CaptureScreen onComplete={handleComplete} onCancel={handleCancel} />
    case 'queued':
      return <QueuedScreen onSkip={handleSkip} onTimeout={handleTimeout} />
  }
}
