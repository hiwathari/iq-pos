#!/bin/sh
# IQ POS print bridge installer — Android (Termux), macOS and Linux.
#
#   curl -fsSL https://pos.luvder.com/downloads/install-print-bridge.sh | sh
#
# Downloads iq-print-bridge.js to ~/iq-print-bridge, sets it to start automatically, starts it
# now and checks it answers on http://127.0.0.1:9200. Safe to run again to update or repair.
# Set IQ_BRIDGE_PORT to use a different port.
set -e

BASE="${IQ_BRIDGE_BASE:-https://pos.luvder.com/downloads}"
DIR="$HOME/iq-print-bridge"
PORT="${IQ_BRIDGE_PORT:-9200}"

say() { printf '%s\n' "$*"; }

if [ -n "$TERMUX_VERSION" ] || [ -d /data/data/com.termux/files ]; then
  PLATFORM=termux
elif [ "$(uname -s)" = "Darwin" ]; then
  PLATFORM=mac
else
  PLATFORM=linux
fi
say "IQ POS print bridge — installing for $PLATFORM"

if ! command -v node >/dev/null 2>&1; then
  if [ "$PLATFORM" = termux ]; then
    say "Installing Node.js…"
    pkg install -y nodejs
  else
    say "Node.js is needed first. Install the LTS version from https://nodejs.org, then run this again."
    exit 1
  fi
fi

mkdir -p "$DIR"
curl -fsSL "$BASE/iq-print-bridge.js" -o "$DIR/iq-print-bridge.js"
NODE="$(command -v node)"
say "Downloaded to $DIR/iq-print-bridge.js (bridge $("$NODE" "$DIR/iq-print-bridge.js" --version))"

# Stop a copy that's already running (an older version, or one started by hand).
pkill -f "iq-print-bridge.js" 2>/dev/null || true
sleep 1

start_in_background() {
  nohup "$NODE" "$DIR/iq-print-bridge.js" "$PORT" > "$DIR/bridge.log" 2>&1 &
}

case "$PLATFORM" in
  termux)
    # Termux:Boot runs scripts in ~/.termux/boot when the device turns on.
    mkdir -p "$HOME/.termux/boot"
    cat > "$HOME/.termux/boot/iq-print-bridge" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
nohup "$NODE" "$DIR/iq-print-bridge.js" $PORT > "$DIR/bridge.log" 2>&1 &
EOF
    chmod +x "$HOME/.termux/boot/iq-print-bridge"
    command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
    start_in_background
    AUTOSTART="Install the Termux:Boot app (F-Droid) and open it once — then the bridge starts by itself whenever the Till turns on."
    ;;
  mac)
    PLIST="$HOME/Library/LaunchAgents/com.iqpos.printbridge.plist"
    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.iqpos.printbridge</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$DIR/iq-print-bridge.js</string><string>$PORT</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/bridge.log</string>
  <key>StandardErrorPath</key><string>$DIR/bridge.log</string>
</dict>
</plist>
EOF
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    AUTOSTART="It starts by itself when you log in to this Mac."
    ;;
  linux)
    if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
      UNIT_DIR="$HOME/.config/systemd/user"
      mkdir -p "$UNIT_DIR"
      cat > "$UNIT_DIR/iq-print-bridge.service" <<EOF
[Unit]
Description=IQ POS print bridge

[Service]
ExecStart=$NODE $DIR/iq-print-bridge.js $PORT
Restart=always

[Install]
WantedBy=default.target
EOF
      systemctl --user daemon-reload
      systemctl --user enable --now iq-print-bridge.service >/dev/null
      systemctl --user restart iq-print-bridge.service
      AUTOSTART="It starts by itself when you log in (systemd user service iq-print-bridge)."
    else
      start_in_background
      AUTOSTART="It's running now, but won't restart after a reboot — run this installer again after restarting."
    fi
    ;;
esac

sleep 2
if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
  say ""
  say "✓ The print bridge is running on http://127.0.0.1:$PORT"
else
  say ""
  say "✗ The bridge didn't answer on http://127.0.0.1:$PORT — see $DIR/bridge.log"
  exit 1
fi
say "$AUTOSTART"
say ""
say "Next:"
say "  Find your printer's IP:   node $DIR/iq-print-bridge.js find"
say "  Print a test page:        node $DIR/iq-print-bridge.js test <printer-ip>"
say "  Then add the printer in IQ POS (Settings → Printers) with that IP and turn on \"Use for Till auto-print\"."
