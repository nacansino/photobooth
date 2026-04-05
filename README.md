# Photobooth

Desktop photo kiosk app for events. Connects to a Canon EOS M100 camera and Canon SELPHY CP1500 printer. Takes 4 photos per session, composites them onto a template, and prints on 4x6 postcard.

Built with Electron + React, runs on Linux (Surface Pro 8).

## Hardware

- **Camera**: Canon EOS M100 (USB, controlled via gphoto2/libgphoto2)
- **Printer**: Canon SELPHY CP1500 (USB, controlled via CUPS/lp)
- **Display**: Surface Pro 8 touchscreen (kiosk mode)
- **Optional**: HDMI capture card for high-res 1080p preview (V4L2 via ffmpeg)

## Prerequisites

```bash
# Camera control + native preview helper
sudo apt install gphoto2 libgphoto2-dev

# Printer (CUPS + Gutenprint drivers)
sudo apt install cups printer-driver-gutenprint

# HDMI preview (optional, only if using capture card)
sudo apt install ffmpeg

# Display server for E2E tests
sudo apt install xvfb
```

## Setup

```bash
npm install
make                                   # build native preview-stream helper
npx tsx scripts/generate-template.ts   # generate placeholder template image
```

## Development

```bash
npm run dev          # launch app with hot reload
npm test             # unit tests (121 tests)
npm run test:e2e     # E2E tests (8 tests, requires xvfb)
npm run build        # production build
npm run lint         # ESLint
```

## Hardware-in-the-Loop Testing

With the camera connected, run the HIL script to verify preview streaming, capture, and shutdown:

```bash
# Single run: 10s preview + 1 capture
npx tsx scripts/hil-test.ts

# Longer soak: 30s preview + 4 captures
npx tsx scripts/hil-test.ts --duration 30 --captures 4

# Continuous loop: run every 5 minutes, log to hil-test.log (Ctrl+C to stop)
npx tsx scripts/hil-test.ts --loop

# Custom loop: 20s test every 60s
npx tsx scripts/hil-test.ts --loop 60 --duration 20 --captures 4
```

Checks: frame rate (>10 FPS), frozen detection (duplicate frame hashes), black frame detection, frame gaps (>500ms), capture file validity (>100 KB JPEG), preview resume after capture, clean SIGTERM shutdown.

In `--loop` mode results append to `hil-test.log` — leave it running overnight and check in the morning.

## Usage

1. Connect Canon EOS M100 via USB
2. Verify camera detected: `gphoto2 --auto-detect`
3. Run: `npm run dev` (dev) or `npm run build && npm start` (prod)
4. The app opens fullscreen in kiosk mode (windowed in dev)

**Flow**: Start → 10s countdown with live preview → capture → repeat per template slots → composite + print → back to start

**No printer?** The app works without a printer — it composites and saves photos to `~/photobooth-photos/{date}/{session}/` and skips printing.

## Architecture

- **Preview**: A native C helper (`src/main/preview-stream.c`) holds a single PTP/USB session to the camera via libgphoto2. It streams JPEG preview frames on stdout and accepts capture commands on stdin — no USB handoff needed between preview and capture. If an HDMI capture card is detected, preview switches to V4L2/ffmpeg for 1080p while the helper stays running for capture only.
- **Logging**: Uses `electron-log` — logs write to `~/.config/photobooth/logs/main.log` (5 MB max, auto-rotated). Uncaught exceptions and unhandled rejections are logged.

## Troubleshooting

### Camera not working / "Could not claim the USB device"

On GNOME/KDE desktops, a volume monitor auto-mounts the camera and blocks gphoto2. Fix:

```bash
# Kill the conflicting process
pkill -f gvfs-gphoto2-volume-monitor

# Verify camera is now accessible
gphoto2 --auto-detect
```

To prevent this permanently:

```bash
# Disable the gphoto2 volume monitor
sudo chmod -x /usr/lib/gvfs/gvfs-gphoto2-volume-monitor
```

### Camera detected but capture fails

Check if another process is holding the USB device:

```bash
lsof /dev/bus/usb/*/*
```

Kill any process listed, then retry.

## Template

The template defines how photos are arranged on a 4x6 postcard (1800×1200 at 300 DPI). The number of slots in the template determines how many photos are taken per session.

- **Config**: `templates/default.json` — slot positions and sizes (currently 2 landscape slots)
- **Background**: `templates/default-bg.png` — the background image

To customize: edit the JSON config and replace the background PNG. Regenerate the placeholder with `npx tsx scripts/generate-template.ts`.

## Photos

All sessions are saved to disk:

```
~/photobooth-photos/
└── 2026-03-07/
    └── aB3xK9mQ/
        ├── shot-0.jpg, shot-1.jpg, ...
        └── composite.jpg
```

## Future Work

- **Print queue monitoring**: Poll IPP `printer-state-reasons` to detect paper-out (`input-tray-missing`) and show on-screen alerts
- **SMS notifications**: Twilio integration to text the operator when the printer needs attention
- **Print counter**: Track prints per paper/ink set (108 sheets for KP-108IN) with persistent counter and low-paper warnings
- **Error recovery UI**: Surface printer errors to the kiosk screen with actionable messages instead of silently skipping

## Known Issues / To Check

- **Inconsistent shot counts**: Post-event audit found sessions with 0 or 3 shots instead of the expected 2. Session `4cjgCRP-` (2026-04-04) has 3 shots; sessions `nAewkjj-` and `qFnnLw2S` (2026-03-23) have 0 shots (composite only). Investigate whether a session can end mid-capture, and add a guard to ensure the number of captured shots always matches the template slot count before compositing.

## Working with an AI agent

Point your agent to [`CLAUDE.md`](CLAUDE.md) to get oriented.

**First prompt:**

> Read CLAUDE.md, then read doc/PLAN.md and src/shared/types.ts to understand the project.
