import { useCallback, useEffect, useRef, useState } from 'react'
import Countdown from '../components/Countdown'
import LivePreview from '../components/LivePreview'
import CancelDialog from '../components/CancelDialog'

const TOTAL_SHOTS = 4
const COUNTDOWN_SECONDS = 10

export default function CaptureScreen({
  onComplete,
  onCancel,
}: {
  onComplete: (photos: string[]) => void
  onCancel: () => void
}) {
  const [shotIndex, setShotIndex] = useState(0)
  const [countdownKey, setCountdownKey] = useState(0)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const photosRef = useRef<string[]>([])

  useEffect(() => {
    window.api.camera.startPreview()
    return () => {
      window.api.camera.stopPreview()
    }
  }, [])

  const handleCountdownComplete = useCallback(async () => {
    const result = await window.api.camera.capture()
    photosRef.current = [...photosRef.current, result.path]

    if (shotIndex + 1 >= TOTAL_SHOTS) {
      onComplete(photosRef.current)
    } else {
      setShotIndex((i) => i + 1)
      setCountdownKey((k) => k + 1)
    }
  }, [shotIndex, onComplete])

  return (
    <div className="relative h-screen bg-black">
      <LivePreview />

      <Countdown
        key={countdownKey}
        seconds={COUNTDOWN_SECONDS}
        onComplete={handleCountdownComplete}
      />

      <div className="absolute top-6 left-1/2 -translate-x-1/2">
        <span className="text-2xl text-white font-semibold drop-shadow">
          Photo {shotIndex + 1} of {TOTAL_SHOTS}
        </span>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <button
          onClick={() => setShowCancelDialog(true)}
          className="rounded-full px-6 py-3 bg-gray-800/80 text-white text-lg active:scale-95 transition-transform"
        >
          Cancel
        </button>
      </div>

      <CancelDialog
        open={showCancelDialog}
        onConfirm={onCancel}
        onDismiss={() => setShowCancelDialog(false)}
      />
    </div>
  )
}
