import "dotenv/config";
import express from "express";
import compression from "compression";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import path from "path";

import apiRoutes from "./routes/api.js";
import { loadSettings } from "./storage/settings.js";
import { createLogger } from "./logger.js";

const log = createLogger("server");

// Set FFMPEG_PATH from ffmpeg-static when not already set (Electron sets it in main.js)
if (!process.env.FFMPEG_PATH) {
  try {
    const require = createRequire(import.meta.url);
    process.env.FFMPEG_PATH = require("ffmpeg-static");
  } catch {
    // ffmpeg-static not installed — fall back to system ffmpeg
  }
}

// Add ffmpeg directory to PATH so subprocesses (Python whisper etc.) can find it
if (process.env.FFMPEG_PATH) {
  const ffmpegDir = path.dirname(process.env.FFMPEG_PATH);
  process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH}`;
}

// Lazy-loaded modules (deferred to first use for faster startup)
let _history, _createSonioxSession, _createWhisperSession, _createDiarizeSession, _startCapture, _listInputDevices;

async function getHistory() {
  if (!_history) _history = await import("./storage/history.js");
  return _history;
}
async function getSonioxSession() {
  if (!_createSonioxSession) {
    const mod = await import("./soniox/session.js");
    _createSonioxSession = mod.createSession;
  }
  return _createSonioxSession;
}
async function getCapture() {
  if (!_startCapture) {
    const mod = await import("./audio/capture.js");
    _startCapture = mod.startCapture;
  }
  return _startCapture;
}
async function getWhisperSession() {
  if (!_createWhisperSession) {
    const mod = await import("./local/whisper-session.js");
    _createWhisperSession = mod.createSession;
  }
  return _createWhisperSession;
}
async function getDiarizeSession() {
  if (!_createDiarizeSession) {
    const mod = await import("./local/diarize-session.js");
    _createDiarizeSession = mod.createSession;
  }
  return _createDiarizeSession;
}
async function getDevices() {
  if (!_listInputDevices) {
    const mod = await import("./audio/devices.js");
    _listInputDevices = mod.listInputDevices;
  }
  return _listInputDevices;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../dist"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) {
      res.set("Cache-Control", "no-store");
    }
  },
}));
app.use("/api", apiRoutes);

// Active sessions per socket
const activeSessions = new Map();

// Log and emit an error event to the client in one call
function emitError(socket, payload) {
  log.warn(`Emit error: ${payload.key}`, { socketId: socket.id, ...payload.params && { params: payload.params } });
  socket.emit("error", payload);
}

io.on("connection", (socket) => {
  log.info("Client connected", { socketId: socket.id });

  socket.on("start-listening", async (opts) => {
    // Clean up any existing session
    await stopSession(socket.id);

    try {
      const history = await getHistory();
      const startCapture = await getCapture();
      const listInputDevices = await getDevices();

      const settings = loadSettings();
      const engine = settings.transcriptionEngine || "soniox";

      if (engine === "soniox" && !settings.sonioxApiKey) {
        emitError(socket, { key: "errNoApiKey" });
        return;
      }


      const resumeSessionId = opts?.sessionId;
      const requestedContext = typeof opts?.context === "string" && opts.context.trim() ? opts.context.trim() : null;
      let audioSource, micTargetLanguage, systemTargetLanguage, sessionContext;

      if (resumeSessionId) {
        // Resume existing session and re-use prior context unless overridden
        const existing = history.getSession(resumeSessionId);
        if (!existing || !existing.ended_at) {
          emitError(socket, { key: "errSessionNotFound" });
          return;
        }
        history.reopenSession(resumeSessionId);
        audioSource = existing.audio_source;
        const targetLang = existing.target_language;
        if (targetLang.includes(",")) {
          const [mic, sys] = targetLang.split(",");
          micTargetLanguage = mic;
          systemTargetLanguage = sys;
        } else {
          micTargetLanguage = targetLang;
          systemTargetLanguage = targetLang;
        }
        sessionContext = requestedContext || existing.context || null;
        if (requestedContext && requestedContext !== existing.context) {
          history.updateSessionContext(resumeSessionId, requestedContext);
        }
      } else {
        audioSource = settings.audioSource;
        const targetLanguage = settings.targetLanguage;
        micTargetLanguage = settings.micTargetLanguage ?? targetLanguage;
        systemTargetLanguage = settings.systemTargetLanguage ?? targetLanguage;
        sessionContext = requestedContext || null;
      }

      const languageHints = settings.languageHints || ["en"];

      // Resolve devices
      const devices = await listInputDevices();
      const isWin = process.platform === "win32";
      const micIndex = settings.micDeviceIndex ?? 0;
      const micDevice = devices.find((d) => d.index === micIndex);

      // On Windows, dshow needs device name; on macOS, avfoundation uses index
      const micCaptureDev = isWin ? micDevice?.name : micIndex;

      // System device: use manual setting or auto-detect virtual loopback input device
      let systemCaptureDev = null;
      if (audioSource === "system" || audioSource === "both") {
        const systemIndex = settings.systemDeviceIndex;
        if (systemIndex != null) {
          // Manual selection from settings
          const systemDevice = devices.find((d) => d.index === systemIndex);
          if (systemDevice) {
            systemCaptureDev = isWin ? systemDevice.name : systemDevice.index;
          } else {
            emitError(socket, { key: "errSystemDeviceNotFound", params: { index: systemIndex } });
          }
        } else {
          // Auto-detect: macOS: BlackHole, Windows: VB-CABLE / Stereo Mix / CABLE Output
          const loopbackPattern = isWin
            ? /cable|stereo mix|virtual|vb-audio/i
            : /blackhole/i;
          const loopback = devices.find((d) => loopbackPattern.test(d.name));
          if (loopback) {
            systemCaptureDev = isWin ? loopback.name : loopback.index;
          } else {
            emitError(socket, { key: isWin ? "errNoLoopbackWin" : "errNoLoopbackMac" });
          }
        }
      }

      const deviceName = micDevice?.name || `Device ${micIndex}`;

      // Create or reuse history session
      let dbSessionId;
      if (resumeSessionId) {
        dbSessionId = resumeSessionId;
      } else {
        const historyTargetLang = audioSource === "both" && micTargetLanguage !== systemTargetLanguage
          ? `${micTargetLanguage},${systemTargetLanguage}`
          : (audioSource === "system" ? systemTargetLanguage : micTargetLanguage);
        dbSessionId = history.createSession(audioSource, historyTargetLang, deviceName, sessionContext);
      }

      const sttMode = engine === "local-whisper"
        ? (settings.enableDiarization && settings.hfToken ? "diarize" : "whisper")
        : "soniox";
      log.info("Session starting", {
        socketId: socket.id,
        sessionId: dbSessionId,
        engine: sttMode,
        source: audioSource,
        micLang: micTargetLanguage,
        systemLang: systemTargetLanguage,
        resume: !!resumeSessionId,
      });

      const state = {
        dbSessionId,
        audioSource,
        paused: false,
        captures: [],
        sttSessions: [],
      };

      const sources = audioSource === "both"
        ? ["mic", "system"]
        : [audioSource];

      for (const source of sources) {
        const captureDev = source === "mic" ? micCaptureDev : systemCaptureDev;
        if (captureDev == null) {
          emitError(socket, { key: "errNoDevice", params: { source } });
          continue;
        }

        // Start audio capture
        const capture = startCapture(captureDev);
        capture.onError((err) => {
          emitError(socket, { key: "errAudioCapture", params: { source, detail: err.message } });
        });

        // Create STT session — Soniox (cloud) or local Whisper
        const sourceTargetLang = source === "mic" ? micTargetLanguage : systemTargetLanguage;
        let stt;
        if (engine === "local-whisper") {
          const sessionOpts = {
            targetLanguage: sourceTargetLang,
            languageHints,
            whisperModel: settings.whisperModel || "base",
            whisperLanguage: source === "mic"
              ? (settings.micWhisperLanguage || "auto")
              : (settings.systemWhisperLanguage || "auto"),
            localTranslationEngine: settings.localTranslationEngine || "none",
            ollamaBaseUrl: settings.ollamaBaseUrl,
            ollamaModel: settings.ollamaModel,
            libreTranslateUrl: settings.libreTranslateUrl,
            context: sessionContext,
          };
          if (settings.enableDiarization && settings.hfToken) {
            const createDiarizeSession = await getDiarizeSession();
            stt = createDiarizeSession({ ...sessionOpts, hfToken: settings.hfToken });
          } else {
            const createWhisperSession = await getWhisperSession();
            stt = createWhisperSession(sessionOpts);
          }
        } else {
          const createSonioxSession = await getSonioxSession();
          stt = createSonioxSession({ targetLanguage: sourceTargetLang, languageHints, apiKey: settings.sonioxApiKey || undefined, context: sessionContext });
        }

        stt.onPartial((partial) => {
          socket.emit("partial-result", { source, ...partial });
        });

        stt.onUtterance((utterance) => {
          socket.emit("utterance", { source, ...utterance });

          // Save to DB
          if (utterance.originalText) {
            history.addUtterance(dbSessionId, {
              ...utterance,
              source,
            });
          }
        });

        stt.onError((err) => {
          const key = engine === "local-whisper" ? "errWhisper" : "errSoniox";
          emitError(socket, { key, params: { detail: err.message } });
        });

        await stt.connect();
        await stt.startStreaming();

        // Pipe audio chunks to STT engine
        capture.stream.on("data", (chunk) => {
          stt.sendAudio(chunk);
        });

        capture.stream.on("end", () => {
          stt.stop().catch(() => {});
        });

        state.captures.push(capture);
        state.sttSessions.push(stt);
      }

      activeSessions.set(socket.id, state);
      socket.emit("status", { listening: true, sessionId: dbSessionId, audioSource });
      log.info("Started listening", { socketId: socket.id, sessionId: dbSessionId, source: audioSource });
    } catch (err) {
      const key = err.message?.includes("authenticate") || err.message?.includes("401") || err.message?.includes("Unauthorized")
        ? "errInvalidApiKey"
        : err.message?.includes("ENOTFOUND") || err.message?.includes("ECONNREFUSED")
        ? "errNetwork"
        : "errStartFailed";
      emitError(socket, { key, params: { detail: err.message } });
      log.error("Start error", err);
    }
  });

  socket.on("pause-listening", () => {
    const state = activeSessions.get(socket.id);
    if (!state || state.paused) return;

    for (const capture of state.captures) {
      capture.pause();
    }
    state.paused = true;
    socket.emit("status", { listening: true, paused: true, sessionId: state.dbSessionId, audioSource: state.audioSource });
    log.info("Paused", { socketId: socket.id });
  });

  socket.on("resume-listening", () => {
    const state = activeSessions.get(socket.id);
    if (!state || !state.paused) return;

    for (const capture of state.captures) {
      capture.resume();
    }
    state.paused = false;
    socket.emit("status", { listening: true, paused: false, sessionId: state.dbSessionId, audioSource: state.audioSource });
    log.info("Resumed", { socketId: socket.id });
  });

  socket.on("stop-listening", async () => {
    await stopSession(socket.id);
    socket.emit("status", { listening: false });
  });

  socket.on("disconnect", async () => {
    await stopSession(socket.id);
    log.info("Client disconnected", { socketId: socket.id });
  });
});

async function stopSession(socketId) {
  const state = activeSessions.get(socketId);
  if (!state) return;

  log.info("Stopping session", { socketId, sessionId: state.dbSessionId });

  for (const capture of state.captures) {
    capture.stop();
  }

  for (const stt of state.sttSessions) {
    try {
      await stt.stop();
    } catch {
      // Ignore stop errors
    }
  }

  const history = await getHistory();
  history.endSession(state.dbSessionId);
  activeSessions.delete(socketId);
}

// Start server
export async function startServer(overridePort) {
  const settings = loadSettings();
  const PORT = overridePort || process.env.PORT || settings.port || 3000;
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      log.info(`Server running at http://localhost:${PORT}`);
      resolve(PORT);
    });
  });
}

// Auto-start when running directly (not via Electron)
if (!process.env.ELECTRON) {
  startServer();
}
