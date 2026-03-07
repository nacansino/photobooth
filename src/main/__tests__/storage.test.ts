import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { SessionInfo, SessionPhotos, SessionListEntry } from '@shared/types'

import {
  createSession,
  saveShot,
  saveComposite,
  getSessionPhotos,
  listSessions,
} from '@main/storage'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// Helper: create a fake JPEG buffer
function fakeImageBuffer(size = 1024): Buffer {
  return Buffer.alloc(size, 0xff)
}

describe('createSession', () => {
  it('creates a session directory under baseDir/{date}/', async () => {
    const result = await createSession(tmpDir)

    expect(result.sessionId).toBeTruthy()
    expect(result.sessionDir).toBeTruthy()

    const stat = await fs.stat(result.sessionDir)
    expect(stat.isDirectory()).toBe(true)
  })

  it('returns a SessionInfo with sessionId and sessionDir', async () => {
    const result = await createSession(tmpDir)

    expect(result).toEqual(
      expect.objectContaining<SessionInfo>({
        sessionId: expect.any(String) as string,
        sessionDir: expect.any(String) as string,
      })
    )
  })

  it('creates directory structure: baseDir/YYYY-MM-DD/session-id/', async () => {
    const result = await createSession(tmpDir)

    // The sessionDir should contain a date-formatted directory
    const relativePath = path.relative(tmpDir, result.sessionDir)
    const parts = relativePath.split(path.sep)

    // Should be date/session-id (2 levels deep)
    expect(parts).toHaveLength(2)

    // First part should be a date like YYYY-MM-DD
    expect(parts[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Second part should be the session ID
    expect(parts[1]).toBe(result.sessionId)
  })

  it('generates unique session IDs for each call', async () => {
    const session1 = await createSession(tmpDir)
    const session2 = await createSession(tmpDir)

    expect(session1.sessionId).not.toBe(session2.sessionId)
    expect(session1.sessionDir).not.toBe(session2.sessionDir)
  })

  it('creates the base directory if it does not exist', async () => {
    const nestedBase = path.join(tmpDir, 'nested', 'photos')

    const result = await createSession(nestedBase)

    const stat = await fs.stat(result.sessionDir)
    expect(stat.isDirectory()).toBe(true)
  })
})

describe('saveShot', () => {
  let sessionDir: string

  beforeEach(async () => {
    sessionDir = path.join(tmpDir, 'test-session')
    await fs.mkdir(sessionDir, { recursive: true })
  })

  it('saves a buffer as shot-{index}.jpg in the session directory', async () => {
    const buffer = fakeImageBuffer()

    const filePath = await saveShot(sessionDir, 0, buffer)

    expect(filePath).toBe(path.join(sessionDir, 'shot-0.jpg'))
    const contents = await fs.readFile(filePath)
    expect(contents).toEqual(buffer)
  })

  it('saves shots with different indices', async () => {
    const paths: string[] = []
    for (let i = 0; i < 4; i++) {
      paths.push(await saveShot(sessionDir, i, fakeImageBuffer()))
    }

    expect(paths[0]).toContain('shot-0.jpg')
    expect(paths[1]).toContain('shot-1.jpg')
    expect(paths[2]).toContain('shot-2.jpg')
    expect(paths[3]).toContain('shot-3.jpg')

    // All files should exist
    for (const p of paths) {
      const stat = await fs.stat(p)
      expect(stat.size).toBeGreaterThan(0)
    }
  })

  it('returns the full file path', async () => {
    const result = await saveShot(sessionDir, 2, fakeImageBuffer())

    expect(path.isAbsolute(result)).toBe(true)
    expect(result).toBe(path.join(sessionDir, 'shot-2.jpg'))
  })
})

describe('saveComposite', () => {
  let sessionDir: string

  beforeEach(async () => {
    sessionDir = path.join(tmpDir, 'test-session')
    await fs.mkdir(sessionDir, { recursive: true })
  })

  it('saves a buffer as composite.jpg in the session directory', async () => {
    const buffer = fakeImageBuffer(2048)

    const filePath = await saveComposite(sessionDir, buffer)

    expect(filePath).toBe(path.join(sessionDir, 'composite.jpg'))
    const contents = await fs.readFile(filePath)
    expect(contents).toEqual(buffer)
  })

  it('returns the full file path', async () => {
    const result = await saveComposite(sessionDir, fakeImageBuffer())

    expect(path.isAbsolute(result)).toBe(true)
    expect(result).toBe(path.join(sessionDir, 'composite.jpg'))
  })
})

describe('getSessionPhotos', () => {
  let sessionDir: string

  beforeEach(async () => {
    sessionDir = path.join(tmpDir, 'test-session')
    await fs.mkdir(sessionDir, { recursive: true })
  })

  it('returns shots and null composite when only shots exist', async () => {
    await fs.writeFile(path.join(sessionDir, 'shot-0.jpg'), fakeImageBuffer())
    await fs.writeFile(path.join(sessionDir, 'shot-1.jpg'), fakeImageBuffer())

    const result = await getSessionPhotos(sessionDir)

    expect(result.shots).toHaveLength(2)
    expect(result.shots).toContain(path.join(sessionDir, 'shot-0.jpg'))
    expect(result.shots).toContain(path.join(sessionDir, 'shot-1.jpg'))
    expect(result.composite).toBeNull()
  })

  it('returns composite path when composite.jpg exists', async () => {
    await fs.writeFile(path.join(sessionDir, 'shot-0.jpg'), fakeImageBuffer())
    await fs.writeFile(path.join(sessionDir, 'composite.jpg'), fakeImageBuffer())

    const result = await getSessionPhotos(sessionDir)

    expect(result.composite).toBe(path.join(sessionDir, 'composite.jpg'))
  })

  it('returns all 4 shots in order', async () => {
    for (let i = 0; i < 4; i++) {
      await fs.writeFile(path.join(sessionDir, `shot-${i}.jpg`), fakeImageBuffer())
    }

    const result = await getSessionPhotos(sessionDir)

    expect(result.shots).toHaveLength(4)
    // Shots should be in order
    for (let i = 0; i < 4; i++) {
      expect(result.shots[i]).toContain(`shot-${i}.jpg`)
    }
  })

  it('returns empty shots array for empty session directory', async () => {
    const result = await getSessionPhotos(sessionDir)

    expect(result.shots).toEqual([])
    expect(result.composite).toBeNull()
  })

  it('only includes shot-*.jpg files in shots array, not composite', async () => {
    await fs.writeFile(path.join(sessionDir, 'shot-0.jpg'), fakeImageBuffer())
    await fs.writeFile(path.join(sessionDir, 'composite.jpg'), fakeImageBuffer())
    await fs.writeFile(path.join(sessionDir, 'random.txt'), 'hello')

    const result = await getSessionPhotos(sessionDir)

    expect(result.shots).toHaveLength(1)
    expect(result.shots[0]).toContain('shot-0.jpg')
  })
})

describe('listSessions', () => {
  it('lists all sessions across all dates', async () => {
    // Create sessions for two different dates
    const date1Dir = path.join(tmpDir, '2026-03-07')
    const date2Dir = path.join(tmpDir, '2026-03-08')
    await fs.mkdir(path.join(date1Dir, 'session-abc'), { recursive: true })
    await fs.mkdir(path.join(date2Dir, 'session-def'), { recursive: true })

    // Add some photos
    await fs.writeFile(
      path.join(date1Dir, 'session-abc', 'shot-0.jpg'),
      fakeImageBuffer()
    )
    await fs.writeFile(
      path.join(date2Dir, 'session-def', 'shot-0.jpg'),
      fakeImageBuffer()
    )
    await fs.writeFile(
      path.join(date2Dir, 'session-def', 'shot-1.jpg'),
      fakeImageBuffer()
    )

    const result = await listSessions(tmpDir)

    expect(result).toHaveLength(2)
    const ids = result.map((s) => s.sessionId)
    expect(ids).toContain('session-abc')
    expect(ids).toContain('session-def')
  })

  it('filters sessions by date when date parameter is provided', async () => {
    const date1Dir = path.join(tmpDir, '2026-03-07')
    const date2Dir = path.join(tmpDir, '2026-03-08')
    await fs.mkdir(path.join(date1Dir, 'session-abc'), { recursive: true })
    await fs.mkdir(path.join(date2Dir, 'session-def'), { recursive: true })

    const result = await listSessions(tmpDir, '2026-03-07')

    expect(result).toHaveLength(1)
    expect(result[0].sessionId).toBe('session-abc')
    expect(result[0].date).toBe('2026-03-07')
  })

  it('returns correct photo count for each session', async () => {
    const dateDir = path.join(tmpDir, '2026-03-07')
    const sessionDir = path.join(dateDir, 'session-abc')
    await fs.mkdir(sessionDir, { recursive: true })
    await fs.writeFile(path.join(sessionDir, 'shot-0.jpg'), fakeImageBuffer())
    await fs.writeFile(path.join(sessionDir, 'shot-1.jpg'), fakeImageBuffer())
    await fs.writeFile(path.join(sessionDir, 'shot-2.jpg'), fakeImageBuffer())

    const result = await listSessions(tmpDir)

    expect(result).toHaveLength(1)
    expect(result[0].photoCount).toBe(3)
  })

  it('returns SessionListEntry objects with all required fields', async () => {
    const dateDir = path.join(tmpDir, '2026-03-07')
    const sessionDir = path.join(dateDir, 'session-xyz')
    await fs.mkdir(sessionDir, { recursive: true })

    const result = await listSessions(tmpDir)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(
      expect.objectContaining<SessionListEntry>({
        sessionId: 'session-xyz',
        sessionDir: sessionDir,
        date: '2026-03-07',
        photoCount: expect.any(Number) as number,
      })
    )
  })

  it('returns empty array when base directory has no sessions', async () => {
    const result = await listSessions(tmpDir)

    expect(result).toEqual([])
  })

  it('returns empty array when filtered date has no sessions', async () => {
    const dateDir = path.join(tmpDir, '2026-03-07')
    await fs.mkdir(path.join(dateDir, 'session-abc'), { recursive: true })

    const result = await listSessions(tmpDir, '2026-03-08')

    expect(result).toEqual([])
  })
})
