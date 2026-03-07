import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchElectronApp, closeElectronApp } from './electron.setup'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  const fixture = await launchElectronApp()
  app = fixture.app
  page = fixture.page
})

test.afterAll(async () => {
  await closeElectronApp(app)
})

test('app window opens', async () => {
  const title = await page.title()
  expect(title).toBeDefined()
})

test('start screen is visible', async () => {
  // The app should show some content on the start screen
  await expect(page.locator('body')).toBeVisible()
  // Take a screenshot for visual baseline
  await expect(page).toHaveScreenshot('start-screen.png')
})
