import { useEffect, useRef } from 'react'

export default function LivePreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cleanup = window.api.camera.onFrame((frameBase64: string) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const img = new Image()
      img.onload = () => {
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)
      }
      img.src = `data:image/jpeg;base64,${frameBase64}`
    })

    return cleanup
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full object-contain transform -scale-x-100"
    />
  )
}
