# Development & Build Guide

## Prerequisites

- **Node.js** >= 20 LTS (uses built-in `fetch` and `node --watch`; Node 22 recommended)
- **ffmpeg**: web mode uses `ffmpeg-static` automatically; Electron bundles its own binary
- **cmake** + **Visual Studio Build Tools** (Windows) or **Xcode CLI Tools** (macOS): required only if building whisper-cli from source
- **Python 3.10–3.12**: required only for speaker diarization feature

---

## Running the Web App

```bash
npm install       # Install dependencies
npm run dev       # Dev mode (Express + Vite with hot-reload)
npm start         # Production mode (build frontend then start server)
```

- Frontend dev: http://localhost:5173
- Backend: http://localhost:3000

---

## Running the Electron App

```bash
npm run electron:dev   # Dev mode (Vite + Electron with hot-reload)
```

---

## Building the Electron App

```bash
npm run electron:build:mac   # Build for macOS
npm run electron:build:win   # Build for Windows
npm run electron:build       # Build for current platform
```

**Build flow (automated):**
1. `npm run build` — build frontend (Vite) into `dist/`
2. `npm run native:electron` — rebuild `better-sqlite3` for the correct Electron ABI
3. `electron-builder` — package the app into `release/`

**Output:**
- `release/Node Trans-x.x.x-arm64-mac.zip` — macOS
- `release/Node Trans Setup x.x.x.exe` — Windows installer
- `release/Node Trans x.x.x.exe` — Windows portable

---

## One-time Setup Scripts

These only need to be run once:

| Command | When needed |
|---------|-------------|
| `npm run setup:ffmpeg` | Before building Electron for the first time (copies ffmpeg into `ffmpeg-bin/`) |
| `npm run setup:whisper` | To pre-build `whisper-cli` (optional — auto-builds on first use if skipped) |
| `npm run setup:diarize` | To enable speaker diarization (installs Python venv + pyannote.audio) |

> **Note**: `setup:diarize` can also be triggered from the UI: Settings → Engine → "Setup Diarization"

---

## Internal Scripts

| Command | Purpose |
|---------|---------|
| `npm run native:node` | Rebuild `better-sqlite3` for Node.js (run after building Electron to restore web mode) |
| `npm run native:electron` | Rebuild `better-sqlite3` for Electron (run before packaging) |

---

## Common Issues

### 1. `NODE_MODULE_VERSION` mismatch (better-sqlite3)

**Symptom:**
```
was compiled against NODE_MODULE_VERSION 127.
This version of Node.js requires NODE_MODULE_VERSION 145.
```

**Cause:** `better-sqlite3` is a native module that must be compiled separately for Node.js and Electron — they use different ABI versions.

**Fix:** The build script handles this automatically. If it still fails:
```bash
rm -rf node_modules/better-sqlite3/build
npx @electron/rebuild -f -w better-sqlite3
```

### 2. Web app fails after building Electron

**Cause:** After an Electron build, `better-sqlite3` in `node_modules` is the Electron version and is incompatible with plain Node.js.

**Fix:**
```bash
npm run native:node   # Restore the Node.js-compatible version
```

### 3. Error: "No such file or directory: ffmpeg"

**Cause:** A Python subprocess cannot find ffmpeg in `PATH`.

**Fix:** `electron/main.js` and `src/server.js` automatically add the ffmpeg directory to `PATH`. If the error persists, ensure `npm install` has been run (installs `ffmpeg-static`).

---

## Key Files

```
electron-builder.config.js
  npmRebuild: false        — IMPORTANT: keep false to prevent overwriting the correctly rebuilt binary
  asarUnpack               — Keeps native modules and diarize.py on the real filesystem (outside ASAR)

electron/main.js           — Sets FFMPEG_PATH and adds it to PATH before importing the server
src/server.js              — Sets FFMPEG_PATH from ffmpeg-static (web mode) and adds it to PATH
src/local/diarize-session.js — Resolves diarize.py path, handles ASAR path in packaged Electron
```
