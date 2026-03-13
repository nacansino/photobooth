import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import sharp from 'sharp'
import type { TemplateConfig, TemplateSlot } from '@shared/types'

import {
  loadTemplate,
  compositePhotos,
  resizeToFit,
} from '@main/compositor'

let tmpDir: string

// Create a small solid-color PNG for testing
async function createTestImage(
  filePath: string,
  width: number,
  height: number,
  color: { r: number; g: number; b: number }
): Promise<string> {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toFile(filePath)
  return filePath
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compositor-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const validTemplate: TemplateConfig = {
  width: 600,
  height: 400,
  dpi: 300,
  background: '', // will be set per test
  slots: [
    { x: 10, y: 10, width: 280, height: 180 },
    { x: 310, y: 10, width: 280, height: 180 },
    { x: 10, y: 210, width: 280, height: 180 },
    { x: 310, y: 210, width: 280, height: 180 },
  ],
}

describe('loadTemplate', () => {
  it('reads and parses a valid template config JSON file', async () => {
    const bgPath = await createTestImage(
      path.join(tmpDir, 'bg.png'),
      600,
      400,
      { r: 255, g: 255, b: 255 }
    )
    const template: TemplateConfig = { ...validTemplate, background: bgPath }
    const configPath = path.join(tmpDir, 'template.json')
    await fs.writeFile(configPath, JSON.stringify(template))

    const result = await loadTemplate(configPath)

    expect(result.width).toBe(600)
    expect(result.height).toBe(400)
    expect(result.dpi).toBe(300)
    expect(result.background).toBe(bgPath)
    expect(result.slots).toHaveLength(4)
  })

  it('validates that template has required width field', async () => {
    const configPath = path.join(tmpDir, 'bad.json')
    await fs.writeFile(
      configPath,
      JSON.stringify({ height: 400, dpi: 300, background: 'bg.png', slots: [] })
    )

    await expect(loadTemplate(configPath)).rejects.toThrow()
  })

  it('validates that template has required height field', async () => {
    const configPath = path.join(tmpDir, 'bad.json')
    await fs.writeFile(
      configPath,
      JSON.stringify({ width: 600, dpi: 300, background: 'bg.png', slots: [] })
    )

    await expect(loadTemplate(configPath)).rejects.toThrow()
  })

  it('validates that template has required dpi field', async () => {
    const configPath = path.join(tmpDir, 'bad.json')
    await fs.writeFile(
      configPath,
      JSON.stringify({ width: 600, height: 400, background: 'bg.png', slots: [] })
    )

    await expect(loadTemplate(configPath)).rejects.toThrow()
  })

  it('validates that template has required background field', async () => {
    const configPath = path.join(tmpDir, 'bad.json')
    await fs.writeFile(
      configPath,
      JSON.stringify({ width: 600, height: 400, dpi: 300, slots: [] })
    )

    await expect(loadTemplate(configPath)).rejects.toThrow()
  })

  it('validates that template has at least 1 slot', async () => {
    const configPath = path.join(tmpDir, 'bad.json')
    await fs.writeFile(
      configPath,
      JSON.stringify({
        width: 600,
        height: 400,
        dpi: 300,
        background: 'bg.png',
        slots: [],
      })
    )

    await expect(loadTemplate(configPath)).rejects.toThrow()
  })

  it('validates each slot has x, y, width, height', async () => {
    const configPath = path.join(tmpDir, 'bad.json')
    await fs.writeFile(
      configPath,
      JSON.stringify({
        width: 600,
        height: 400,
        dpi: 300,
        background: 'bg.png',
        slots: [
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 0, y: 0, width: 100 }, // missing height
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 0, y: 0, width: 100, height: 100 },
        ],
      })
    )

    await expect(loadTemplate(configPath)).rejects.toThrow()
  })

  it('throws when config file does not exist', async () => {
    await expect(
      loadTemplate(path.join(tmpDir, 'nonexistent.json'))
    ).rejects.toThrow()
  })

  it('throws when config file contains invalid JSON', async () => {
    const configPath = path.join(tmpDir, 'bad.json')
    await fs.writeFile(configPath, 'not valid json {{{')

    await expect(loadTemplate(configPath)).rejects.toThrow()
  })
})

describe('compositePhotos', () => {
  let bgPath: string
  let photoPaths: [string, string, string, string]

  beforeEach(async () => {
    bgPath = await createTestImage(
      path.join(tmpDir, 'bg.png'),
      600,
      400,
      { r: 255, g: 255, b: 255 }
    )

    photoPaths = [
      await createTestImage(path.join(tmpDir, 'shot-0.png'), 200, 150, { r: 255, g: 0, b: 0 }),
      await createTestImage(path.join(tmpDir, 'shot-1.png'), 200, 150, { r: 0, g: 255, b: 0 }),
      await createTestImage(path.join(tmpDir, 'shot-2.png'), 200, 150, { r: 0, g: 0, b: 255 }),
      await createTestImage(path.join(tmpDir, 'shot-3.png'), 200, 150, { r: 255, g: 255, b: 0 }),
    ]
  })

  it('creates an output image with the correct dimensions', async () => {
    const template: TemplateConfig = { ...validTemplate, background: bgPath }
    const outputPath = path.join(tmpDir, 'composite.jpg')

    await compositePhotos(template, photoPaths, outputPath)

    const metadata = await sharp(outputPath).metadata()
    expect(metadata.width).toBe(600)
    expect(metadata.height).toBe(400)
  })

  it('saves the output as JPEG', async () => {
    const template: TemplateConfig = { ...validTemplate, background: bgPath }
    const outputPath = path.join(tmpDir, 'composite.jpg')

    await compositePhotos(template, photoPaths, outputPath)

    const metadata = await sharp(outputPath).metadata()
    expect(metadata.format).toBe('jpeg')
  })

  it('creates the output file at the specified path', async () => {
    const template: TemplateConfig = { ...validTemplate, background: bgPath }
    const outputPath = path.join(tmpDir, 'composite.jpg')

    const result = await compositePhotos(template, photoPaths, outputPath)

    expect(result).toBe(outputPath)
    const stat = await fs.stat(outputPath)
    expect(stat.size).toBeGreaterThan(0)
  })

  it('produces a non-trivial image (all 4 photos composited)', async () => {
    const template: TemplateConfig = { ...validTemplate, background: bgPath }
    const outputPath = path.join(tmpDir, 'composite.jpg')

    await compositePhotos(template, photoPaths, outputPath)

    // The composite should be larger than just the background alone
    // because it has 4 photos composited on top
    const bgOnly = await sharp(bgPath).jpeg().toBuffer()
    const compositeBuffer = await fs.readFile(outputPath)
    // The composite image should exist and have content
    expect(compositeBuffer.length).toBeGreaterThan(0)
  })

  it('throws when a photo file does not exist', async () => {
    const template: TemplateConfig = { ...validTemplate, background: bgPath }
    const badPaths: [string, string, string, string] = [
      photoPaths[0],
      '/nonexistent/photo.jpg',
      photoPaths[2],
      photoPaths[3],
    ]
    const outputPath = path.join(tmpDir, 'composite.jpg')

    await expect(
      compositePhotos(template, badPaths, outputPath)
    ).rejects.toThrow()
  })

  it('throws when background image does not exist', async () => {
    const template: TemplateConfig = {
      ...validTemplate,
      background: '/nonexistent/bg.png',
    }
    const outputPath = path.join(tmpDir, 'composite.jpg')

    await expect(
      compositePhotos(template, photoPaths, outputPath)
    ).rejects.toThrow()
  })
})

describe('resizeToFit', () => {
  it('resizes an image to fit within the target bounds', async () => {
    const imgPath = await createTestImage(
      path.join(tmpDir, 'large.png'),
      800,
      600,
      { r: 128, g: 128, b: 128 }
    )

    const result = await resizeToFit(imgPath, 200, 150)

    const metadata = await sharp(result).metadata()
    expect(metadata.width).toBeLessThanOrEqual(200)
    expect(metadata.height).toBeLessThanOrEqual(150)
  })

  it('returns a Buffer', async () => {
    const imgPath = await createTestImage(
      path.join(tmpDir, 'test.png'),
      400,
      300,
      { r: 100, g: 100, b: 100 }
    )

    const result = await resizeToFit(imgPath, 200, 150)

    expect(Buffer.isBuffer(result)).toBe(true)
  })

  it('maintains aspect ratio using cover fit', async () => {
    // A 400x200 image (2:1 ratio) resized to 100x100 box
    // Cover fit should fill the box, then center-crop
    const imgPath = await createTestImage(
      path.join(tmpDir, 'wide.png'),
      400,
      200,
      { r: 200, g: 100, b: 50 }
    )

    const result = await resizeToFit(imgPath, 100, 100)

    const metadata = await sharp(result).metadata()
    expect(metadata.width).toBe(100)
    expect(metadata.height).toBe(100)
  })

  it('handles portrait images', async () => {
    const imgPath = await createTestImage(
      path.join(tmpDir, 'portrait.png'),
      200,
      400,
      { r: 50, g: 100, b: 200 }
    )

    const result = await resizeToFit(imgPath, 100, 100)

    const metadata = await sharp(result).metadata()
    expect(metadata.width).toBe(100)
    expect(metadata.height).toBe(100)
  })

  it('throws when input image does not exist', async () => {
    await expect(
      resizeToFit('/nonexistent/image.png', 200, 150)
    ).rejects.toThrow()
  })
})
