# Photo Kiosk App — Project Plan

## Context

All existing photo kiosk software is either bad or expensive. This app is a custom desktop photo kiosk that connects to a Canon EOS M100 camera and Canon SELPHY CP1500 printer. Users interact via a touchscreen (Surface Pro 8). The app must run continuously for hours at events.

## Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Platform | Linux | gphoto2 + CUPS work best on Linux; Surface Pro 8 supported via linux-surface kernel |
| App framework | Electron + React | Desktop app needs hardware access; Electron provides kiosk mode, Node.js for camera/printer |
| Build tool | electron-vite | Handles main + renderer builds, HMR, TypeScript, React out of the box |
| Camera control | gphoto2 (CLI) | Canon EOS M100 supported; CLI is simpler and more stable than native addon for long-running use |
| Live preview | gphoto2 `--capture-preview` in a loop | Captures JPEG frames (~15fps), sent to renderer via IPC |
| Image processing | Sharp | Composites 4 photos onto template at 300 DPI |
| Printing | CUPS via `lp` command | Gutenprint drivers for SELPHY CP1500; prints 4x6 postcard |
| Photo storage | Local filesystem | All sessions saved to `~/photobooth-photos/{date}/{session-id}/` |

**Deviation from SDP**: The SDP recommends Next.js, but this is a desktop app with hardware access requirements. Electron + React is the right tool. We keep the SDP conventions for TypeScript strict, testing (Vitest), code organization, and TDD workflow.

## Architecture

```
src/
├── main/                    # Electron main process (Node.js)
│   ├── index.ts             # App entry, BrowserWindow, kiosk mode
│   ├── camera.ts            # gphoto2 wrapper: preview stream, capture
│   ├── printer.ts           # CUPS/lp wrapper: print queue, status
│   ├── compositor.ts        # Sharp: resize photos, place on template
│   └── storage.ts           # Save photos to disk, organize by session
├── preload/
│   └── index.ts             # contextBridge: expose camera/printer APIs to renderer
├── renderer/                # React UI (Vite)
│   ├── App.tsx              # Root component, screen router
│   ├── screens/
│   │   ├── StartScreen.tsx       # Big "Start" button
│   │   ├── CaptureScreen.tsx     # Countdown + live preview + capture
│   │   └── QueuedScreen.tsx      # "Photo queued for printing" message
│   ├── components/
│   │   ├── LivePreview.tsx       # Canvas rendering camera frames
│   │   ├── Countdown.tsx         # 10-second countdown overlay
│   │   └── CancelDialog.tsx      # Cancel confirmation modal
│   └── hooks/
│       └── useCamera.ts          # IPC bridge for camera frames
├── shared/
│   └── types.ts             # Shared types between main/renderer
└── templates/
    └── default.json          # Template config: slot positions, sizes
```

## IPC Channels

| Channel | Direction | Data | Purpose |
|---|---|---|---|
| `camera:start-preview` | renderer → main | — | Start streaming preview frames |
| `camera:stop-preview` | renderer → main | — | Stop preview stream |
| `camera:frame` | main → renderer | JPEG Buffer | Single preview frame (~15fps) |
| `camera:capture` | renderer → main | — | Trigger full-res capture |
| `camera:captured` | main → renderer | `{ index, path }` | Capture complete notification |
| `print:queue` | renderer → main | `{ sessionId }` | Queue session for printing |
| `print:status` | main → renderer | `{ status, error? }` | Print job status updates |

## User Flow

### Screen State Machine

```
START → CAPTURE (×4 shots) → QUEUED → START
              ↑
           CANCEL (confirmation dialog)
```

### Detailed Flow

1. **StartScreen**: Full-screen "Start" circle button. On tap → transition to CaptureScreen with `shotIndex=0`.

2. **CaptureScreen** (repeats 4 times):
   - Main process starts gphoto2 preview stream → frames sent via IPC → rendered on `<canvas>`
   - 10-second countdown overlay displayed
   - At 0: main process stops preview, triggers `gphoto2 --capture-image-and-download`, saves full-res image
   - On capture complete: if `shotIndex < 3`, increment and restart countdown; else → QueuedScreen
   - Cancel button visible throughout. On tap → confirmation dialog. If confirmed → stop preview, return to StartScreen.

3. **QueuedScreen**: "Your photo is queued for printing, please wait..." with skip button. Auto-transitions to StartScreen after 10 seconds, or immediately on skip.

4. **Background printing** (main process, non-blocking):
   - Compositor takes 4 captured images + template config
   - Sharp resizes and places photos according to template slot definitions
   - Composite image saved to session folder
   - `lp -d Canon_SELPHY_CP1500 -o media=Postcard.fullbleed -o fit-to-page composite.jpg`

## Template System

Template defined in JSON config:

```json
{
  "width": 1800,
  "height": 1200,
  "dpi": 300,
  "background": "templates/default-bg.png",
  "slots": [
    { "x": 50, "y": 50, "width": 825, "height": 550 },
    { "x": 925, "y": 50, "width": 825, "height": 550 },
    { "x": 50, "y": 650, "width": 825, "height": 550 },
    { "x": 925, "y": 650, "width": 825, "height": 550 }
  ]
}
```

Slot positions are placeholder defaults (2x2 grid). The layout and background image will be customized later.

## Photo Storage

```
~/photobooth-photos/
└── 2026-03-07/
    ├── session-a1b2c3/
    │   ├── shot-1.jpg        # Full-res individual shots
    │   ├── shot-2.jpg
    │   ├── shot-3.jpg
    │   ├── shot-4.jpg
    │   └── composite.jpg     # Final template composite
    └── session-d4e5f6/
        └── ...
```

## Phased Build Order

### Phase 1: Foundation
- [ ] Scaffold Electron + React project with electron-vite
- [ ] TypeScript strict config, ESLint, Vitest
- [ ] Basic BrowserWindow in kiosk mode (fullscreen, no menu, no dev tools in prod)
- [ ] IPC preload bridge skeleton
- [ ] Camera service: connect to EOS M100 via gphoto2, capture a test image
- [ ] Printer service: send a test image to SELPHY CP1500 via `lp`

### Phase 2: Core Flow
- [ ] StartScreen UI (full-screen touch button)
- [ ] Live preview: gphoto2 preview loop → IPC → canvas rendering
- [ ] Countdown component (10-second timer with large display)
- [ ] Photo capture: trigger capture, save to disk, track shot count
- [ ] Screen state machine: Start → Capture ×4 → Queued → Start
- [ ] Compositor: Sharp composites 4 photos onto template
- [ ] Print queue: background printing after session completes
- [ ] QueuedScreen with auto-return and skip button

### Phase 3: Polish
- [ ] Cancel flow with confirmation dialog
- [ ] Error handling: camera disconnect recovery, printer errors, out of paper
- [ ] Session storage: organize photos by date/session
- [ ] Memory management: cleanup buffers, prevent leaks over hours of use
- [ ] Auto-recovery: restart camera connection if lost

### Phase 4: Deploy
- [ ] Template customization (swap background image, adjust slot positions)
- [ ] Auto-start on boot (systemd user service or .desktop autostart)
- [ ] Surface Pro 8 setup notes (linux-surface kernel, touch calibration)

## Verification

After each phase:
1. `npm test` — all unit tests pass
2. `npm run build` — TypeScript compiles, Electron builds
3. Manual test with real hardware (camera + printer connected)
4. Run continuously for 30+ minutes to check for memory leaks or crashes
