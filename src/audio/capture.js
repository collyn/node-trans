import { spawn } from "child_process";
import { Transform } from "stream";
import { createLogger } from "../logger.js";

const log = createLogger("capture");

const CHUNK_SIZE = 3840; // 120ms at 16kHz mono 16-bit
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

class ChunkTransform extends Transform {
  constructor() {
    super();
    this.pending = Buffer.alloc(0);
  }

  _transform(data, encoding, callback) {
    this.pending = Buffer.concat([this.pending, data]);
    while (this.pending.length >= CHUNK_SIZE) {
      this.push(this.pending.subarray(0, CHUNK_SIZE));
      this.pending = this.pending.subarray(CHUNK_SIZE);
    }
    callback();
  }

  _flush(callback) {
    if (this.pending.length > 0) {
      this.push(this.pending);
    }
    callback();
  }
}

/**
 * @param {number|string} device - Device index (macOS) or device name (Windows)
 */
export function startCapture(device) {
  const args = IS_WIN
    ? ["-f", "dshow", "-i", `audio=${device}`]
    : ["-f", "avfoundation", "-i", `:${device}`];

  args.push(
    "-acodec", "pcm_s16le",
    "-ar", "16000",
    "-ac", "1",
    "-f", "s16le",
    "pipe:1",
  );

  const ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";
  log.info("Starting capture", { device, args: [ffmpegBin, ...args].join(" ") });

  const ffmpeg = spawn(ffmpegBin, args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let paused = false;
  let stopped = false;
  let killTimer = null;

  // Gate: when paused, drop audio data (ffmpeg keeps running but Soniox gets nothing)
  const gate = new Transform({
    transform(chunk, enc, cb) {
      if (!paused) this.push(chunk);
      cb();
    },
  });

  const chunker = new ChunkTransform();
  ffmpeg.stdout.pipe(gate).pipe(chunker);

  // Accumulate stderr for error diagnosis (capped to avoid unbounded growth)
  let stderrBuf = "";
  ffmpeg.stderr.on("data", (d) => {
    stderrBuf += d.toString("utf8");
    if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192);
  });

  return {
    stream: chunker,
    process: ffmpeg,

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
    },

    stop() {
      if (stopped) return;
      stopped = true;
      log.info("Stopping capture", { device });
      if (IS_WIN) {
        // On Windows, write 'q' to stdin for graceful exit, then force kill as fallback
        try { ffmpeg.stdin.write("q"); } catch {}
        killTimer = setTimeout(() => {
          try { ffmpeg.kill(); } catch {}
        }, 500);
      } else {
        ffmpeg.kill("SIGTERM");
      }
    },

    onError(callback) {
      ffmpeg.on("error", (err) => {
        log.error("ffmpeg process error", err);
        callback(err);
      });
      ffmpeg.on("exit", (code) => {
        if (killTimer) { clearTimeout(killTimer); killTimer = null; }
        if (code && code !== 0 && code !== 255 && !stopped) {
          log.error("ffmpeg exited with error", { code, device, stderr: stderrBuf.trim() });
          callback(new Error(`ffmpeg exited with code ${code}`));
        }
      });
    },
  };
}

/**
 * Capture system audio via native API (ScreenCaptureKit on macOS, WASAPI on Windows).
 * Returns the same interface as startCapture() — drop-in replacement for system audio.
 */
export function startSystemCapture() {
  const audiocapBin = process.env.AUDIOCAP_PATH || (IS_WIN ? "audiocap.exe" : "audiocap");
  const args = ["--sample-rate", "16000", "--channels", "1"];

  log.info("Starting system capture", { bin: audiocapBin });

  const proc = spawn(audiocapBin, args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let paused = false;
  let stopped = false;
  let killTimer = null;

  const gate = new Transform({
    transform(chunk, enc, cb) {
      if (!paused) this.push(chunk);
      cb();
    },
  });

  const chunker = new ChunkTransform();
  proc.stdout.pipe(gate).pipe(chunker);

  let stderrBuf = "";
  proc.stderr.on("data", (d) => {
    stderrBuf += d.toString("utf8");
    if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192);
  });

  return {
    stream: chunker,
    process: proc,

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
    },

    stop() {
      if (stopped) return;
      stopped = true;
      log.info("Stopping system capture");
      if (IS_WIN) {
        try { proc.stdin.write("q"); } catch {}
        killTimer = setTimeout(() => {
          try { proc.kill(); } catch {}
        }, 500);
      } else {
        proc.kill("SIGTERM");
      }
    },

    onError(callback) {
      proc.on("error", (err) => {
        log.error("audiocap process error", err);
        callback(err);
      });
      proc.on("exit", (code) => {
        if (killTimer) { clearTimeout(killTimer); killTimer = null; }
        if (code === 2 && !stopped && IS_MAC) {
          log.error("audiocap: Screen Recording permission denied");
          callback(new Error("SCREEN_RECORDING_PERMISSION_DENIED"));
        } else if (code && code !== 0 && !stopped) {
          log.error("audiocap exited with error", { code, stderr: stderrBuf.trim() });
          callback(new Error(`audiocap exited with code ${code}`));
        }
      });
    },
  };
}
