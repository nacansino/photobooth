import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

// Generate a placeholder template background from default.json config

const configPath = path.join(process.cwd(), 'templates', 'default.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

const WIDTH = config.width
const HEIGHT = config.height
const BORDER = 8
const RADIUS = 20

const slotFrames = config.slots
  .map(
    (s: { x: number; y: number; width: number; height: number }) =>
      `<rect x="${s.x - BORDER}" y="${s.y - BORDER}" width="${s.width + BORDER * 2}" height="${s.height + BORDER * 2}" rx="${RADIUS}" ry="${RADIUS}" fill="#e0e0e0" />
       <rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${RADIUS - 4}" ry="${RADIUS - 4}" fill="#333333" />`
  )
  .join('\n')

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="white" />
  ${slotFrames}
  <text x="${WIDTH / 2}" y="${HEIGHT - 30}" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#999">photobooth</text>
</svg>`

const outputPath = path.join(process.cwd(), 'templates', 'default-bg.png')

sharp(Buffer.from(svg))
  .png()
  .toFile(outputPath)
  .then(() => {
    console.log(`Template generated: ${outputPath} (${WIDTH}×${HEIGHT})`)
  })
  .catch((err: unknown) => {
    console.error('Failed to generate template:', err)
    process.exit(1)
  })
