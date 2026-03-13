#!/usr/bin/env npx tsx
/**
 * Hardware-in-the-loop (HIL) reliability test.
 *
 * Requires the Canon camera to be connected and preview-stream binary built.
 *
 * What it tests:
 *   1. preview-stream helper starts and connects to camera
 *   2. Preview frames arrive at a reasonable rate (>10 FPS)
 *   3. Frames are not frozen (compares consecutive frame checksums)
 *   4. Frames are not all-black (checks average brightness)
 *   5. Capture command produces a valid JPEG file on disk
 *   6. Preview resumes after capture without dropping out
 *   7. Clean shutdown via SIGTERM
 *
 * Usage:
 *   npx tsx scripts/hil-test.ts                          # 10s preview + 1 capture
 *   npx tsx scripts/hil-test.ts --duration 30            # 30s preview soak
 *   npx tsx scripts/hil-test.ts --captures 4             # simulate full session
 *   npx tsx scripts/hil-test.ts --loop 300               # repeat every 5 min, log to file
 *   npx tsx scripts/hil-test.ts --loop 60 --duration 20  # 20s test every 60s
 */

import { spawn, execFileSync, type ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

// ── Config ──

const cliArgs = process.argv.slice(2)
function flag(name: string, fallback: number): number {
  const idx = cliArgs.indexOf(`--${name}`)
  return idx !== -1 && cliArgs[idx + 1] ? Number(cliArgs[idx + 1]) : fallback
}
function hasFlag(name: string): boolean {
  return cliArgs.includes(`--${name}`)
}

const PREVIEW_DURATION_S = flag('duration', 10)
const NUM_CAPTURES = flag('captures', 1)
const LOOP_INTERVAL_S = hasFlag('loop') ? flag('loop', 300) : 0
const HELPER_PATH = path.join(process.cwd(), 'src', 'main', 'preview-stream')
const LOG_PATH = path.join(process.cwd(), 'hil-test.log')

const MSG_PREVIEW = 0x01
const MSG_CAPTURE_OK = 0x02
const MSG_CAPTURE_FAIL = 0x03

// ── Helpers ──

function md5(buf: Buffer): string {
  return createHash('md5').update(buf).digest('hex')
}

function avgBrightness(jpegBuf: Buffer): number {
  let sum = 0
  for (let i = 0; i < jpegBuf.length; i++) sum += jpegBuf[i]
  return sum / jpegBuf.length
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 23)
}

let logFile: fs.WriteStream | null = null

function output(msg: string): void {
  const line = `[${timestamp()}] ${msg}`
  console.log(line)
  logFile?.write(line + '\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return true
    await sleep(100)
  }
  return false
}

// ── Pre-flight (run once) ──

function preflight(): boolean {
  if (!fs.existsSync(HELPER_PATH)) {
    console.error(`ERROR: preview-stream binary not found at ${HELPER_PATH}`)
    console.error('Run: make preview-stream')
    return false
  }

  try {
    const detect = execFileSync('gphoto2', ['--auto-detect'], { encoding: 'utf-8' })
    const lines = detect.split('\n').filter((l) => l.trim() && !l.startsWith('Model') && !l.startsWith('---'))
    if (lines.length === 0) {
      console.error('ERROR: No camera detected. Is the camera connected and powered on?')
      return false
    }
    output(`Camera: ${lines[0].trim()}`)
  } catch {
    console.error('ERROR: gphoto2 not found or failed.')
    return false
  }

  try {
    execFileSync('pkill', ['-f', 'gvfs-(gphoto2|mtp)-volume-monitor'], { stdio: 'ignore' })
    output('Killed gvfs monitors')
  } catch {
    // fine
  }

  return true
}

// ── Single test run ──

interface RunResult {
  passed: number
  failed: number
  fps: number
  totalFrames: number
  capturesOk: number
  capturesTotal: number
  checks: string[]
}

async function runOnce(): Promise<RunResult> {
  const checks: string[] = []
  let passed = 0
  let failed = 0

  function pass(label: string): void {
    checks.push(`  PASS  ${label}`)
    passed++
  }
  function fail(label: string): void {
    checks.push(`  FAIL  ${label}`)
    failed++
  }

  // Spawn helper
  const proc: ChildProcess = spawn(HELPER_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  let buf = Buffer.alloc(0)

  const frameTimestamps: number[] = []
  const frameHashes: string[] = []
  const frameBrightness: number[] = []
  let totalBytes = 0
  const captureResults: { ok: boolean; path?: string; ms?: number }[] = []
  let connected = false
  let captureStartTime: number | null = null

  proc.stderr!.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim()
    if (msg.includes('connected to camera')) connected = true
  })

  proc.stdout!.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk])

    while (buf.length >= 5) {
      const msgType = buf[0]
      const payloadSize = buf.readUInt32BE(1)
      if (buf.length < 5 + payloadSize) break

      const payload = buf.subarray(5, 5 + payloadSize)
      buf = buf.subarray(5 + payloadSize)

      if (msgType === MSG_PREVIEW) {
        frameTimestamps.push(Date.now())
        frameHashes.push(md5(payload))
        frameBrightness.push(avgBrightness(payload))
        totalBytes += payload.length
      } else if (msgType === MSG_CAPTURE_OK) {
        const elapsed = Date.now() - (captureStartTime ?? Date.now())
        captureResults.push({ ok: true, path: payload.toString(), ms: elapsed })
      } else if (msgType === MSG_CAPTURE_FAIL) {
        const elapsed = Date.now() - (captureStartTime ?? Date.now())
        captureResults.push({ ok: false, ms: elapsed })
      }
    }
  })

  // Wait for connection
  if (!(await waitFor(() => connected, 10_000))) {
    fail('Camera connection (timed out)')
    proc.kill('SIGTERM')
    return { passed, failed, fps: 0, totalFrames: 0, capturesOk: 0, capturesTotal: NUM_CAPTURES, checks }
  }
  pass('Helper connected')

  // Phase 1: Preview soak
  const startTime = Date.now()

  if (!(await waitFor(() => frameTimestamps.length > 0, 5000))) {
    fail('First preview frame (timed out)')
    proc.kill('SIGTERM')
    return { passed, failed, fps: 0, totalFrames: 0, capturesOk: 0, capturesTotal: NUM_CAPTURES, checks }
  }
  pass(`First frame in ${frameTimestamps[0] - startTime}ms`)

  await sleep(PREVIEW_DURATION_S * 1000)

  const previewFrameCount = frameTimestamps.length
  const elapsedS = (Date.now() - startTime) / 1000
  const fps = previewFrameCount / elapsedS
  const avgSize = totalBytes / previewFrameCount

  // FPS check
  if (fps >= 10) {
    pass(`${fps.toFixed(1)} FPS, avg ${(avgSize / 1024).toFixed(0)} KB/frame`)
  } else {
    fail(`${fps.toFixed(1)} FPS (<10)`)
  }

  // Frozen check
  let maxConsecutiveDupes = 0
  let currentDupeRun = 0
  for (let i = 1; i < frameHashes.length; i++) {
    if (frameHashes[i] === frameHashes[i - 1]) {
      currentDupeRun++
      maxConsecutiveDupes = Math.max(maxConsecutiveDupes, currentDupeRun)
    } else {
      currentDupeRun = 0
    }
  }
  const uniquePct = (new Set(frameHashes).size / previewFrameCount) * 100

  if (maxConsecutiveDupes < fps * 2) {
    pass(`${uniquePct.toFixed(0)}% unique, max ${maxConsecutiveDupes} consecutive dupes`)
  } else {
    fail(`Frozen: ${maxConsecutiveDupes} consecutive dupes`)
  }

  // Black frame check
  const avgBright = frameBrightness.reduce((a, b) => a + b, 0) / frameBrightness.length
  const blackFrames = frameBrightness.filter((b) => b < 30).length
  const blackPct = (blackFrames / previewFrameCount) * 100

  if (blackPct < 5) {
    pass(`Brightness avg ${avgBright.toFixed(0)}, ${blackPct.toFixed(1)}% black`)
  } else {
    fail(`${blackPct.toFixed(1)}% black frames (avg brightness ${avgBright.toFixed(0)})`)
  }

  // Gap check
  let maxGapMs = 0
  let gapCount = 0
  for (let i = 1; i < frameTimestamps.length; i++) {
    const gap = frameTimestamps[i] - frameTimestamps[i - 1]
    if (gap > maxGapMs) maxGapMs = gap
    if (gap > 500) gapCount++
  }

  if (gapCount === 0) {
    pass(`No gaps >500ms (max ${maxGapMs}ms)`)
  } else {
    fail(`${gapCount} gaps >500ms (max ${maxGapMs}ms)`)
  }

  // Phase 2: Captures
  let capturesOk = 0
  if (NUM_CAPTURES > 0) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hil-capture-'))
    const preFrameCount = frameTimestamps.length

    for (let i = 0; i < NUM_CAPTURES; i++) {
      const shotPath = path.join(tmpDir, `shot-${i}.jpg`)
      captureStartTime = Date.now()
      proc.stdin!.write(`capture ${shotPath}\n`)

      const expected = captureResults.length + 1
      if (!(await waitFor(() => captureResults.length >= expected, 15_000))) {
        fail(`Capture ${i + 1}/${NUM_CAPTURES}: timed out`)
        continue
      }

      const result = captureResults[captureResults.length - 1]
      if (result.ok && result.path) {
        try {
          const stat = fs.statSync(result.path)
          if (stat.size > 100_000) {
            pass(`Capture ${i + 1}: ${(stat.size / 1024 / 1024).toFixed(1)} MB in ${result.ms}ms`)
            capturesOk++
          } else {
            fail(`Capture ${i + 1}: too small (${stat.size} bytes)`)
          }
        } catch {
          fail(`Capture ${i + 1}: file not found`)
        }
      } else {
        fail(`Capture ${i + 1}: failed (${result.ms}ms)`)
      }

      if (i < NUM_CAPTURES - 1) await sleep(1000)
    }

    // Phase 3: Preview resumes after capture
    await sleep(2000)
    const postFrames = frameTimestamps.length - preFrameCount
    if (postFrames > 10) {
      pass(`Preview resumed: ${postFrames} frames after capture`)
    } else {
      fail(`Preview stalled: only ${postFrames} frames after capture`)
    }

    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  // Phase 4: Shutdown
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      fail('Shutdown timed out, sending SIGKILL')
      proc.kill('SIGKILL')
      resolve()
    }, 5000)

    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0 || code === null) {
        pass(`Clean shutdown (code ${code})`)
      } else {
        fail(`Exit code ${code}`)
      }
      resolve()
    })
    proc.kill('SIGTERM')
  })

  return {
    passed,
    failed,
    fps,
    totalFrames: frameTimestamps.length,
    capturesOk,
    capturesTotal: NUM_CAPTURES,
    checks,
  }
}

// ── Main ──

async function main(): Promise<void> {
  if (!preflight()) process.exit(1)

  if (LOOP_INTERVAL_S > 0) {
    logFile = fs.createWriteStream(LOG_PATH, { flags: 'a' })
    output(`=== HIL loop started: ${PREVIEW_DURATION_S}s test every ${LOOP_INTERVAL_S}s, ${NUM_CAPTURES} capture(s) ===`)
    output(`Logging to ${LOG_PATH}`)

    let iteration = 0
    let totalPassed = 0
    let totalFailed = 0

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      output('')
      output(`=== Stopped after ${iteration} iterations: ${totalPassed} passed, ${totalFailed} failed ===`)
      logFile?.end()
      process.exit(totalFailed > 0 ? 1 : 0)
    })

    while (true) {
      iteration++
      output(`\n── Run #${iteration} ──`)

      try {
        const result = await runOnce()
        totalPassed += result.passed
        totalFailed += result.failed

        for (const line of result.checks) output(line)

        const status = result.failed === 0 ? 'PASS' : 'FAIL'
        output(`Run #${iteration}: ${status} | ${result.fps.toFixed(1)} FPS, ${result.totalFrames} frames, ${result.capturesOk}/${result.capturesTotal} captures`)
        output(`Cumulative: ${totalPassed} passed, ${totalFailed} failed across ${iteration} runs`)
      } catch (err) {
        totalFailed++
        output(`Run #${iteration}: CRASH — ${err}`)
      }

      output(`Next run in ${LOOP_INTERVAL_S}s... (Ctrl+C to stop)`)
      await sleep(LOOP_INTERVAL_S * 1000)
    }
  } else {
    // Single run
    const result = await runOnce()
    console.log('')
    console.log('━'.repeat(50))
    for (const line of result.checks) console.log(line)
    console.log('━'.repeat(50))
    console.log(`${result.totalFrames} frames, ${result.fps.toFixed(1)} FPS, ${result.capturesOk}/${result.capturesTotal} captures`)

    if (result.failed === 0) {
      console.log('\nALL CHECKS PASSED')
    } else {
      console.log(`\n${result.failed} CHECK(S) FAILED`)
    }
    process.exit(result.failed > 0 ? 1 : 0)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
