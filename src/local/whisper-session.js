/**
 * Local Whisper STT session — same interface as src/soniox/session.js.
 *
 * Audio is buffered in 3-second windows. Each window is written to a temp WAV
 * file, processed by whisper.cpp via whisper-cli spawn, then the text is emitted
 * as a partial-result. After SILENCE_THRESHOLD consecutive silent windows the
 * accumulated text is emitted as a final utterance and the buffer resets.
 */

import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { translateText } from "./translate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // s16le
const SEGMENT_MS = 3000;
const SEGMENT_BYTES = (SAMPLE_RATE * BYTES_PER_SAMPLE * SEGMENT_MS) / 1000; // 96,000 bytes
const SILENCE_THRESHOLD = 3; // consecutive silent/empty windows → flush utterance
const MIN_FLUSH_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * 0.5; // 0.5s minimum

const MODEL_FILES = {
  "tiny":           "ggml-tiny.bin",
  "tiny.en":        "ggml-tiny.en.bin",
  "base":           "ggml-base.bin",
  "base.en":        "ggml-base.en.bin",
  "small":          "ggml-small.bin",
  "small.en":       "ggml-small.en.bin",
  "medium":         "ggml-medium.bin",
  "medium.en":      "ggml-medium.en.bin",
  "large-v1":       "ggml-large-v1.bin",
  "large":          "ggml-large.bin",
  "large-v3-turbo": "ggml-large-v3-turbo.bin",
};

// Resolve the whisper.cpp directory.
// When packaged in Electron, __dirname is inside app.asar (a virtual archive
// that cannot be cd'd into or executed from). Binary files are placed in
// app.asar.unpacked by the asarUnpack config. We detect and correct the path.
function resolveWhisperCppPath() {
  const base = join(__dirname, "../../node_modules/nodejs-whisper/cpp/whisper.cpp");
  const unpacked = base.replace(/app\.asar([/\\])/g, "app.asar.unpacked$1");
  // Prefer the unpacked path if it exists on disk (packaged Electron case)
  return existsSync(join(unpacked, "models")) ? unpacked
    : existsSync(join(base, "models")) ? base
    : unpacked; // fallback — let the later existsSync on the binary catch the error
}

function findBinary(whisperCppPath) {
  const name = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const candidates = [
    join(whisperCppPath, "build", "bin", name),
    join(whisperCppPath, "build", "bin", "Release", name),
    join(whisperCppPath, "build", "bin", "Debug", name),
    join(whisperCppPath, "build", name),
    join(whisperCppPath, name),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

// Invoke whisper-cli directly via spawn, avoiding nodejs-whisper's internal
// path resolution which breaks under Electron ASAR packaging.
function runWhisperCli(wavPath, whisperCppPath, binaryPath, { language, translateToEnglish, initialPrompt, modelName }) {
  return new Promise((resolve, reject) => {
    const modelFile = MODEL_FILES[modelName];
    if (!modelFile) return reject(new Error(`Unknown model: ${modelName}`));

    const modelPath = join(whisperCppPath, "models", modelFile);
    if (!existsSync(modelPath)) {
      return reject(new Error(
        `Model file not found: ${modelPath}\n` +
        `Download it with: cd node_modules/nodejs-whisper/cpp/whisper.cpp && bash models/download-ggml-model.sh ${modelName}`
      ));
    }

    const args = ["-m", modelPath, "-f", wavPath];
    if (language && language !== "auto") args.push("-l", language);
    if (translateToEnglish) args.push("-tr");
    if (initialPrompt) args.push("--prompt", initialPrompt);

    let stdout = "";
    let stderr = "";
    const proc = spawn(binaryPath, args, { cwd: whisperCppPath });
    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `whisper-cli exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

// Build a valid RIFF/WAV header around raw PCM s16le 16kHz mono data.
function writePcmWav(pcmData) {
  const wavPath = join(tmpdir(), `node-trans-${randomUUID()}.wav`);
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(dataSize + 36, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);                        // PCM
  header.writeUInt16LE(1, 22);                        // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  writeFileSync(wavPath, Buffer.concat([header, pcmData]));
  return wavPath;
}

// Energy-based silence detection — avoids running Whisper on quiet segments.
function isProbablySilence(pcmData) {
  if (pcmData.length < BYTES_PER_SAMPLE) return true;
  let sumSq = 0;
  const samples = pcmData.length >> 1;
  for (let i = 0; i < samples; i++) {
    const s = pcmData.readInt16LE(i * 2);
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / samples) < 300;
}

// Strip "[HH:MM:SS.mmm --> HH:MM:SS.mmm]" timestamps from whisper-cli stdout.
function parseTranscript(stdout) {
  return (stdout || "")
    .split("\n")
    .map((line) => line.replace(/^\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/, "").trim())
    .filter((line) => line && !line.startsWith("["))
    .join(" ")
    .trim();
}

export function createSession({
  targetLanguage = "vi",
  whisperLanguage = "auto",
  whisperModel = "base",
  localTranslationEngine = "none",
  ollamaBaseUrl = "http://localhost:11434",
  ollamaModel = "llama3.2",
  libreTranslateUrl = "http://localhost:5000",
  languageHints = ["en"],
  context = null,
} = {}) {
  let _onPartial = null;
  let _onUtterance = null;
  let _onError = null;

  let pcmBuffer = Buffer.alloc(0);
  let utteranceAccum = "";
  let emptySegmentCount = 0;
  let inferenceRunning = false;
  let stopped = false;
  let intervalId = null;

  const translateToEnglish = targetLanguage === "en";
  const detectedLang = whisperLanguage === "auto"
    ? (languageHints[0] || "en")
    : whisperLanguage;

  const translationSettings = {
    localTranslationEngine,
    ollamaBaseUrl,
    ollamaModel,
    libreTranslateUrl,
    targetLanguage,
    context,
  };

  async function getTranslation(text) {
    if (translateToEnglish) {
      // Whisper already translated; no external call needed
      return { translated: text, lang: "en" };
    }
    return translateText(text, detectedLang, translationSettings);
  }

  async function emitUtterance(text) {
    const { translated, lang } = await getTranslation(text);
    if (_onUtterance) {
      _onUtterance({
        originalText: text,
        translatedText: translated,
        originalLanguage: detectedLang,
        translationLanguage: lang || null,
        speaker: null,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async function maybeFlushUtterance() {
    if (emptySegmentCount >= SILENCE_THRESHOLD && utteranceAccum) {
      const text = utteranceAccum;
      utteranceAccum = "";
      emptySegmentCount = 0;
      await emitUtterance(text);
    }
  }

  async function runInference(pcmChunk) {
    if (inferenceRunning || stopped) return;
    if (isProbablySilence(pcmChunk)) {
      emptySegmentCount++;
      await maybeFlushUtterance();
      return;
    }

    inferenceRunning = true;
    let wavPath = null;
    try {
      wavPath = writePcmWav(pcmChunk);

      const whisperCppPath = resolveWhisperCppPath();
      const binaryPath = findBinary(whisperCppPath);
      if (!binaryPath) {
        throw new Error("whisper-cli binary not found. Run: npm run whisper:build");
      }

      const stdout = await runWhisperCli(wavPath, whisperCppPath, binaryPath, {
        language: whisperLanguage === "auto" ? undefined : whisperLanguage,
        translateToEnglish,
        initialPrompt: context,
        modelName: whisperModel,
      });

      const text = parseTranscript(stdout);

      if (text) {
        emptySegmentCount = 0;
        const { translated } = await getTranslation(text);
        if (_onPartial) {
          _onPartial({ originalText: text, translatedText: translated, speaker: null });
        }
        utteranceAccum = utteranceAccum ? `${utteranceAccum} ${text}` : text;
      } else {
        emptySegmentCount++;
        await maybeFlushUtterance();
      }
    } catch (err) {
      if (_onError) _onError(err);
    } finally {
      inferenceRunning = false;
    }
  }

  return {
    async connect() {
      // No persistent connection needed for local inference
    },

    async startStreaming() {
      intervalId = setInterval(async () => {
        if (stopped || inferenceRunning) return;
        if (pcmBuffer.length >= SEGMENT_BYTES / 2) {
          const chunk = pcmBuffer;
          pcmBuffer = Buffer.alloc(0);
          await runInference(chunk);
        }
      }, SEGMENT_MS);
    },

    sendAudio(chunk) {
      if (!stopped) {
        pcmBuffer = Buffer.concat([pcmBuffer, chunk]);
      }
    },

    async stop() {
      stopped = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      // Flush remaining buffer
      if (pcmBuffer.length >= MIN_FLUSH_BYTES) {
        const remaining = pcmBuffer;
        pcmBuffer = Buffer.alloc(0);
        await runInference(remaining);
      }
      // Force-emit any accumulated text as final utterance
      if (utteranceAccum) {
        const text = utteranceAccum;
        utteranceAccum = "";
        await emitUtterance(text);
      }
    },

    onPartial(callback) { _onPartial = callback; },
    onUtterance(callback) { _onUtterance = callback; },
    onError(callback) { _onError = callback; },
  };
}
