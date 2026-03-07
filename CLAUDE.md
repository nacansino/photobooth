# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Desktop photo kiosk app (Electron + React) connecting to Canon EOS M100 camera and Canon SELPHY CP1500 printer. Runs on Surface Pro 8 (Linux). Takes 4 photos per session, composites onto a template, prints on 4x6 postcard. Read `doc/PLAN.md` for the full spec.

## Tech Stack

Electron + React, electron-vite, TypeScript strict, Tailwind CSS v4, Sharp (image compositing), Vitest (unit tests), Playwright (E2E), gphoto2 CLI (camera), CUPS/lp (printer).

## Commands

```bash
npm run dev          # electron-vite dev server
npm run build        # production build (main + preload + renderer)
npm test             # unit tests (Vitest) — 122 tests
npm run test:e2e     # E2E tests (Playwright + Electron) — uses xvfb-run
npm run lint         # ESLint
```

Run a single test file: `npx vitest run --reporter=verbose src/main/__tests__/camera.test.ts`

## Architecture

- **`src/main/`** — Electron main process (Node.js): camera.ts (gphoto2 wrapper), printer.ts (CUPS wrapper), compositor.ts (Sharp), storage.ts (filesystem), index.ts (BrowserWindow + IPC handlers)
- **`src/preload/`** — contextBridge exposing `window.api` with camera/printer APIs to renderer
- **`src/renderer/`** — React UI: screens (StartScreen, CaptureScreen, QueuedScreen), components (LivePreview, Countdown, CancelDialog), hooks (useAppState reducer)
- **`src/shared/types.ts`** — All IPC channel names, service interfaces, app state types, ElectronAPI type
- **`templates/`** — Template JSON configs defining photo slot positions on 4x6 postcard
- **`e2e/`** — Playwright E2E tests with Electron launch helper

## App State Machine

```
IDLE → (start) → CAPTURING (×4 shots) → QUEUED → (timeout/skip) → IDLE
                      ↓ (cancel confirmed)
                     IDLE
```

Implemented as a `useReducer` in `src/renderer/hooks/useAppState.ts`.

## IPC Pattern

Renderer calls `window.api.camera.*` / `window.api.printer.*` → preload uses `ipcRenderer.invoke()` → main process `ipcMain.handle()` delegates to service modules. Camera frames stream via `ipcRenderer.on('camera:frame')`.

## Development Process

Follow `doc/SDP.md`. Key points:
- **TDD**: Write tests first (red), implement (green), refactor
- **Verify before committing**: `npm test` → `npm run build` → `npm run test:e2e`
- Update `doc/PLAN.md` when scope or architecture changes

## Code Conventions

- TypeScript strict — no `any`, no `@ts-ignore`
- Tests in `__tests__/` directories next to the code they test
- Component tests use `// @vitest-environment jsdom` comment at top of file
- Vitest setup file at `vitest.setup.ts` loads `@testing-library/jest-dom`
- Playwright config: `workers: 1`, `fullyParallel: false`, 5% screenshot diff tolerance
- Flat file structure preferred over nested index files
