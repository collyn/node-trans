# Node Trans

[English](README.en.md)

Ứng dụng nhận dạng và dịch âm thanh thời gian thực. Hỗ trợ nghe từ microphone, system audio hoặc cả hai. Hỗ trợ hai chế độ nhận dạng: **Soniox** (cloud, có dịch thuật tích hợp) và **Local Whisper** (offline, không cần API key).

Chạy trên **trình duyệt** (web) hoặc **ứng dụng desktop** (Electron). Hỗ trợ **macOS** và **Windows**.

## Yêu cầu phần cứng

> Phần này chỉ áp dụng cho chế độ **Local Whisper**. Nếu dùng **Soniox** (cloud), chỉ cần kết nối internet, không yêu cầu phần cứng đặc biệt.

### macOS

| Cấu hình | RAM | Tính năng dùng được |
|----------|-----|---------------------|
| Tối thiểu | 8 GB | Whisper tiny/base + Ollama gemma3:1b, không diarization |
| Đề xuất | Apple Silicon 16 GB | Full: Whisper medium/large-v3-turbo + Ollama gemma3:4b + Diarization |
| Tối ưu | Apple Silicon 32 GB | Full features với model lớn nhất, rất mượt |

**Khuyến nghị Apple Silicon** (M1/M2/M3 trở lên): unified memory cho phép CPU và GPU dùng chung RAM — Whisper (Metal), Ollama (Metal) và Diarization (MPS) đều được tăng tốc phần cứng, nhanh hơn Intel 4–6x với cùng model.

### Windows

| Cấu hình | RAM | GPU | Tính năng dùng được |
|----------|-----|-----|---------------------|
| Tối thiểu | 16 GB | Không cần | Whisper tiny/base + Ollama nhỏ (chậm), không diarization |
| Đề xuất | 16 GB | NVIDIA 8 GB VRAM (RTX 3060+) | Whisper medium + Ollama gemma3:4b + Diarization |
| Tối ưu | 32 GB | NVIDIA 12 GB+ VRAM (RTX 4070 Ti+) | Full features thoải mái |

**Lưu ý Windows:** AMD GPU không được hỗ trợ. Không có GPU NVIDIA, diarization không chạy được realtime. Cần cài [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) để kích hoạt GPU acceleration cho Whisper và Ollama.

### Dung lượng ổ cứng (Local Whisper)

| Thành phần | Dung lượng |
|-----------|-----------|
| Whisper model base | ~150 MB |
| Whisper model large-v3-turbo | ~1.6 GB |
| Ollama + model gemma3:4b | ~3.5 GB |
| Python venv cho diarization (torch) | ~4–6 GB |
| Model pyannote diarization | ~1 GB |
| **Tổng (full)** | **~10–12 GB** |

---

## Yêu cầu phần mềm

- **Node.js** >= 20
- **ffmpeg** (tự động tải khi build Electron, hoặc cài thủ công cho chế độ web)

### Cài ffmpeg (chế độ web)

| Hệ điều hành | Cách cài                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------- |
| macOS        | `brew install ffmpeg`                                                                             |
| Windows      | `winget install ffmpeg` hoặc tải từ [ffmpeg.org](https://ffmpeg.org/download.html), thêm vào PATH |

## Cài đặt

```bash
# Clone và cài dependencies
npm install

# Build frontend
npm run build
```

## Chạy

### Chế độ Web (trình duyệt)

```bash
# Production
npm start

# Development (chạy server + client đồng thời)
npm run dev
```

- Production: mở `http://localhost:3000`
- Development: mở `http://localhost:5173` (Vite dev server, tự proxy API)

### Chế độ Electron (desktop app)

```bash
# Development
npm run electron:dev

# Build app
npm run electron:build          # Build cho platform hiện tại
npm run electron:build:mac      # Build cho macOS
npm run electron:build:win      # Build cho Windows
```

---

## Chế độ Soniox (Cloud)

Sử dụng [Soniox API](https://soniox.com/docs/stt/rt/real-time-translation) để nhận dạng và dịch thuật thời gian thực. Cần đăng ký tài khoản tại [soniox.com](https://soniox.com) để lấy API key.

### Cấu hình API Key

Vào **Settings → Engine** → nhập API key vào ô **Soniox API Key**.

Hoặc tạo file `.env` tại thư mục gốc:

```
SONIOX_API_KEY=your_api_key_here
```

API key trong Settings được ưu tiên hơn `.env`.

Soniox hỗ trợ nhận dạng giọng nói đa ngôn ngữ và dịch thuật tích hợp, tự động phân biệt speaker (diarization) mà không cần cài thêm gì.

---

## Chế độ Local Whisper (Offline)

Nhận dạng giọng nói hoàn toàn offline bằng [Whisper](https://github.com/openai/whisper) chạy trực tiếp trên máy. Không cần API key, không gửi dữ liệu ra ngoài.

### Bước 1 — Build Whisper

```bash
npm run whisper:build
```

Quá trình này biên dịch whisper.cpp (~vài phút, cần có build tools). Cần chạy một lần duy nhất.

### Bước 2 — Tải model Whisper

Model **không** tự tải khi build. Cần tải thủ công vào đúng thư mục.

```bash
# Tìm thư mục models
ls node_modules/nodejs-whisper/cpp/whisper.cpp/models/
```

Tải model bằng script có sẵn trong whisper.cpp:

```bash
cd node_modules/nodejs-whisper/cpp/whisper.cpp
bash models/download-ggml-model.sh base
```

Hoặc tải trực tiếp từ [huggingface.co/ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp) và đặt file vào thư mục `models/`.

#### Bảng model Whisper

| Model            | File size | RAM tối thiểu | Độ chính xác | Tốc độ    |
| ---------------- | --------- | ------------- | ------------ | --------- |
| `tiny`           | ~75 MB    | ~1 GB         | Thấp         | Rất nhanh |
| `base`           | ~150 MB   | ~1 GB         | Trung bình   | Nhanh     |
| `small`          | ~500 MB   | ~2 GB         | Khá          | Vừa       |
| `medium`         | ~1.5 GB   | ~5 GB         | Cao          | Chậm      |
| `large-v3-turbo` | ~1.6 GB   | ~4 GB         | Rất cao      | Vừa       |
| `large`          | ~3 GB     | ~8 GB         | Tốt nhất     | Chậm nhất |

Model mặc định: `base`. Khuyên dùng `large-v3-turbo` trên Apple Silicon.

### Bước 3 — Cấu hình trong app

Vào **Settings → Engine**:

- **Transcription Engine** → chọn **Local Whisper**
- **Whisper Model** → chọn model đã tải

### Bước 4 — Dịch thuật khi dùng Local Whisper

Local Whisper chỉ nhận dạng giọng nói, không dịch thuật. Cần chọn thêm một dịch vụ dịch:

#### Không dịch

Chọn **Translation Service → None**. Transcript hiển thị ngôn ngữ gốc của người nói.

#### Ollama (local, offline)

1. Cài [Ollama](https://ollama.com) và kéo model:

```bash
ollama pull gemma3:4b   # Khuyên dùng (~3GB, cân bằng tốc độ/chất lượng)
```

2. Trong **Settings → Engine**: chọn **Ollama** làm Translation Service, chọn model từ danh sách.

Các model Ollama được hỗ trợ:

| Model          | RAM    | Tốc độ  | Chất lượng           |
| -------------- | ------ | ------- | -------------------- |
| `gemma3:1b`    | ~1 GB  | Rất nhanh | Cơ bản             |
| `llama3.2:3b`  | ~2 GB  | Nhanh   | Tốt                  |
| `gemma3:4b`    | ~3 GB  | Nhanh   | Khá tốt (khuyên dùng) |
| `llama3.1:8b`  | ~5 GB  | Vừa     | Tốt                  |
| `gemma3:12b`   | ~8 GB  | Chậm hơn | Rất tốt            |

Ollama chạy trên `http://localhost:11434` (mặc định).

#### LibreTranslate (local, offline)

1. Cài và chạy [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) (Docker hoặc pip)
2. Trong **Settings → Engine**: chọn **LibreTranslate**, nhập URL (mặc định `http://localhost:5000`)

---

## Speaker Diarization (Phân biệt người nói) — Local Whisper

Khi dùng Local Whisper, có thể bật tính năng phân biệt người nói bằng [pyannote-audio](https://github.com/pyannote/pyannote-audio). Mỗi câu nói sẽ được gán nhãn `SPEAKER_00`, `SPEAKER_01`, v.v.

### Yêu cầu thêm

- **Python 3.10+**
- **HuggingFace account** + token (miễn phí)

### Thiết lập

**Bước 1 — Cài Python dependencies**

```bash
npm run diarize:setup
```

Lệnh này cài `torch`, `torchaudio`, `openai-whisper`, `pyannote.audio` vào virtual env tại `~/.node-trans/diarize-venv/`. Cần kết nối internet, mất khoảng 5–15 phút.

> Có thể cài trong app: **Settings → Engine → Speaker Diarization → Cài đặt**.

**Bước 2 — Tạo HuggingFace token**

1. Đăng ký/đăng nhập tại [huggingface.co](https://huggingface.co)
2. Vào **Settings → Access Tokens** → tạo token loại **READ**
3. Chấp nhận điều khoản sử dụng tại:
   - [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)

**Bước 3 — Cấu hình trong app**

Vào **Settings → Engine → Speaker Diarization**:

- Nhập **HuggingFace Token**

Lần đầu tiên bật, app sẽ tải model ~1GB. Từ lần sau, sẵn sàng trong ~10–15 giây.

> **Lưu ý hiệu năng:** Diarization cần thêm RAM và thời gian xử lý. Mỗi cửa sổ 10 giây âm thanh sẽ xử lý song song với nhận dạng. Trên Apple Silicon (MPS) nhanh hơn đáng kể so với CPU.

---

## Capture System Audio

Để capture âm thanh hệ thống (Google Meet, Zoom, YouTube, v.v.), máy tính cần một **virtual audio driver**.

> **Tại sao cần?** Mặc định, hệ điều hành không cho phép app trực tiếp "nghe" output âm thanh. Virtual driver tạo ra một thiết bị trung gian: bạn chuyển output sang thiết bị ảo đó, và app đọc input từ cùng thiết bị đó.

---

### macOS — BlackHole

**BlackHole** là virtual audio driver miễn phí, phổ biến nhất trên macOS.

#### Bước 1 — Cài BlackHole

**Cách A: Homebrew (khuyên dùng)**

```bash
brew install blackhole-2ch
```

**Cách B: Tải trực tiếp**

- Vào [existential.audio/blackhole](https://existential.audio/blackhole/) → chọn **BlackHole 2ch** → điền email → tải file `.pkg` → chạy installer

Sau khi cài xong, **restart máy** để driver được load.

#### Bước 2 — Kiểm tra cài thành công

1. Mở **System Settings → Sound**
2. Ở tab **Output** và **Input**, bạn sẽ thấy **BlackHole 2ch** trong danh sách
3. Nếu chưa thấy → restart lại máy

#### Bước 3 — Tạo Aggregate Device (để nghe + capture cùng lúc)

> Bước này quan trọng: nếu chỉ chọn BlackHole làm output thì loa sẽ bị tắt tiếng. Aggregate Device giúp âm thanh ra loa **đồng thời** được capture vào app.

1. Mở **Audio MIDI Setup**
   - Spotlight (⌘ Space) → gõ "Audio MIDI Setup" → Enter
   - Hoặc: `/Applications/Utilities/Audio MIDI Setup.app`

2. Nhấn **"+"** ở góc dưới bên trái → chọn **Create Aggregate Device**

3. Trong danh sách bên phải, **tick chọn cả hai**:
   - ✅ **BlackHole 2ch**
   - ✅ **Loa đang dùng** (ví dụ: "MacBook Pro Speakers", "External Headphones")

4. Đặt tên dễ nhớ, ví dụ: **"Node Trans Aggregate"**

5. Đảm bảo **clock source** được set vào loa chính (không phải BlackHole) để tránh tiếng lạch cạch

#### Bước 4 — Đặt Aggregate Device làm Output mặc định

1. Vào **System Settings → Sound → Output**
2. Chọn **"Node Trans Aggregate"**
3. Từ lúc này, âm thanh sẽ ra loa bình thường và BlackHole sẽ capture đồng thời

#### Bước 5 — Cấu hình trong app

1. Vào **Settings → Audio** trong Node Trans
2. **Audio Source** → chọn **"System Audio"** hoặc **"Both"**
3. **System Audio Device** → chọn **"BlackHole 2ch"**
4. Nhấn **Start**

> **Lưu ý khi dùng xong:** Nhớ chuyển Output về loa gốc trong System Settings → Sound.

#### Xử lý sự cố

| Vấn đề                               | Giải pháp                                                                |
| ------------------------------------ | ------------------------------------------------------------------------ |
| Không thấy BlackHole trong danh sách | Restart máy, nếu vẫn không thấy thì cài lại                              |
| Âm thanh bị delay/echo               | Trong Audio MIDI Setup, đặt Clock Source = loa chính                     |
| App không detect BlackHole           | Khởi động lại app, kiểm tra System Audio Device đã chọn đúng chưa        |
| Mất âm thanh sau khi cài             | Kiểm tra Output trong System Settings → Sound, chọn lại Aggregate Device |

---

### Windows — VB-CABLE

**VB-CABLE** là virtual audio driver miễn phí trên Windows.

#### Bước 1 — Tải và cài VB-CABLE

1. Vào [vb-audio.com/Cable](https://vb-audio.com/Cable/)
2. Kéo xuống phần **"Download VB-CABLE Driver"** → tải về
3. Giải nén → chạy **`VBCABLE_Setup_x64.exe`** với quyền **Administrator**
4. Nhấn **"Install Driver"** → chờ cài xong
5. **Restart máy**

#### Bước 2 — Kiểm tra cài thành công

1. Chuột phải vào icon loa → **Sound settings**
2. Output: thấy **"CABLE Input (VB-Audio Virtual Cable)"**
3. Input: thấy **"CABLE Output (VB-Audio Virtual Cable)"**

#### Bước 3 — Chuyển Output sang CABLE Input

Vào **Settings → System → Sound** → phần **Output** → chọn **"CABLE Input"**

> ⚠️ Sau bước này loa sẽ bị tắt tiếng. Xem Bước 4.

#### Bước 4 — Bật "Listen to this device" để nghe loa đồng thời

1. Chuột phải icon loa → **Sounds** → tab **Recording**
2. Double-click **"CABLE Output"** → tab **Listen**
3. Tick **"Listen to this device"** → chọn loa thật → OK

#### Bước 5 — Cấu hình trong app

1. Vào **Settings → Audio** trong Node Trans
2. **Audio Source** → chọn **"System Audio"** hoặc **"Both"**
3. **System Audio Device** → chọn **"CABLE Output (VB-Audio Virtual Cable)"**
4. Nhấn **Start**

#### Phương án thay thế — Stereo Mix

Một số máy Windows có **Stereo Mix** sẵn (Realtek audio):

1. Chuột phải icon loa → **Sounds** → tab **Recording**
2. Chuột phải vùng trống → **"Show Disabled Devices"**
3. Nếu thấy **Stereo Mix** → chuột phải → **Enable**
4. Trong app, chọn **Stereo Mix** làm System Audio Device

#### Xử lý sự cố

| Vấn đề                          | Giải pháp                                          |
| ------------------------------- | -------------------------------------------------- |
| Không thấy CABLE sau khi cài    | Restart máy, kiểm tra đã Run as Administrator chưa |
| Âm thanh mất sau khi chọn CABLE | Bật "Listen to this device" theo Bước 4            |
| App không thấy CABLE Output     | Khởi động lại app                                  |
| Tiếng bị trễ                    | Vào VB-CABLE Control Panel → tăng buffer size      |

---

## Sử dụng

### Giao diện chính

Giao diện gồm **khu vực dịch trực tiếp** và **Sidebar** bên trái hiển thị lịch sử sessions. App hỗ trợ đa ngôn ngữ (English / Tiếng Việt), chuyển đổi trong Settings.

Sidebar có thể thu gọn/mở rộng bằng nút toggle.

### Điều khiển

- **▶ Start** — bắt đầu nghe và nhận dạng (tạo session mới, tự đặt tên `Session N`)
- **⏸ Pause** — tạm dừng capture, giữ nguyên session
- **▶ Resume** — tiếp tục capture trong cùng session
- **⊕ New Meeting** — kết thúc session hiện tại, bắt đầu session mới
- **⏹ Stop** — kết thúc session
- **Resume Session** — mở lại session đã kết thúc và tiếp tục ghi

Mỗi speaker được phân biệt bằng màu sắc riêng. Kết quả hiển thị realtime (partial) và hoàn chỉnh (final).

### Sidebar Sessions

- Danh sách các session đã lưu, hiển thị ngày tạo và thời lượng
- **Click** vào session để xem transcript và thông tin chi tiết (nguồn, ngôn ngữ, context, speakers)
- Long-press hoặc chế độ chọn nhiều để xóa hàng loạt
- **Đổi tên session** và **đổi tên speaker** (ví dụ: "SPEAKER_00" → "Anh Nam")
- **Export Markdown** để lưu nội dung ra file `.md`

### Overlay

Overlay là cửa sổ caption nổi có thể đặt đè lên bất kỳ ứng dụng nào. Bật/tắt bằng nút **Overlay** trên thanh điều hướng.

Tuỳ chỉnh overlay trong **Settings → Overlay**:

| Tuỳ chỉnh    | Mô tả                                           |
| ------------ | ----------------------------------------------- |
| Opacity      | Độ trong suốt của overlay                       |
| Font Scale   | Cỡ chữ                                          |
| Max Lines    | Số dòng tối đa hiển thị                         |
| Text Align   | Căn lề chữ (trái / giữa / phải)                 |
| Background   | Nền tối hoặc nền sáng                           |
| Font Family  | Phông chữ                                       |
| Display Mode | Hiện cả partial+final / chỉ final / chỉ partial |

### Settings

Settings được tổ chức thành 4 tab:

#### Tab Audio

| Cài đặt                | Mô tả                                          |
| ---------------------- | ---------------------------------------------- |
| Audio Source           | Microphone / System Audio / Both               |
| Microphone Device      | Chọn microphone                                |
| System Audio Device    | Chọn device capture system audio               |
| Mic Source Language    | Ngôn ngữ nói vào micro (auto hoặc chỉ định)    |
| System Source Language | Ngôn ngữ của system audio (auto hoặc chỉ định) |
| Mic Target Language    | Ngôn ngữ dịch cho micro                        |
| System Target Language | Ngôn ngữ dịch cho system audio                 |

#### Tab Engine

| Cài đặt              | Mô tả                                                        |
| -------------------- | ------------------------------------------------------------ |
| Transcription Engine | **Soniox** (cloud) hoặc **Local Whisper** (offline)          |
| Soniox API Key       | API key cho Soniox (chỉ khi dùng Soniox)                     |
| Whisper Model        | Model Whisper: tiny / base / small / medium / large-v3-turbo / large |
| Translation Service  | None / Ollama / LibreTranslate (chỉ khi dùng Local Whisper)  |
| Ollama Model         | Chọn model Ollama từ danh sách                               |
| LibreTranslate URL   | URL của LibreTranslate server                                |
| HuggingFace Token    | Token để tải pyannote models cho diarization                 |

#### Tab Context

Đặt ngữ cảnh mặc định cho session — giúp cải thiện độ chính xác nhận dạng theo từng chủ đề. Có thể chọn preset hoặc nhập tùy chỉnh:

| Preset        | Mô tả                                        |
| ------------- | -------------------------------------------- |
| None          | Không có ngữ cảnh                            |
| Casual        | Hội thoại thông thường, ngôn ngữ đời thường  |
| Business      | Họp kinh doanh, tài chính, chiến lược        |
| IT / Tech     | Thảo luận kỹ thuật, lập trình, kiến trúc     |
| News / Podcast | Bản tin, podcast, sự kiện thời sự           |
| Entertainment | Phim, anime, mạng xã hội, văn hóa đại chúng |
| Custom        | Nhập ngữ cảnh tùy chỉnh                      |

Ngữ cảnh cũng có thể thay đổi trực tiếp trên màn hình live mà không cần vào Settings.

#### Tab Overlay

Tuỳ chỉnh cửa sổ overlay caption (xem phần Overlay bên trên).

---

## Tech Stack

| Layer                  | Công nghệ                                            |
| ---------------------- | ---------------------------------------------------- |
| Frontend               | React 19, Vite, Tailwind CSS v4, Socket.IO Client    |
| Backend                | Node.js, Express 5, Socket.IO                        |
| Desktop                | Electron                                             |
| Audio                  | ffmpeg (avfoundation trên macOS, dshow trên Windows) |
| Speech-to-Text (cloud) | Soniox API                                           |
| Speech-to-Text (local) | nodejs-whisper (whisper.cpp)                         |
| Speaker Diarization    | pyannote-audio 3.1 (Python)                          |
| Translation (local)    | Ollama / LibreTranslate                              |
| Database               | SQLite (better-sqlite3)                              |

## Cấu trúc project

```
node-trans/
├── client/                # React frontend (Vite + Tailwind CSS)
│   └── src/
│       ├── context/       # SocketContext (useReducer — state trung tâm)
│       ├── i18n/          # Đa ngôn ngữ (I18nContext, locales)
│       ├── components/
│       │   ├── live/      # Controls, Transcript, Utterance, OverlayWindow
│       │   ├── history/   # SpeakerList
│       │   └── settings/  # SettingsTab (modal), OverlaySettings
│       └── utils/         # api.js, constants.js, speakerColors.js
├── electron/              # Electron main process
│   ├── main.js
│   └── preload.js
├── scripts/
│   ├── download-ffmpeg.js # Tải ffmpeg binary cho Electron build
│   ├── build-whisper.js   # Biên dịch whisper.cpp
│   └── setup-diarize.js   # Cài Python deps cho diarization
├── src/
│   ├── server.js          # Express + Socket.IO server
│   ├── audio/
│   │   ├── capture.js     # ffmpeg audio capture
│   │   └── devices.js     # Liệt kê audio devices
│   ├── local/
│   │   ├── whisper-session.js   # Local Whisper session (nodejs-whisper)
│   │   ├── diarize-session.js   # Diarization session (Python subprocess)
│   │   ├── diarize.py           # Python worker (pyannote + openai-whisper)
│   │   ├── diarize-setup.js     # Cài Python deps (streaming SSE)
│   │   └── translate.js         # Ollama / LibreTranslate client
│   ├── soniox/
│   │   └── session.js     # Soniox realtime session
│   ├── storage/
│   │   ├── history.js     # SQLite DB
│   │   ├── settings.js    # Settings (~/.node-trans/settings.json)
│   │   └── export.js      # Export Markdown
│   └── routes/
│       └── api.js         # REST API endpoints
├── electron-builder.config.js
└── package.json
```

## Dữ liệu

Dữ liệu được lưu tại `~/.node-trans/` (hoặc thư mục userData của Electron):

- `settings.json` — cài đặt ứng dụng
- `history.db` — SQLite database lịch sử hội thoại
- `diarize-venv/` — Python virtual env cho diarization (tạo bởi `diarize:setup`)

## API Endpoints

| Method | Endpoint                              | Mô tả                                                         |
| ------ | ------------------------------------- | ------------------------------------------------------------- |
| GET    | `/api/devices`                        | Danh sách audio devices                                       |
| GET    | `/api/settings`                       | Đọc settings                                                  |
| PUT    | `/api/settings`                       | Lưu settings                                                  |
| GET    | `/api/settings/overlay`               | Đọc overlay settings                                          |
| PUT    | `/api/settings/overlay`               | Lưu overlay settings                                          |
| GET    | `/api/local/status`                   | Trạng thái local Whisper, diarization, Ollama, LibreTranslate |
| GET    | `/api/local/diarize-setup`            | SSE stream log cài Python deps                                |
| GET    | `/api/sessions`                       | Danh sách sessions                                            |
| GET    | `/api/sessions/:id`                   | Chi tiết session + utterances                                 |
| PATCH  | `/api/sessions/:id`                   | Đổi tên session                                               |
| PATCH  | `/api/sessions/:id/context`           | Cập nhật context                                              |
| DELETE | `/api/sessions/:id`                   | Xóa session                                                   |
| PUT    | `/api/sessions/:id/speakers/:speaker` | Đổi tên speaker                                               |
| GET    | `/api/sessions/:id/export`            | Xuất Markdown                                                 |

## Socket.IO Events

| Event (Client → Server) | Mô tả                                                      |
| ----------------------- | ---------------------------------------------------------- |
| `start-listening`       | Bắt đầu capture + nhận dạng (hỗ trợ `sessionId` để resume) |
| `pause-listening`       | Tạm dừng                                                   |
| `resume-listening`      | Tiếp tục                                                   |
| `stop-listening`        | Dừng                                                       |

| Event (Server → Client) | Mô tả                                                    |
| ----------------------- | -------------------------------------------------------- |
| `status`                | Trạng thái (listening, paused, sessionId, audioSource)   |
| `utterance`             | Câu hoàn chỉnh (source, original + translation, speaker) |
| `partial-result`        | Kết quả tạm thời                                         |
| `error`                 | Lỗi                                                      |
