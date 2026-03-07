import sharp from 'sharp'
import path from 'path'

// Generate a placeholder 4x6 template background at 300 DPI (1800x1200)
// White background with gray rounded-rect frames where the 4 photos go

const WIDTH = 1800
const HEIGHT = 1200
const BORDER = 8
const RADIUS = 20

const slots = [
  { x: 50, y: 50, width: 825, height: 550 },
  { x: 925, y: 50, width: 825, height: 550 },
  { x: 50, y: 650, width: 825, height: 550 },
  { x: 925, y: 650, width: 825, height: 550 },
]

// Build SVG with photo slot frames
const slotFrames = slots
  .map(
    (s) =>
      `<rect x="${s.x - BORDER}" y="${s.y - BORDER}" width="${s.width + BORDER * 2}" height="${s.height + BORDER * 2}" rx="${RADIUS}" ry="${RADIUS}" fill="#e0e0e0" />
       <rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${RADIUS - 4}" ry="${RADIUS - 4}" fill="#333333" />`
  )
  .join('\n')

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="white" />
  ${slotFrames}
  <text x="${WIDTH / 2}" y="${HEIGHT - 20}" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#999">photobooth</text>
</svg>`

const outputPath = path.join(process.cwd(), 'templates', 'default-bg.png')

sharp(Buffer.from(svg))
  .png()
  .toFile(outputPath)
  .then(() => {
    console.log(`Template generated: ${outputPath}`)
  })
  .catch((err: unknown) => {
    console.error('Failed to generate template:', err)
    process.exit(1)
  })
