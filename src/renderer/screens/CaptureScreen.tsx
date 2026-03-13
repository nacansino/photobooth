import { useCallback, useRef, useState } from 'react'
import Countdown from '../components/Countdown'
import CancelDialog from '../components/CancelDialog'

const COUNTDOWN_SECONDS = 10

export default function CaptureScreen({
  totalShots,
  onComplete,
  onCancel,
}: {
  totalShots: number
  onComplete: (photos: string[]) => void
  onCancel: () => void
}) {
  const [shotIndex, setShotIndex] = useState(0)
  const [countdownKey, setCountdownKey] = useState(0)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const photosRef = useRef<string[]>([])

  const handleCountdownComplete = useCallback(async () => {
    const result = await window.api.camera.capture()
    photosRef.current = [...photosRef.current, result.path]

    if (shotIndex + 1 >= totalShots) {
      onComplete(photosRef.current)
    } else {
      setShotIndex((i) => i + 1)
      setCountdownKey((k) => k + 1)
    }
  }, [shotIndex, onComplete])

  return (
    <div className="relative h-full">
      {/* 16:9 guide overlay — dims area outside the crop zone */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-full h-full">
          {/* Top bar */}
          <div className="absolute inset-x-0 top-0 bg-black/50" style={{ height: 'calc((100% - 56.25vw) / 2)' }} />
          {/* Bottom bar */}
          <div className="absolute inset-x-0 bottom-0 bg-black/50" style={{ height: 'calc((100% - 56.25vw) / 2)' }} />
          {/* Center border */}
          <div
            className="absolute left-0 right-0 border-2 border-white/40"
            style={{ top: 'calc((100% - 56.25vw) / 2)', bottom: 'calc((100% - 56.25vw) / 2)' }}
          />
        </div>
      </div>

      <Countdown
        key={countdownKey}
        seconds={COUNTDOWN_SECONDS}
        onComplete={handleCountdownComplete}
      />

      <div className="absolute top-6 left-1/2 -translate-x-1/2">
        <span className="text-2xl text-white font-semibold drop-shadow">
          Photo {shotIndex + 1} of {totalShots}
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
