import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'

export interface ElectronAppFixture {
  app: ElectronApplication
  page: Page
}

export async function launchElectronApp(): Promise<ElectronAppFixture> {
  const app = await electron.launch({
    args: [
      path.join(__dirname, '..', 'dist', 'main', 'index.js'),
      '--no-sandbox',
    ],
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  return { app, page }
}

export async function closeElectronApp(app: ElectronApplication): Promise<void> {
  await app.close()
}
