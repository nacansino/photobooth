import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchElectronApp, closeElectronApp } from './electron.setup'

let app: ElectronApplication
let page: Page

// Capture flow takes ~5s with accelerated setInterval.
// Auto-return test needs real 10s setTimeout for QueuedScreen.
test.setTimeout(60_000)

/** Click Start and wait for all 4 captures to complete → QueuedScreen */
async function completeCaptureFlow(p: Page) {
  await p.getByRole('button', { name: /start/i }).click()
  await expect(p.getByText(/queued for printing/i)).toBeVisible({ timeout: 30_000 })
}

/** Navigate back to StartScreen from any state */
async function ensureStartScreen(p: Page) {
  const startBtn = p.getByRole('button', { name: /start/i })
  if (await startBtn.isVisible().catch(() => false)) return

  const skipBtn = p.getByRole('button', { name: /skip/i })
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click()
    await expect(startBtn).toBeVisible()
    return
  }

  const cancelConfirm = p.getByRole('button', { name: /yes/i })
  if (await cancelConfirm.isVisible().catch(() => false)) {
    await cancelConfirm.click()
    await expect(startBtn).toBeVisible()
    return
  }

  const cancelBtn = p.getByRole('button', { name: /cancel/i })
  if (await cancelBtn.isVisible().catch(() => false)) {
    await cancelBtn.click()
    await p.getByRole('button', { name: /yes/i }).click()
    await expect(startBtn).toBeVisible()
    return
  }

  await expect(startBtn).toBeVisible({ timeout: 15_000 })
}

test.beforeAll(async () => {
  const fixture = await launchElectronApp()
  app = fixture.app
  page = fixture.page

  // Only accelerate setInterval (Countdown ticks), NOT setTimeout
  // (QueuedScreen auto-return needs real timing so Playwright can observe it)
  await page.evaluate(() => {
    const origSI = window.setInterval
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.setInterval = (fn: any, ms: any, ...args: any[]) => origSI(fn, Math.min(ms || 0, 100), ...args)
  })
})

test.afterAll(async () => {
  await closeElectronApp(app)
})

test.beforeEach(async () => {
  await ensureStartScreen(page)
})

test('Start → Capture flow', async () => {
  // Verify start screen
  await expect(page.getByRole('button', { name: /start/i })).toBeVisible()
  await expect(page).toHaveScreenshot('start-screen.png')

  // Click Start
  await page.getByRole('button', { name: /start/i }).click()

  // Verify capture screen elements
  await expect(page.getByText(/photo 1 of 4/i)).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible()
  await expect(page).toHaveScreenshot('capturing-screen.png')

  // Wait for 4 captures → transition to QueuedScreen
  await expect(page.getByText(/queued for printing/i)).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveScreenshot('queued-screen.png')
})

test('Queued → auto-return', async () => {
  await completeCaptureFlow(page)

  // Verify queued message is shown
  await expect(page.getByText(/queued for printing/i)).toBeVisible()

  // Wait for auto-return to Start screen (real 10s setTimeout)
  await expect(page.getByRole('button', { name: /start/i })).toBeVisible({ timeout: 15_000 })
})

test('Queued → skip', async () => {
  await completeCaptureFlow(page)

  // Click Skip immediately
  await page.getByRole('button', { name: /skip/i }).click()

  // Verify returns to Start screen
  await expect(page.getByRole('button', { name: /start/i })).toBeVisible()
})

test('Cancel flow', async () => {
  // Enter capture mode
  await page.getByRole('button', { name: /start/i }).click()
  await expect(page.getByText(/photo 1 of 4/i)).toBeVisible()

  // Click Cancel
  await page.getByRole('button', { name: /cancel/i }).click()

  // Verify confirmation dialog
  await expect(page.getByText(/are you sure/i)).toBeVisible()
  await expect(page).toHaveScreenshot('cancel-dialog.png')

  // Confirm cancellation
  await page.getByRole('button', { name: /yes/i }).click()

  // Verify returns to Start screen
  await expect(page.getByRole('button', { name: /start/i })).toBeVisible()
})

test('Cancel dismiss', async () => {
  // Enter capture mode
  await page.getByRole('button', { name: /start/i }).click()
  await expect(page.getByText(/photo 1 of 4/i)).toBeVisible()

  // Click Cancel
  await page.getByRole('button', { name: /cancel/i }).click()

  // Verify confirmation dialog
  await expect(page.getByText(/are you sure/i)).toBeVisible()

  // Dismiss — click "No, go back"
  await page.getByRole('button', { name: /no/i }).click()

  // Verify still on capture screen
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible()
})

test('Continuous operation: 3 cycles without state leaks', async () => {
  for (let cycle = 0; cycle < 3; cycle++) {
    // Start screen
    await expect(page.getByRole('button', { name: /start/i })).toBeVisible()
    await page.getByRole('button', { name: /start/i }).click()

    // Wait for capture flow to complete
    await expect(page.getByText(/queued for printing/i)).toBeVisible({ timeout: 30_000 })

    // Skip back to start
    await page.getByRole('button', { name: /skip/i }).click()
  }

  // After 3 cycles, verify clean start state
  await expect(page.getByRole('button', { name: /start/i })).toBeVisible()
})
