import fs from 'fs/promises'
import sharp from 'sharp'
import type { TemplateConfig } from '@shared/types'

export async function loadTemplate(configPath: string): Promise<TemplateConfig> {
  const raw = await fs.readFile(configPath, 'utf-8')
  const config = JSON.parse(raw) as Record<string, unknown>

  if (typeof config.width !== 'number') {
    throw new Error('Template missing required field: width')
  }
  if (typeof config.height !== 'number') {
    throw new Error('Template missing required field: height')
  }
  if (typeof config.dpi !== 'number') {
    throw new Error('Template missing required field: dpi')
  }
  if (typeof config.background !== 'string') {
    throw new Error('Template missing required field: background')
  }
  if (!Array.isArray(config.slots) || config.slots.length !== 4) {
    throw new Error('Template must have exactly 4 slots')
  }

  for (const slot of config.slots as Record<string, unknown>[]) {
    if (
      typeof slot.x !== 'number' ||
      typeof slot.y !== 'number' ||
      typeof slot.width !== 'number' ||
      typeof slot.height !== 'number'
    ) {
      throw new Error('Each slot must have x, y, width, and height')
    }
  }

  return config as unknown as TemplateConfig
}

export async function compositePhotos(
  templateConfig: TemplateConfig,
  photoPaths: [string, string, string, string],
  outputPath: string,
): Promise<string> {
  const overlays: sharp.OverlayOptions[] = []

  for (let i = 0; i < 4; i++) {
    const slot = templateConfig.slots[i]
    const resized = await resizeToFit(photoPaths[i], slot.width, slot.height)
    overlays.push({
      input: resized,
      left: slot.x,
      top: slot.y,
    })
  }

  await sharp(templateConfig.background)
    .composite(overlays)
    .jpeg({ quality: 95 })
    .toFile(outputPath)

  return outputPath
}

export async function resizeToFit(
  imagePath: string,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(imagePath)
    .resize(width, height, { fit: 'cover' })
    .toBuffer()
}
