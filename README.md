# Photobooth

Desktop photo kiosk app for events. Connects to a Canon EOS M100 camera and Canon SELPHY CP1500 printer. Takes 4 photos per session, composites them onto a template, and prints on 4x6 postcard.

Built with Electron + React, runs on Linux (Surface Pro 8).

## Hardware

- **Camera**: Canon EOS M100 (USB, controlled via gphoto2)
- **Printer**: Canon SELPHY CP1500 (USB, controlled via CUPS/lp)
- **Display**: Surface Pro 8 touchscreen (kiosk mode)

## Prerequisites

```bash
# Camera control
sudo apt install gphoto2

# Printer (CUPS + Gutenprint drivers)
sudo apt install cups printer-driver-gutenprint

# Display server for E2E tests
sudo apt install xvfb
```

## Setup

```bash
npm install
npx tsx scripts/generate-template.ts   # generate placeholder template image
```

## Development

```bash
npm run dev          # launch app with hot reload
npm test             # unit tests (122 tests)
npm run test:e2e     # E2E tests (8 tests, requires xvfb)
npm run build        # production build
npm run lint         # ESLint
```

## Usage

1. Connect Canon EOS M100 via USB
2. Verify camera detected: `gphoto2 --auto-detect`
3. Run: `npm run dev` (dev) or `npm run build && npm start` (prod)
4. The app opens fullscreen in kiosk mode (windowed in dev)

**Flow**: Start → 10s countdown with live preview → capture → repeat 4× → composite + print → back to start

**No printer?** The app works without a printer — it composites and saves photos to `~/photobooth-photos/{date}/{session}/` and skips printing.

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

The template defines how 4 photos are arranged on a 4x6 postcard (1800×1200 at 300 DPI).

- **Config**: `templates/default.json` — slot positions and sizes
- **Background**: `templates/default-bg.png` — the background image

To customize: edit the JSON config and replace the background PNG. Regenerate the placeholder with `npx tsx scripts/generate-template.ts`.

## Photos

All sessions are saved to disk:

```
~/photobooth-photos/
└── 2026-03-07/
    └── aB3xK9mQ/
        ├── shot-0.jpg ... shot-3.jpg
        └── composite.jpg
```

## Working with an AI agent

Point your agent to [`CLAUDE.md`](CLAUDE.md) to get oriented.

**First prompt:**

> Read CLAUDE.md, then read doc/PLAN.md and src/shared/types.ts to understand the project.
