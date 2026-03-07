import { useEffect, useRef } from 'react'

export default function QueuedScreen({
  onSkip,
  onTimeout,
}: {
  onSkip: () => void
  onTimeout: () => void
}) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timeoutRef.current = setTimeout(onTimeout, 10_000)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [onTimeout])

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black gap-8">
      <p className="text-2xl text-white text-center px-8">
        Your photo is queued for printing, please wait...
      </p>
      <button
        onClick={onSkip}
        className="rounded-full px-8 py-4 bg-white text-black text-xl font-semibold active:scale-95 transition-transform"
      >
        Skip
      </button>
    </div>
  )
}
