# node-trans — Architecture & Data Flow

## Overview

A real-time audio translation app. Captures audio from microphone or system output, transcribes (STT), translates, and stores session history. Runs as a web app or Electron desktop app.

---

## Main Data Flow

```
Audio device (mic / system audio)
        │
        ▼
   FFmpeg process
   PCM s16le · 16kHz · mono
        │
        ▼
  capture.js (ChunkTransform)
  Normalizes into 120ms chunks (3,840 bytes)
        │
        ├─────────────────────────────────────────────┐
        ▼                                             ▼
  [Engine: Soniox]                        [Engine: Local Whisper]
  soniox/session.js                       whisper-session.js / diarize-session.js
        │                                             │
        ▼                                             ▼
  Soniox Cloud API                   whisper.cpp (via nodejs-whisper)
  · Real-time transcription          · 3s buffer, silence detection
  · Cloud translation                · Outputs text + timestamps
  · Speaker diarization (cloud)      · Translation via Ollama / LibreTranslate (if enabled)
        │                                             │
        │                              ┌──────────────┴──────────────┐
        │                              ▼                             ▼
        │                    [No diarization]          [HF Token → Diarization]
        │                    speaker: null              diarize-session.js
        │                                                     │
        │                                                     ▼
        │                                              diarize.py (Python subprocess)
        │                                              · openai-whisper (CPU)
        │                                              · pyannote/speaker-diarization-3.1 (MPS/CUDA)
        │                                              · 10s window, 5s stride
        │                                              · speaker: SPEAKER_00, SPEAKER_01...
        │                                              [Fallback to whisper-session on error]
        │
        ▼
   Socket.IO (server.js)
   emit: "utterance", "partial-result"
        │
        ├──────────────────────────────┐
        ▼                             ▼
   React UI (browser)          Overlay window (Electron)
   · Live transcript           · Always-on-top
   · Speaker colors            · Transparent, frameless
   · Session history
        │
        ▼
   SQLite (history.db)
   · Sessions + Utterances + Speaker aliases
```

---

## Components

### Backend (`src/`)

| File | Role |
|------|------|
| `server.js` | Express + Socket.IO. Manages sessions, orchestrates audio capture and STT |
| `audio/capture.js` | Spawns FFmpeg, normalizes PCM into 120ms chunks, supports pause/resume |
| `audio/devices.js` | Lists audio devices by parsing ffmpeg output |
| `soniox/session.js` | Soniox SDK wrapper. Real-time transcription + translation + diarization via cloud |
| `local/whisper-session.js` | Offline STT. 3s buffer, silence detection, calls whisper.cpp |
| `local/diarize-session.js` | Python subprocess wrapper. Sends audio via stdin, receives utterances via stdout. Falls back to whisper-session on failure |
| `local/diarize.py` | Python worker: pyannote + openai-whisper. Receives base64 PCM, returns JSON utterances with speaker labels |
| `local/translate.js` | Calls Ollama or LibreTranslate. Non-fatal: returns empty string on error |
| `storage/history.js` | SQLite (better-sqlite3). CRUD for sessions, utterances, speaker aliases |
| `storage/settings.js` | Reads/writes `settings.json`. Loaded synchronously |
| `routes/api.js` | REST API: settings, sessions, devices, local status |

### Frontend (`client/src/`)

| File | Role |
|------|------|
| `context/SocketContext.jsx` | Central state (useReducer). Socket.IO connection, utterances, speaker colors, session selection |
| `components/live/` | Real-time UI: controls, transcript display, utterance rendering |
| `components/history/` | Session history browsing, detail view, speaker renaming, export |
| `components/settings/` | Settings form: engine, audio, translation, diarization, overlay |
| `i18n/` | Bilingual UI (EN/VI). `t()` function from I18nContext |

### Electron (`electron/`)

| File | Role |
|------|------|
| `main.js` | Starts the Express server internally, loads the app URL. Manages main window + overlay window. IPC bridge |
| `preload.js` | Exposes `window.electronAPI` to the renderer (safe IPC via contextBridge) |

---

## STT Engines

### Soniox (Cloud)

```
Audio chunks → Soniox SDK → Cloud API
                              · Model: stt-rt-v4
                              · Real-time streaming
                              · Built-in translation
                              · Built-in speaker diarization
```

Pros: low latency, high quality, no local setup required.
Cons: requires API key and internet connection.

### Local Whisper (Offline)

```
Audio chunks → 3s buffer → whisper.cpp (C++ binary)
                                  · Transcription
                                  · Timestamps
                [if HF token set]
                → diarize.py (Python subprocess)
                      · pyannote: who is speaking?
                      · openai-whisper: what are they saying?
                      · Combined → utterance + speaker label
```

Pros: fully offline, free.
Cons: requires building whisper.cpp; diarization requires Python setup.

---

## Node.js ↔ Python Protocol (Diarization)

Newline-delimited JSON over stdin/stdout:

```
Node → Python:
  {"type": "audio",    "data": "<base64 PCM>"}
  {"type": "flush"}
  {"type": "shutdown"}

Python → Node:
  {"type": "ready"}
  {"type": "utterance", "text": "...", "speaker": "SPEAKER_00", "start": 0.5, "end": 3.2}
  {"type": "error",    "message": "..."}
```

The Python worker starts once per session (avoids reloading models). Waits up to 120s for `ready`. If it times out or crashes, automatically falls back to whisper-session (speaker: null).

---

## Database (SQLite)

Path: `~/.node-trans/history.db` (web) or `userData/data/history.db` (Electron)

```sql
sessions        -- id, title, started_at, ended_at, audio_source, target_language, device_name, context
utterances      -- id, session_id, timestamp, speaker, original_text, original_language,
                --    translated_text, translation_language, source
speaker_aliases -- session_id, speaker ("SPEAKER_00"), alias (user-defined name)
```

---

## Settings & Config Files

| File | Location |
|------|----------|
| `settings.json` | `~/.node-trans/settings.json` (web) / `userData/data/settings.json` (Electron) |
| `history.db` | `~/.node-trans/history.db` (web) / `userData/data/history.db` (Electron) |
| `diarize-venv` | `~/.node-trans/diarize-venv/` (Python virtual environment) |

Key settings:

```
audioSource             mic / system / both
transcriptionEngine     soniox / local-whisper
whisperModel            tiny / base / small / medium / large-v3-turbo / large
whisperLanguage         auto / en / vi / ...
localTranslationEngine  none / ollama / libretranslate
ollamaModel             gemma3:4b / llama3.2 / ...
hfToken                 Hugging Face READ token (for diarization)
targetLanguage          vi / en / ja / ...
```

---

## Session Lifecycle

```
User clicks "Start"
    │
    ▼
Socket emits "start-listening" { sessionId?, context? }
    │
    ├── sessionId provided → reopen session from DB (reuse audio source, language, context)
    └── no sessionId → create new session
    │
    ▼
Resolve audio devices
    · Mic: from settings or device index 0
    · System: from settings or auto-detect BlackHole (macOS) / VB-CABLE (Windows)
    │
    ▼
Create STT session(s) (1 or 2 if audioSource = "both")
    │
    ▼
Start streaming audio → STT
    │
    ├── onPartial → socket.emit("partial-result") → UI shows in-progress text
    └── onUtterance → DB.addUtterance() + socket.emit("utterance") → UI + Overlay
    │
User clicks "Stop"
    │
    ▼
stopSession: stop FFmpeg, stop STT, DB.endSession()
```

---

## System Requirements

| Component | Required | Notes |
|-----------|----------|-------|
| Node.js >= 20 | ✅ | Runtime |
| ffmpeg | ✅ | Audio capture |
| whisper.cpp | Only for Local Whisper | `npm run setup:whisper` |
| Python 3.10–3.12 | Only for Diarization | `npm run setup:diarize` |
| Ollama | Only for Ollama translation | `ollama serve` must be running |
| LibreTranslate | Only for LibreTranslate | Server must be running |
| BlackHole (macOS) | Only for system audio capture | Or configure device manually |
| Soniox API Key | Only for Soniox engine | cloud.soniox.com |
| HuggingFace Token | Only for Diarization | huggingface.co/settings/tokens |
