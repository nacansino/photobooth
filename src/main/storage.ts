import fs from 'fs/promises'
import path from 'path'
import { nanoid } from 'nanoid'
import type { SessionInfo, SessionPhotos, SessionListEntry } from '@shared/types'

function todayDateString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function createSession(baseDir?: string): Promise<SessionInfo> {
  const base = baseDir ?? path.join(process.env.HOME ?? '/tmp', 'photobooth-photos')
  const sessionId = nanoid(8)
  const dateStr = todayDateString()
  const sessionDir = path.join(base, dateStr, sessionId)

  await fs.mkdir(sessionDir, { recursive: true })

  return { sessionId, sessionDir }
}

export async function saveShot(sessionDir: string, index: number, imageBuffer: Buffer): Promise<string> {
  const filePath = path.join(sessionDir, `shot-${index}.jpg`)
  await fs.writeFile(filePath, imageBuffer)
  return filePath
}

export async function saveComposite(sessionDir: string, imageBuffer: Buffer): Promise<string> {
  const filePath = path.join(sessionDir, 'composite.jpg')
  await fs.writeFile(filePath, imageBuffer)
  return filePath
}

export async function getSessionPhotos(sessionDir: string): Promise<SessionPhotos> {
  const entries = await fs.readdir(sessionDir)
  const shots: string[] = []
  let composite: string | null = null

  for (const entry of entries) {
    if (entry === 'composite.jpg') {
      composite = path.join(sessionDir, entry)
    } else if (/^shot-\d+\.jpg$/.test(entry)) {
      shots.push(path.join(sessionDir, entry))
    }
  }

  shots.sort()

  return { shots, composite }
}

export async function listSessions(baseDir: string, date?: string): Promise<SessionListEntry[]> {
  let dateDirs: string[]

  try {
    const allEntries = await fs.readdir(baseDir)
    dateDirs = date
      ? allEntries.filter((d) => d === date)
      : allEntries.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  } catch {
    return []
  }

  const results: SessionListEntry[] = []

  for (const dateStr of dateDirs) {
    const datePath = path.join(baseDir, dateStr)
    const stat = await fs.stat(datePath)
    if (!stat.isDirectory()) continue

    const sessionEntries = await fs.readdir(datePath)
    for (const sessionId of sessionEntries) {
      const sessionDir = path.join(datePath, sessionId)
      const sessionStat = await fs.stat(sessionDir)
      if (!sessionStat.isDirectory()) continue

      const files = await fs.readdir(sessionDir)
      const photoCount = files.filter((f) => /^shot-\d+\.jpg$/.test(f)).length

      results.push({
        sessionId,
        sessionDir,
        date: dateStr,
        photoCount,
      })
    }
  }

  return results
}
