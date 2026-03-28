/**
 * Streaming diarization setup — installs Python deps into ~/.node-trans/diarize-venv.
 * Used by the /api/local/diarize-setup SSE endpoint so the packaged app can
 * run setup without needing access to scripts/setup-diarize.js.
 */

import { spawn, execSync } from "child_process";
import { mkdirSync } from "fs";
import { join } from "path";
import os from "os";

const isWin = process.platform === "win32";

function findPython() {
  if (process.env.DIARIZE_PYTHON) return process.env.DIARIZE_PYTHON;
  const candidates = isWin
    ? ["py", "python3.12", "python3.11", "python3", "python"]
    : [
        "/opt/homebrew/opt/python@3.12/bin/python3.12",
        "/opt/homebrew/opt/python@3.11/bin/python3.11",
        "python3.12",
        "python3.11",
        "python3",
      ];
  for (const bin of candidates) {
    try {
      const out = execSync(`"${bin}" --version 2>&1`).toString().trim();
      const m = out.match(/Python (\d+)\.(\d+)/);
      if (m) {
        const [, maj, min] = m.map(Number);
        if (maj === 3 && min >= 10 && min <= 12) return bin;
      }
    } catch {}
  }
  return isWin ? "py" : "python3";
}

function spawnLines(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    const feed = (chunk) => {
      buf += chunk.toString();
      const parts = buf.split("\n");
      buf = parts.pop();
      for (const l of parts) if (l.trim()) onLine(l);
    };
    proc.stdout.on("data", feed);
    proc.stderr.on("data", feed);
    proc.on("close", (code) => {
      if (buf.trim()) onLine(buf);
      if (code === 0) resolve();
      else reject(new Error(`Process exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

export async function runDiarizeSetup(onLine) {
  const pythonBin = findPython();
  const VENV_DIR = join(os.homedir(), ".node-trans", "diarize-venv");
  const venvPython = isWin
    ? join(VENV_DIR, "Scripts", "python.exe")
    : join(VENV_DIR, "bin", "python3");

  let versionStr;
  try {
    versionStr = execSync(`"${pythonBin}" --version 2>&1`).toString().trim();
  } catch {
    throw new Error(
      `Python not found: ${pythonBin}. Install Python 3.11 via: ${isWin ? "https://www.python.org/downloads/" : "brew install python@3.11"}`
    );
  }

  onLine(`Using ${pythonBin} (${versionStr})`);

  const m = versionStr.match(/Python (\d+)\.(\d+)/);
  if (!m) throw new Error("Could not parse Python version");
  const [, major, minor] = m.map(Number);
  if (major < 3 || (major === 3 && minor < 10)) {
    throw new Error(`Python 3.10+ required. Found: ${versionStr}`);
  }
  if (major === 3 && minor > 12) {
    onLine(`Warning: Python ${major}.${minor} may have compatibility issues with pyannote.audio 3.1.1`);
    onLine(isWin
      ? `Recommended: Install Python 3.11 from https://www.python.org/downloads/`
      : `Recommended: brew install python@3.11`);
  }

  onLine(`Creating virtual environment at: ${VENV_DIR}`);
  mkdirSync(join(os.homedir(), ".node-trans"), { recursive: true });
  await spawnLines(pythonBin, ["-m", "venv", VENV_DIR], onLine);

  onLine("\n> Upgrading pip...");
  await spawnLines(venvPython, ["-m", "pip", "install", "--upgrade", "pip"], onLine);

  onLine("\n> Installing torch and torchaudio...");
  await spawnLines(venvPython, ["-m", "pip", "install", "torch", "torchaudio"], onLine);

  onLine("\n> Installing openai-whisper...");
  await spawnLines(venvPython, ["-m", "pip", "install", "openai-whisper"], onLine);

  onLine("\n> Installing matplotlib...");
  await spawnLines(venvPython, ["-m", "pip", "install", "matplotlib"], onLine);

  onLine("\n> Installing pyannote.audio 3.1.1...");
  await spawnLines(venvPython, ["-m", "pip", "install", "pyannote.audio==3.1.1"], onLine);

  onLine("\nVerifying installation...");
  const verifyScript = [
    "import torchaudio",
    "hasattr(torchaudio,'set_audio_backend') or setattr(torchaudio,'set_audio_backend',lambda *a,**kw:None)",
    "import numpy as np",
    "hasattr(np,'NaN') or setattr(np,'NaN',np.nan)",
    "import torch, whisper, pyannote.audio",
    "print('OK')",
  ].join("; ");
  await spawnLines(venvPython, ["-c", verifyScript], onLine);

  onLine("\nAll dependencies installed successfully.");
}
