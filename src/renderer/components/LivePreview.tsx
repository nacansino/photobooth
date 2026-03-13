import { useEffect, useRef } from 'react'

export default function LivePreview({ onReady, readyKey }: { onReady?: () => void, readyKey?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readyFired = useRef(false)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // Reset readyFired when readyKey changes (after each capture)
  useEffect(() => {
    readyFired.current = false
  }, [readyKey])

  useEffect(() => {
    let decoding = false

    const cleanup = window.api.camera.onFrame((frameBase64: string) => {
      const canvas = canvasRef.current
      if (!canvas) return
      if (decoding) return // drop frame — previous still decoding

      decoding = true
      const img = new Image()
      img.onload = () => {
        decoding = false
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        // Only resize canvas when dimensions change (avoids clearing the buffer)
        if (canvas.width !== img.width || canvas.height !== img.height) {
          canvas.width = img.width
          canvas.height = img.height
        }
        ctx.drawImage(img, 0, 0)

        if (!readyFired.current) {
          readyFired.current = true
          onReadyRef.current?.()
        }
      }
      img.onerror = () => {
        decoding = false
      }
      img.src = `data:image/jpeg;base64,${frameBase64}`
    })

    return cleanup
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full object-cover transform -scale-x-100"
      style={{ imageRendering: 'auto' }}
    />
  )
}
