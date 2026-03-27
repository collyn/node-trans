# Node Trans

[Tiếng Việt](README.md)

Real-time audio transcription and translation app. Captures audio from microphone, system audio, or both. Supports two transcription modes: **Soniox** (cloud, with built-in translation) and **Local Whisper** (offline, no API key required).

Runs in the **browser** (web) or as a **desktop app** (Electron). Supports **macOS** and **Windows**.

## Hardware Requirements

> This section applies to **Local Whisper** mode only. If you use **Soniox** (cloud), only an internet connection is required — no special hardware needed.

### macOS

| Configuration | RAM | Features available |
|--------------|-----|--------------------|
| Minimum | 8 GB | Whisper tiny/base + Ollama gemma3:1b, no diarization |
| Recommended | Apple Silicon 16 GB | Full: Whisper medium/large-v3-turbo + Ollama gemma3:4b + Diarization |
| Optimal | Apple Silicon 32 GB | Full features with largest models, very smooth |

**Apple Silicon recommended** (M1/M2/M3 or later): unified memory allows CPU and GPU to share the same RAM pool — Whisper (Metal), Ollama (Metal), and Diarization (MPS) are all hardware-accelerated, 4–6x faster than Intel with the same model.

### Windows

| Configuration | RAM | GPU | Features available |
|--------------|-----|-----|-------------------|
| Minimum | 16 GB | None | Whisper tiny/base + small Ollama model (slow), no diarization |
| Recommended | 16 GB | NVIDIA 8 GB VRAM (RTX 3060+) | Whisper medium + Ollama gemma3:4b + Diarization |
| Optimal | 32 GB | NVIDIA 12 GB+ VRAM (RTX 4070 Ti+) | Full features, comfortable |

**Windows notes:** AMD GPUs are not supported. Without an NVIDIA GPU, diarization cannot run in real-time. Install [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) to enable GPU acceleration for Whisper and Ollama.

### Disk space (Local Whisper)

| Component | Size |
|-----------|------|
| Whisper model base | ~150 MB |
| Whisper model large-v3-turbo | ~1.6 GB |
| Ollama + gemma3:4b model | ~3.5 GB |
| Python venv for diarization (torch) | ~4–6 GB |
| pyannote diarization model | ~1 GB |
| **Total (full)** | **~10–12 GB** |

---

## Software Requirements

- **Node.js** >= 20
- **ffmpeg** (auto-downloaded when building Electron, or install manually for web mode)

### Install ffmpeg (web mode)

| OS | Command |
|----|---------|
| macOS | `brew install ffmpeg` |
| Windows | `winget install ffmpeg` or download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH |

## Installation

```bash
# Install dependencies
npm install

# Build frontend
npm run build
```

## Running

### Web Mode (browser)

```bash
# Production
npm start

# Development (run server + client concurrently)
npm run dev
```

- Production: open `http://localhost:3000`
- Development: open `http://localhost:5173` (Vite dev server, proxies API automatically)

### Electron Mode (desktop app)

```bash
# Development
npm run electron:dev

# Build app
npm run electron:build          # Build for current platform
npm run electron:build:mac      # Build for macOS
npm run electron:build:win      # Build for Windows
```

---

## Soniox Mode (Cloud)

Uses the [Soniox API](https://soniox.com/docs/stt/rt/real-time-translation) for real-time transcription and translation. Requires a free account at [soniox.com](https://soniox.com).

### API Key Configuration

Go to **Settings → Engine** → enter your API key in the **Soniox API Key** field.

Or create a `.env` file in the project root:

```
SONIOX_API_KEY=your_api_key_here
```

API key set in Settings takes priority over `.env`.

Soniox supports multilingual speech recognition with built-in translation and automatic speaker diarization — no additional setup required.

---

## Local Whisper Mode (Offline)

Transcribe speech entirely offline using [Whisper](https://github.com/openai/whisper) running locally. No API key needed, no data sent externally.

### Step 1 — Build Whisper

```bash
npm run whisper:build
```

This compiles whisper.cpp (takes a few minutes, requires build tools). Only needs to be run once.

### Step 2 — Download a Whisper model

Models are **not** downloaded automatically during build. You need to download them manually into the correct directory.

```bash
# Find the models directory
ls node_modules/nodejs-whisper/cpp/whisper.cpp/models/
```

Download using the built-in script:

```bash
cd node_modules/nodejs-whisper/cpp/whisper.cpp
bash models/download-ggml-model.sh base
```

Or download directly from [huggingface.co/ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp) and place the file in the `models/` directory.

#### Whisper model comparison

| Model | File size | Min RAM | Accuracy | Speed |
|-------|-----------|---------|----------|-------|
| `tiny` | ~75 MB | ~1 GB | Low | Very fast |
| `base` | ~150 MB | ~1 GB | Moderate | Fast |
| `small` | ~500 MB | ~2 GB | Good | Medium |
| `medium` | ~1.5 GB | ~5 GB | High | Slow |
| `large-v3-turbo` | ~1.6 GB | ~4 GB | Very high | Medium |
| `large` | ~3 GB | ~8 GB | Best | Slowest |

Default model: `base`. Recommended: `large-v3-turbo` on Apple Silicon.

### Step 3 — Configure in the app

Go to **Settings → Engine**:
- **Transcription Engine** → select **Local Whisper**
- **Whisper Model** → select the model you downloaded

### Step 4 — Translation with Local Whisper

Local Whisper only handles transcription, not translation. Choose a translation service:

#### No translation

Select **Translation Service → None**. Transcripts show the speaker's original language.

#### Ollama (local, offline)

1. Install [Ollama](https://ollama.com) and pull a model:

```bash
ollama pull gemma3:4b   # Recommended (~3GB, balanced speed/quality)
```

2. In **Settings → Engine**: select **Ollama** as Translation Service and choose a model from the list.

Supported Ollama models:

| Model | RAM | Speed | Quality |
|-------|-----|-------|---------|
| `gemma3:1b` | ~1 GB | Very fast | Basic |
| `llama3.2:3b` | ~2 GB | Fast | Good |
| `gemma3:4b` | ~3 GB | Fast | Quite good (recommended) |
| `llama3.1:8b` | ~5 GB | Moderate | Good |
| `gemma3:12b` | ~8 GB | Slower | Very good |

Ollama defaults to `http://localhost:11434`.

#### LibreTranslate (local, offline)

1. Install and run [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) (Docker or pip)
2. In **Settings → Engine**: select **LibreTranslate**, enter the URL (default: `http://localhost:5000`)

---

## Speaker Diarization — Local Whisper

When using Local Whisper, you can enable speaker diarization via [pyannote-audio](https://github.com/pyannote/pyannote-audio). Each utterance will be labeled `SPEAKER_00`, `SPEAKER_01`, etc.

### Additional Requirements

- **Python 3.10+**
- **HuggingFace account** + access token (free)

### Setup

**Step 1 — Install Python dependencies**

```bash
npm run diarize:setup
```

This installs `torch`, `torchaudio`, `openai-whisper`, and `pyannote.audio` into a virtual env at `~/.node-trans/diarize-venv/`. Requires internet access, takes 5–15 minutes.

> You can also run this from within the app: **Settings → Engine → Speaker Diarization → Install**.

**Step 2 — Create a HuggingFace token**

1. Sign up / log in at [huggingface.co](https://huggingface.co)
2. Go to **Settings → Access Tokens** → create a **READ** token
3. Accept the model license agreements at:
   - [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)

**Step 3 — Configure in the app**

Go to **Settings → Engine → Speaker Diarization**:
- Enter your **HuggingFace Token**

On first enable, the app downloads ~1GB of models. Subsequent starts are ready in ~10–15 seconds.

> **Performance note:** Diarization requires additional RAM and processing time. Each 10-second audio window is processed in parallel with transcription. Apple Silicon (MPS) is significantly faster than CPU.

---

## System Audio Capture

To capture system audio (Google Meet, Zoom, YouTube, etc.), your computer needs a **virtual audio driver** — a virtual sound device that acts as a bridge between speakers and a microphone input.

> **Why is this needed?** By default, the OS doesn't allow apps to directly tap into audio output. A virtual driver creates an intermediary device: you route your output to it, and the app reads input from that same device.

---

### macOS — BlackHole

**BlackHole** is a free, widely-used virtual audio driver for macOS.

#### Step 1 — Install BlackHole

**Option A: Homebrew (recommended)**
```bash
brew install blackhole-2ch
```

**Option B: Direct download**
- Go to [existential.audio/blackhole](https://existential.audio/blackhole/) → choose **BlackHole 2ch** → enter your email → download the `.pkg` → run the installer

After installation, **restart your Mac** to load the driver.

#### Step 2 — Verify installation

1. Open **System Settings → Sound**
2. In both **Output** and **Input** tabs, you should see **BlackHole 2ch**
3. If not visible → restart your Mac

#### Step 3 — Create an Aggregate Device (to hear AND capture simultaneously)

> This step is critical: setting BlackHole as your sole output will silence your speakers. An Aggregate Device routes audio to your speakers **and** BlackHole simultaneously.

1. Open **Audio MIDI Setup** (Spotlight → "Audio MIDI Setup")
2. Click **"+"** bottom-left → **Create Aggregate Device**
3. Check both:
   - ✅ **BlackHole 2ch**
   - ✅ **Your speakers** (e.g. "MacBook Pro Speakers")
4. Name it something memorable, e.g. **"Node Trans Aggregate"**
5. Set **clock source** to your main speakers (not BlackHole) to avoid crackling

#### Step 4 — Set Aggregate Device as default output

1. **System Settings → Sound → Output**
2. Select **"Node Trans Aggregate"**
3. Audio now plays through speakers while BlackHole captures it

#### Step 5 — Configure in the app

1. Open **Settings → Audio** in Node Trans
2. **Audio Source** → **"System Audio"** or **"Both"**
3. **System Audio Device** → **"BlackHole 2ch"**
4. Press **Start**

> **When done:** Switch your Output back to your original speakers in System Settings → Sound.

#### Troubleshooting

| Issue | Solution |
|-------|----------|
| BlackHole not in device list | Restart Mac; reinstall if still missing |
| Audio delay or echo | Set Clock Source to main speakers in Audio MIDI Setup |
| App doesn't detect BlackHole | Restart the app; verify correct System Audio Device is selected |
| No audio after setup | Check System Settings → Sound → Output, reselect Aggregate Device |

---

### Windows — VB-CABLE

**VB-CABLE** is a free virtual audio driver for Windows, creating a pair of devices: **CABLE Input** (virtual output) and **CABLE Output** (virtual input).

#### Step 1 — Download and install VB-CABLE

1. Go to [vb-audio.com/Cable](https://vb-audio.com/Cable/)
2. Download **VB-CABLE Driver**
3. Extract → run **`VBCABLE_Setup_x64.exe`** as **Administrator**
4. Click **"Install Driver"** → wait for completion
5. **Restart your computer**

#### Step 2 — Verify installation

- Output devices: **"CABLE Input (VB-Audio Virtual Cable)"**
- Input devices: **"CABLE Output (VB-Audio Virtual Cable)"**

#### Step 3 — Route output to CABLE Input

**Settings → System → Sound → Output** → select **"CABLE Input"**

> ⚠️ Speakers will go silent after this step. See Step 4.

#### Step 4 — Enable "Listen to this device" (optional, to hear audio)

1. Right-click speaker icon → **Sounds → Recording** tab
2. Double-click **"CABLE Output"** → **Listen** tab
3. Check **"Listen to this device"** → select your speakers → OK

#### Step 5 — Configure in the app

1. **Settings → Audio** in Node Trans
2. **Audio Source** → **"System Audio"** or **"Both"**
3. **System Audio Device** → **"CABLE Output (VB-Audio Virtual Cable)"**
4. Press **Start**

#### Alternative — Stereo Mix (no extra software)

Some Windows PCs (Realtek audio) have a built-in **Stereo Mix**:

1. Right-click speaker → **Sounds → Recording** tab
2. Right-click empty area → **"Show Disabled Devices"**
3. If **Stereo Mix** appears → right-click → **Enable**
4. Select **Stereo Mix** as System Audio Device in the app

#### Troubleshooting

| Issue | Solution |
|-------|----------|
| CABLE not showing after install | Restart PC; verify you ran installer as Administrator |
| No audio after selecting CABLE | Enable "Listen to this device" (Step 4) |
| App doesn't see CABLE Output | Restart the app |
| High audio latency | Open VB-CABLE Control Panel → increase buffer size |

---

## Usage

### Interface

The interface consists of a **live transcription area** and a **Sidebar** on the left showing session history. The app supports English and Vietnamese UI, switchable in Settings.

The sidebar can be collapsed/expanded with the toggle button.

### Controls

- **▶ Start** — begin listening and transcribing (creates a new session, auto-named `Session N`)
- **⏸ Pause** — pause capture while keeping the session
- **▶ Resume** — continue capture in the same session
- **⊕ New Meeting** — end current session, start a new one
- **⏹ Stop** — end the session
- **Resume Session** — reopen a finished session and continue recording

Each speaker is color-coded. Results appear in real-time (partial) and when finalized (utterance).

### Sessions Sidebar

- Lists all saved sessions with creation date and duration
- **Click** a session to view the transcript and details (source, language, context, speakers)
- Long-press or multi-select mode for bulk deletion
- **Rename sessions** and **rename speakers** (e.g. "SPEAKER_00" → "Alice")
- **Export to Markdown** to save the conversation as a `.md` file

### Overlay

The overlay is a floating caption window that can sit on top of any application. Toggle it with the **Overlay** button in the navigation bar.

Customize overlay in **Settings → Overlay**:

| Setting | Description |
|---------|-------------|
| Opacity | Window transparency |
| Font Scale | Text size |
| Max Lines | Maximum lines displayed |
| Text Align | Left / center / right |
| Background | Dark or light background |
| Font Family | Caption font |
| Display Mode | Both partial+final / final only / partial only |

### Settings

Settings are organized into 4 tabs:

#### Audio Tab

| Setting | Description |
|---------|-------------|
| Audio Source | Microphone / System Audio / Both |
| Microphone Device | Select microphone input |
| System Audio Device | Select device for system audio capture |
| Mic Source Language | Language spoken into the mic (auto-detect or specify) |
| System Source Language | Language of system audio (auto-detect or specify) |
| Mic Target Language | Translation language for microphone |
| System Target Language | Translation language for system audio |

#### Engine Tab

| Setting | Description |
|---------|-------------|
| Transcription Engine | **Soniox** (cloud) or **Local Whisper** (offline) |
| Soniox API Key | API key for Soniox (Soniox mode only) |
| Whisper Model | Model size: tiny / base / small / medium / large-v3-turbo / large |
| Translation Service | None / Ollama / LibreTranslate (Local Whisper only) |
| Ollama Model | Select Ollama model from list |
| LibreTranslate URL | URL of the LibreTranslate server |
| HuggingFace Token | Token for downloading pyannote diarization models |

#### Context Tab

Set a default context for sessions — helps improve transcription accuracy for domain-specific conversations. Choose a preset or enter custom text:

| Preset | Description |
|--------|-------------|
| None | No context |
| Casual | Everyday conversation, informal speech, slang |
| Business | Business meetings, finance, strategy, corporate language |
| IT / Tech | Software engineering, code, architecture, debugging |
| News / Podcast | News broadcasts, formal speech, current events |
| Entertainment | Movies, anime, TV shows, social media, pop culture |
| Custom | Enter your own context text |

Context can also be changed directly on the live screen without opening Settings.

#### Overlay Tab

Customize the floating caption window (see Overlay section above).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS v4, Socket.IO Client |
| Backend | Node.js, Express 5, Socket.IO |
| Desktop | Electron |
| Audio | ffmpeg (avfoundation on macOS, dshow on Windows) |
| Speech-to-Text (cloud) | Soniox API |
| Speech-to-Text (local) | nodejs-whisper (whisper.cpp) |
| Speaker Diarization | pyannote-audio 3.1 (Python) |
| Translation (local) | Ollama / LibreTranslate |
| Database | SQLite (better-sqlite3) |

## Project Structure

```
node-trans/
├── client/                # React frontend (Vite + Tailwind CSS)
│   └── src/
│       ├── context/       # SocketContext (useReducer — central state)
│       ├── i18n/          # Internationalization (I18nContext, locales)
│       ├── components/
│       │   ├── live/      # Controls, Transcript, Utterance, OverlayWindow
│       │   ├── history/   # SpeakerList
│       │   └── settings/  # SettingsTab (modal), OverlaySettings
│       └── utils/         # api.js, constants.js, speakerColors.js
├── electron/              # Electron main process
│   ├── main.js
│   └── preload.js
├── scripts/
│   ├── download-ffmpeg.js # Download ffmpeg binary for Electron build
│   ├── build-whisper.js   # Compile whisper.cpp
│   └── setup-diarize.js   # Install Python deps for diarization
├── src/
│   ├── server.js          # Express + Socket.IO server
│   ├── audio/
│   │   ├── capture.js     # ffmpeg audio capture (macOS + Windows)
│   │   └── devices.js     # List audio devices
│   ├── local/
│   │   ├── whisper-session.js   # Local Whisper session (nodejs-whisper)
│   │   ├── diarize-session.js   # Diarization session (Python subprocess)
│   │   ├── diarize.py           # Python worker (pyannote + openai-whisper)
│   │   ├── diarize-setup.js     # Python dep installer (SSE streaming)
│   │   └── translate.js         # Ollama / LibreTranslate client
│   ├── soniox/
│   │   └── session.js     # Soniox real-time session
│   ├── storage/
│   │   ├── history.js     # SQLite DB (sessions, utterances, speaker aliases)
│   │   ├── settings.js    # Settings (~/.node-trans/settings.json)
│   │   └── export.js      # Export session to Markdown
│   └── routes/
│       └── api.js         # REST API endpoints
├── electron-builder.config.js
└── package.json
```

## Data Storage

Data is stored at `~/.node-trans/` (or Electron's userData directory):

- `settings.json` — application settings
- `history.db` — SQLite database with conversation history
- `diarize-venv/` — Python virtual env for diarization (created by `diarize:setup`)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/devices` | List audio devices |
| GET | `/api/settings` | Read settings |
| PUT | `/api/settings` | Save settings |
| GET | `/api/settings/overlay` | Read overlay settings |
| PUT | `/api/settings/overlay` | Save overlay settings |
| GET | `/api/local/status` | Local Whisper, diarization, Ollama, LibreTranslate status |
| GET | `/api/local/diarize-setup` | SSE stream of Python dependency install logs |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:id` | Session detail + utterances |
| PATCH | `/api/sessions/:id` | Rename session |
| PATCH | `/api/sessions/:id/context` | Update session context |
| DELETE | `/api/sessions/:id` | Delete session |
| PUT | `/api/sessions/:id/speakers/:speaker` | Rename speaker |
| GET | `/api/sessions/:id/export` | Export as Markdown |

## Socket.IO Events

| Event (Client → Server) | Description |
|--------------------------|-------------|
| `start-listening` | Start capture + transcription (supports `sessionId` for resume) |
| `pause-listening` | Pause capture |
| `resume-listening` | Resume capture |
| `stop-listening` | Stop capture |

| Event (Server → Client) | Description |
|--------------------------|-------------|
| `status` | Status update (listening, paused, sessionId, audioSource) |
| `utterance` | Complete utterance (source, original + translation, speaker) |
| `partial-result` | Partial/interim result |
| `error` | Error message |
