import { Router } from "express";
import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { loadSettings, saveSettings } from "../storage/settings.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Lazy-loaded modules
let _devices, _history, _export;
async function lazyDevices() {
  if (!_devices) _devices = await import("../audio/devices.js");
  return _devices;
}
async function lazyHistory() {
  if (!_history) _history = await import("../storage/history.js");
  return _history;
}
async function lazyExport() {
  if (!_export) _export = await import("../storage/export.js");
  return _export;
}

const router = Router();

// Disable caching for all API responses
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Devices
router.get("/devices", async (req, res) => {
  try {
    const { listAllDevices } = await lazyDevices();
    const devices = await listAllDevices();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings
router.get("/settings", (req, res) => {
  const settings = loadSettings();
  if (settings.sonioxApiKey) {
    settings.sonioxApiKey = "••••" + settings.sonioxApiKey.slice(-4);
  }
  if (settings.hfToken) {
    settings.hfToken = "••••" + settings.hfToken.slice(-4);
  }
  res.json(settings);
});

router.put("/settings", (req, res) => {
  const body = req.body;
  const existing = loadSettings();
  if (!body.sonioxApiKey || body.sonioxApiKey.startsWith("••••")) {
    body.sonioxApiKey = existing.sonioxApiKey;
  }
  if (!body.hfToken || body.hfToken.startsWith("••••")) {
    body.hfToken = existing.hfToken;
  }
  const updated = saveSettings(body);
  if (updated.sonioxApiKey) {
    updated.sonioxApiKey = "••••" + updated.sonioxApiKey.slice(-4);
  }
  if (updated.hfToken) {
    updated.hfToken = "••••" + updated.hfToken.slice(-4);
  }
  res.json(updated);
});

// Overlay settings
router.get("/settings/overlay", (req, res) => {
  const settings = loadSettings();
  res.json(settings.overlay || {});
});

router.put("/settings/overlay", (req, res) => {
  const current = loadSettings();
  const overlay = { ...(current.overlay || {}), ...req.body };
  const updated = saveSettings({ ...current, overlay });
  res.json(updated.overlay);
});

// Local Whisper status
router.get("/local/status", async (req, res) => {
  try {
    const settings = loadSettings();
    const base = join(__dirname, "../../node_modules/nodejs-whisper/cpp/whisper.cpp");
    const unpacked = base.replace(/app\.asar([/\\])/g, "app.asar.unpacked$1");
    const whisperCppPath = existsSync(join(unpacked, "models")) ? unpacked : base;
    const execName = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
    const binaryPaths = [
      join(whisperCppPath, "build", "bin", execName),
      join(whisperCppPath, "build", "bin", "Release", execName),
      join(whisperCppPath, "build", "bin", "Debug", execName),
      join(whisperCppPath, "build", execName),
    ];
    const whisperBuilt = binaryPaths.some(existsSync);

    const modelName = req.query.whisperModel || settings.whisperModel || "base";
    const modelFiles = {
      "tiny": "ggml-tiny.bin", "tiny.en": "ggml-tiny.en.bin",
      "base": "ggml-base.bin", "base.en": "ggml-base.en.bin",
      "small": "ggml-small.bin", "small.en": "ggml-small.en.bin",
      "medium": "ggml-medium.bin", "medium.en": "ggml-medium.en.bin",
      "large-v1": "ggml-large-v1.bin", "large": "ggml-large.bin",
      "large-v3-turbo": "ggml-large-v3-turbo.bin",
    };
    const modelFile = modelFiles[modelName];
    const modelPresent = modelFile
      ? existsSync(join(whisperCppPath, "models", modelFile))
      : false;

    let ollamaAvailable = false;
    let ollamaModelReady = false;
    try {
      const r = await fetch(`${settings.ollamaBaseUrl || "http://localhost:11434"}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        ollamaAvailable = true;
        const data = await r.json();
        const pulled = (data.models || []).map((m) => m.name.toLowerCase());
        const target = (req.query.ollamaModel || settings.ollamaModel || "").toLowerCase();
        ollamaModelReady = pulled.some((n) => n === target || n.startsWith(target + ":") || n === target + ":latest");
      }
    } catch {
      ollamaAvailable = false;
    }

    let libreTranslateAvailable = false;
    if (settings.libreTranslateUrl) {
      try {
        const r = await fetch(`${settings.libreTranslateUrl}/languages`, {
          signal: AbortSignal.timeout(2000),
        });
        libreTranslateAvailable = r.ok;
      } catch {
        libreTranslateAvailable = false;
      }
    }

    let diarizePyReady = false;
    try {
      let pythonBin = process.env.DIARIZE_PYTHON;
      if (!pythonBin) {
        const { default: os } = await import("os");
        const isWin = process.platform === "win32";
        const venvPython = join(os.homedir(), ".node-trans", "diarize-venv",
          isWin ? "Scripts\\python.exe" : "bin/python3");
        pythonBin = existsSync(venvPython) ? venvPython : "python3";
      }
      const verifyScript = [
        "import torchaudio",
        "hasattr(torchaudio,'set_audio_backend') or setattr(torchaudio,'set_audio_backend',lambda *a,**kw:None)",
        "hasattr(torchaudio,'get_audio_backend') or setattr(torchaudio,'get_audio_backend',lambda:'soundfile')",
        "import numpy as np",
        "hasattr(np,'NaN') or setattr(np,'NaN',np.nan)",
        "hasattr(np,'NAN') or setattr(np,'NAN',np.nan)",
        "import torch, whisper, pyannote.audio",
      ].join("; ");
      await new Promise((resolve) => {
        exec(`"${pythonBin}" -c "${verifyScript}"`, { timeout: 15000 }, (err) => {
          diarizePyReady = !err;
          resolve();
        });
      });
    } catch {
      diarizePyReady = false;
    }

    res.json({ whisperBuilt, modelPresent, ollamaAvailable, ollamaModelReady, libreTranslateAvailable, diarizePyReady, platform: process.platform });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Diarize setup — SSE endpoint for streaming install logs
router.get("/local/diarize-setup", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  try {
    const { runDiarizeSetup } = await import("../local/diarize-setup.js");
    await runDiarizeSetup((line) => send({ line }));
    send({ done: true });
  } catch (err) {
    send({ error: err.message });
  }
  res.end();
});

// Sessions
router.get("/sessions", async (req, res) => {
  const { getSessions } = await lazyHistory();
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  res.json(getSessions(limit, offset));
});

router.get("/sessions/:id", async (req, res) => {
  const { getSession, getUtterances, getSpeakerAliases } = await lazyHistory();
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const utterances = getUtterances(req.params.id);
  const speakerAliases = getSpeakerAliases(req.params.id);
  const aliasMap = Object.fromEntries(speakerAliases.map((a) => [a.speaker, a.alias]));
  res.json({ ...session, utterances, speakerAliases: aliasMap });
});

router.patch("/sessions/:id", async (req, res) => {
  const { renameSession } = await lazyHistory();
  const { title } = req.body;
  if (title == null) return res.status(400).json({ error: "title is required" });
  renameSession(req.params.id, title);
  res.json({ ok: true });
});

router.patch("/sessions/:id/context", async (req, res) => {
  const { updateSessionContext } = await lazyHistory();
  const { context } = req.body;
  updateSessionContext(req.params.id, context ?? null);
  res.json({ ok: true });
});

router.put("/sessions/:id/speakers/:speaker", async (req, res) => {
  const { setSpeakerAlias } = await lazyHistory();
  const { alias } = req.body;
  if (!alias) return res.status(400).json({ error: "alias is required" });
  setSpeakerAlias(req.params.id, req.params.speaker, alias);
  res.json({ ok: true });
});

router.delete("/sessions/:id", async (req, res) => {
  try {
    const { deleteSession } = await lazyHistory();
    deleteSession(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete session error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Export
router.get("/sessions/:id/export", async (req, res) => {
  const { exportSessionToMarkdown } = await lazyExport();
  const result = exportSessionToMarkdown(req.params.id);
  if (!result) return res.status(404).json({ error: "Session not found" });

  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="session-${req.params.id}.md"`);
  res.send(result.markdown);
});

export default router;
