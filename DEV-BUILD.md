# Development & Build Guide

## Prerequisites

- **Node.js** >= 18
- **ffmpeg**: web app mode auto-uses `ffmpeg-static` from `node_modules`; Electron bundles its own
- **cmake** + **Visual Studio Build Tools** (Windows) hoac **Xcode CLI Tools** (macOS): can thiet neu build whisper-cli tu source
- **Python 3.10-3.12**: can thiet cho tinh nang diarization (nhan dien nguoi noi)

## Development (Web App)

```bash
# Cai dependencies
npm install

# Chay dev server (Express + Vite concurrently)
npm run dev
```

- Frontend: http://localhost:5173 (Vite proxy API + Socket.IO toi backend)
- Backend: http://localhost:3000

### Luu y ve ffmpeg

`server.js` tu dong resolve `ffmpeg-static` tu `node_modules` va them vao `PATH`.
Cac subprocess (Python whisper, diarize.py) cung se tim duoc ffmpeg qua `PATH` ma khong can cai he thong.

## Electron Development

```bash
# Chay Electron dev (rebuild native modules cho Electron truoc)
npm run electron:dev
```

## Build Electron App

### Cac buoc build da duoc tu dong hoa trong npm scripts:

```bash
# Build cho Windows
npm run electron:build:win

# Build cho macOS
npm run electron:build:mac

# Build cho platform hien tai
npm run electron:build
```

### Flow build (tu dong):

1. `npm run build` — build frontend (Vite) ra `dist/`
2. `npm run electron:rebuild` — rebuild native modules (`better-sqlite3`) cho dung ABI cua Electron
3. `electron-builder` — dong goi app vao `release/`

### Output:

- `release/Node Trans Setup x.x.x.exe` — Windows installer (NSIS)
- `release/Node Trans x.x.x.exe` — Windows portable
- `release/win-unpacked/` — unpacked app (de test nhanh)

## Cac loi thuong gap va cach xu ly

### 1. `NODE_MODULE_VERSION` mismatch (better-sqlite3)

**Trieu chung**: App Electron khong hien thi, log bao loi:
```
was compiled against NODE_MODULE_VERSION 127.
This version of Node.js requires NODE_MODULE_VERSION 145.
```

**Nguyen nhan**: `better-sqlite3` la native module, can compile rieng cho Node.js (dev/web) va Electron (desktop). ABI version khac nhau.

**Cach xu ly**:
- Build script da tu dong chay `electron:rebuild` truoc khi dong goi
- `electron-builder.config.js` dat `npmRebuild: false` de tranh electron-builder ghi de binary da rebuild dung
- Neu van loi, thu xoa cache va rebuild thu cong:
  ```bash
  rm -rf node_modules/better-sqlite3/build
  npx @electron/rebuild -f -w better-sqlite3
  ```

### 2. Chuyen doi giua Electron va Web App

Sau khi build Electron, `better-sqlite3` trong `node_modules` la ban Electron (khong tuong thich Node.js).

```bash
# Truoc khi chay web app (npm run dev), chay:
npm run rebuild:node

# Truoc khi build Electron, khong can lam gi — build script tu dong rebuild
```

### 3. Khong tim thay ffmpeg

**Trieu chung**: Toast loi "Khong tim thay ffmpeg" khi chay web app.

**Nguyen nhan**: `server.js` can ffmpeg de capture audio.

**Cach xu ly**: `ffmpeg-static` (devDependency) duoc tu dong su dung. Dam bao da chay `npm install`. Neu van loi, cai ffmpeg he thong va them vao PATH.

### 4. Python whisper bao `[WinError 2] The system cannot find the file specified`

**Nguyen nhan**: Python whisper library can ffmpeg trong PATH de xu ly audio.

**Cach xu ly**: `server.js` tu dong them ffmpeg directory vao `PATH`. Neu van loi, dam bao ffmpeg co trong system PATH.

### 5. Ollama hint khong phu hop tren Windows

Hint hien thi phu thuoc platform (detect tu API response):
- **Windows**: "Mo ung dung Ollama tu Start Menu"
- **macOS/Linux**: "Khoi dong bang: ollama serve"

## Cau truc file quan trong cho build

```
electron-builder.config.js   — Cau hinh electron-builder
  npmRebuild: false          — QUAN TRONG: khong de true, se ghi de rebuild
  asarUnpack: better-sqlite3 — Unpack native module ra ngoai asar

electron/main.js             — Set FFMPEG_PATH + them vao PATH truoc khi import server
src/server.js                — Set FFMPEG_PATH tu ffmpeg-static (web mode) + them vao PATH

package.json scripts:
  electron:rebuild           — electron-builder install-app-deps
  electron:build:win         — build + rebuild + electron-builder --win
  rebuild:node               — npm rebuild better-sqlite3 (restore cho Node.js)
```
