# Deployment Guide — Surface Pro (Ubuntu)

Step-by-step setup for deploying the photobooth kiosk on a fresh Ubuntu install.

## 1. System packages

```bash
sudo apt update && sudo apt install -y \
  build-essential pkg-config \
  gphoto2 libgphoto2-dev \
  cups printer-driver-gutenprint \
  ffmpeg \
  git curl
```

## 2. Node.js (v22 LTS or later)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify: `node -v` (should be v22+).

## 3. Clone and build

```bash
git clone <your-repo-url> ~/photobooth
cd ~/photobooth
npm install
make          # builds the native preview-stream helper (requires libgphoto2-dev)
npm run build # production build
```

## 4. Printer setup (Canon SELPHY CP1500)

1. Plug in the printer via USB and power it on
2. Load L-size paper cassette and ink cartridge
3. CUPS should auto-detect it via IPP:

```bash
lpstat -p              # should list Canon_SELPHY_CP1500 or similar
lpstat -p -d           # check it's set as default (optional)
```

If not detected, add manually:

```bash
# Find the device URI
lpinfo -v | grep -i canon

# Add the printer (adjust URI from above)
sudo lpadmin -p SELPHY -E -v <uri> -m everywhere
```

Test print:

```bash
lp -d SELPHY -o media=89x119mm.Borderless ~/photobooth/templates/frame.png
```

## 5. Camera setup (Canon EOS M100)

1. Plug in via USB, turn on, set to **A+ mode** (or P/Av/Tv/M)
2. Make sure an **SD card is inserted**

### Prevent GNOME from claiming the camera

```bash
# Kill gvfs monitors
pkill -f gvfs-gphoto2-volume-monitor
pkill -f gvfs-mtp-volume-monitor

# Prevent them from respawning (permanent fix)
sudo chmod -x /usr/lib/gvfs/gvfs-gphoto2-volume-monitor
sudo chmod -x /usr/lib/gvfs/gvfs-mtp-volume-monitor
```

Verify camera is accessible:

```bash
gphoto2 --auto-detect
# Should show: Canon EOS M100    usb:XXX,XXX
```

## 6. Run the app

### Development (windowed, hot reload)

```bash
cd ~/photobooth
npm run dev
```

### Production (fullscreen kiosk)

```bash
cd ~/photobooth
npm run build
npx electron dist/main/index.js
```

Or via Makefile:

```bash
make start
```

## 7. Auto-start on boot (optional)

Create a systemd user service:

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/photobooth.service << 'EOF'
[Unit]
Description=Photobooth Kiosk
After=graphical-session.target

[Service]
Type=simple
WorkingDirectory=%h/photobooth
ExecStart=/usr/bin/npx electron dist/main/index.js
Restart=on-failure
RestartSec=5
Environment=DISPLAY=:0

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable photobooth
systemctl --user start photobooth
```

To view logs: `journalctl --user -u photobooth -f`

App logs also write to: `~/.config/photobooth/logs/main.log`

## 8. Disable screen blanking (kiosk mode)

```bash
# Disable screen timeout
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'

# Disable lock screen
gsettings set org.gnome.desktop.screensaver lock-enabled false
```

## 9. Template configuration

Edit `templates/default.json`:

```json
{
  "width": 1051,
  "height": 1405,
  "dpi": 300,
  "background": "frame.png",
  "overlay": "overlay.png",
  "printEnabled": true,
  "slots": [
    { "x": 86, "y": 105, "width": 879, "height": 494 },
    { "x": 86, "y": 624, "width": 879, "height": 494 }
  ]
}
```

- **background** — frame image (placed behind photos)
- **overlay** — decorative layer (placed on top of photos, uses transparency)
- **printEnabled** — set `false` to composite only, skip printing
- **slots** — number of slots determines photos per session

## 10. Output

Photos save to:

```
~/photobooth-photos/
└── YYYY-MM-DD/
    └── {sessionId}/
        ├── shot-0.jpg
        ├── shot-1.jpg
        └── composite.jpg
```

## Quick checklist

- [ ] Ubuntu installed, system packages installed
- [ ] Node.js v22+ installed
- [ ] Repo cloned, `npm install`, `make`, `npm run build` all pass
- [ ] Camera plugged in, A+ mode, SD card in, gvfs monitors disabled
- [ ] `gphoto2 --auto-detect` shows the camera
- [ ] Printer plugged in, paper + ink loaded, `lpstat -p` shows it
- [ ] `make start` launches fullscreen kiosk
- [ ] Screen blanking disabled
- [ ] (Optional) systemd service enabled for auto-start
