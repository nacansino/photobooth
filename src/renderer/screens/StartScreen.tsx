import { useEffect, useState } from 'react'

export default function StartScreen({ onStart }: { onStart: () => void }) {
  const [cameraReady, setCameraReady] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      while (!cancelled) {
        try {
          const info = await window.api.camera.detect()
          if (!cancelled) setCameraReady(info !== null)
        } catch {
          if (!cancelled) setCameraReady(false)
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
    }

    poll()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      {cameraReady === false && (
        <div className="text-red-400 text-2xl font-semibold animate-pulse">
          No camera detected
        </div>
      )}
      <button
        onClick={onStart}
        disabled={!cameraReady}
        className="rounded-full w-72 h-72 bg-white text-black text-6xl font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Start
      </button>
    </div>
  )
}
