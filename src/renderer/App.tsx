import { useCallback, useEffect, useState } from 'react'
import { useAppState } from './hooks/useAppState'
import LivePreview from './components/LivePreview'
import StartScreen from './screens/StartScreen'
import CaptureScreen from './screens/CaptureScreen'
import QueuedScreen from './screens/QueuedScreen'

export default function App() {
  const [state, dispatch] = useAppState()
  const [totalShots, setTotalShots] = useState(2)

  useEffect(() => {
    window.api.template.get().then((config) => {
      setTotalShots(config.slots.length)
    })
  }, [])

  // Start preview once and keep it running across all screens
  useEffect(() => {
    window.api.camera.startPreview()
    return () => {
      window.api.camera.stopPreview()
    }
  }, [])

  const handleStart = useCallback(() => {
    const sessionId = crypto.randomUUID()
    dispatch({ type: 'start', sessionId, totalShots })
  }, [dispatch, totalShots])

  const handleComplete = useCallback(
    (photos: string[]) => {
      for (const photo of photos) {
        dispatch({ type: 'captured', photoPath: photo })
      }
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

  function renderScreen() {
    switch (state.screen) {
      case 'idle':
        return <StartScreen onStart={handleStart} />
      case 'capturing':
        return <CaptureScreen totalShots={totalShots} onComplete={handleComplete} onCancel={handleCancel} />
      case 'queued':
        return <QueuedScreen photos={state.photos} onSkip={handleSkip} onTimeout={handleTimeout} />
    }
  }

  return (
    <div className="relative h-screen bg-black">
      <LivePreview />
      <div className="absolute inset-0">
        {renderScreen()}
      </div>
    </div>
  )
}
