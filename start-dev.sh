#!/usr/bin/env bash
# ============================================================
#  Lodestone - DEVELOPMENT launcher (Linux / macOS)
#  Runs the backend + the Vite dev server with hot reload.
#  Edit anything under src/ and the browser updates instantly,
#  no rebuild and no panel restart needed.
#
#  For normal use (built bundle, single port) use start-panel.sh.
#  Same dependency-check env flags as start-panel.sh apply
#  (LODESTONE_AUTO_INSTALL / LODESTONE_NO_INSTALL).
# ============================================================
set -euo pipefail

# Move to the folder where this script lives (handles spaces and "ñ").
cd "$(dirname "$(readlink -f "$0")")"

PORT="${LODESTONE_PORT:-2121}"

# ---------------------------------------------------------------------------
# Package-manager detection + dependency helpers (kept in sync with start-panel.sh)
# ---------------------------------------------------------------------------
PM=""
PM_INSTALL=""
detect_pm() {
  if command -v apt-get >/dev/null 2>&1; then PM="apt";    PM_INSTALL="sudo apt-get install -y";
  elif command -v dnf  >/dev/null 2>&1; then PM="dnf";     PM_INSTALL="sudo dnf install -y";
  elif command -v pacman >/dev/null 2>&1; then PM="pacman"; PM_INSTALL="sudo pacman -S --noconfirm";
  elif command -v zypper >/dev/null 2>&1; then PM="zypper"; PM_INSTALL="sudo zypper install -y";
  elif command -v brew >/dev/null 2>&1; then PM="brew";     PM_INSTALL="brew install";
  fi
}
pkg_name() {
  local dep="$1"
  case "$dep" in
    node)   case "$PM" in apt) echo nodejs;; dnf) echo nodejs;; pacman) echo nodejs;; zypper) echo nodejs;; brew) echo node;; esac;;
    npm)    case "$PM" in apt) echo npm;; dnf) echo npm;; pacman) echo npm;; zypper) echo npm;; brew) echo node;; esac;;
  esac
}
confirm_install() {
  local what="$1"
  [ "${LODESTONE_NO_INSTALL:-0}" = "1" ] && return 1
  [ "${LODESTONE_AUTO_INSTALL:-0}" = "1" ] && return 0
  printf "  Install %s now? [Y/n] " "$what"
  read -r ans || ans=""
  case "$ans" in [nN]*) return 1;; *) return 0;; esac
}
install_dep() {
  local dep="$1"
  if [ -z "$PM" ]; then
    echo "  No supported package manager found; install '$dep' manually and re-run."
    return 1
  fi
  local pkg; pkg="$(pkg_name "$dep")"
  [ -z "$pkg" ] && { echo "  Don't know the package name for '$dep' on $PM."; return 1; }
  echo "  Installing '$pkg' via $PM ..."
  [ "$PM" = "apt" ] && { sudo apt-get update -qq || true; }
  # shellcheck disable=SC2086
  $PM_INSTALL "$pkg"
}
node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }

echo "Checking dependencies..."
detect_pm
[ -n "$PM" ] && echo "  Package manager: $PM" || echo "  No known package manager detected."

if ! command -v node >/dev/null 2>&1; then
  echo "[MISSING] Node.js is not installed (need version 18 or newer)."
  if confirm_install "Node.js"; then install_dep node || true; fi
fi
command -v node >/dev/null 2>&1 || { echo "[ERROR] Node.js still not available. Install Node 18+ and retry."; exit 1; }
if [ "$(node_major)" -lt 18 ] 2>/dev/null; then
  echo "[WARN] Node $(node -v) is older than v18; the panel needs the global fetch() (Node 18+)."
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[MISSING] npm is not installed."
  if confirm_install "npm"; then install_dep npm || true; fi
fi
command -v npm >/dev/null 2>&1 || { echo "[ERROR] npm still not available. Install it and retry."; exit 1; }
# Java is NOT checked here: the panel downloads and manages the correct Java
# runtime per Minecraft version itself (see runtimes/ in the panel folder).
echo

# --- Install dependencies the first time (if node_modules is missing) ---
if [ ! -d node_modules ]; then
  echo "First run: installing dependencies with npm..."
  npm install || { echo "[ERROR] npm install failed. Check your internet connection."; exit 1; }
fi

# --- Seed config.json from the template on first run (never overwrite an existing one) ---
if [ ! -f config.json ]; then
  if [ -f config.example.json ]; then
    echo "First run: creating config.json from config.example.json..."
    cp config.example.json config.json
    echo "Edit config.json to change the password, port, etc., then restart."
    echo
  else
    echo "[ERROR] Neither config.json nor config.example.json were found."
    exit 1
  fi
fi

# --- Free the port if a previous backend instance is still holding it ---
if command -v lsof >/dev/null 2>&1; then
  OLD_PIDS="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$OLD_PIDS" ]; then
    echo "Stopping previous backend instance (PID $OLD_PIDS)..."
    # shellcheck disable=SC2086
    kill $OLD_PIDS 2>/dev/null || true
  fi
fi

# --- Start the backend in the background, then Vite in the foreground ---
echo
echo "Starting Lodestone backend (port $PORT)..."
node server.js &
BACKEND_PID=$!
# Stop the backend when this script exits (Ctrl+C on Vite).
trap 'echo; echo "Stopping backend (PID $BACKEND_PID)..."; kill "$BACKEND_PID" 2>/dev/null || true' EXIT

echo "Starting Vite dev server with hot reload..."
echo "Open http://localhost:5173 in your browser (it should open automatically)."
echo "Frontend changes under src/ reload instantly. Press Ctrl+C to stop both."
echo

npm run dev -- --open
