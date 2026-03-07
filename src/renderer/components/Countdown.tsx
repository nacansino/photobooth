import { useEffect, useState } from 'react'

export default function Countdown({
  seconds,
  onComplete,
}: {
  seconds: number
  onComplete: () => void
}) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    setRemaining(seconds)
  }, [seconds])

  useEffect(() => {
    if (remaining <= 0) {
      onComplete()
      return
    }
    const timer = setInterval(() => {
      setRemaining((r) => r - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [remaining, onComplete])

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span className="text-9xl font-bold text-white drop-shadow-lg">
        {remaining}
      </span>
    </div>
  )
}
