#!/usr/bin/env python3
"""
Speaker diarization worker for node-trans.
Communicates with Node.js via stdin/stdout newline-delimited JSON.

Audio input: PCM s16le 16kHz mono, sent as base64-encoded chunks.

Protocol IN:
  {"type": "audio", "data": "<base64>"}
  {"type": "flush"}
  {"type": "shutdown"}

Protocol OUT:
  {"type": "ready"}
  {"type": "utterance", "text": "...", "speaker": "SPEAKER_00", "start": 0.5, "end": 3.2}
  {"type": "error", "message": "..."}
"""

import sys
import os
import json
import base64
import wave
import tempfile
import threading
import time

# Suppress noisy logs from transformers/pyannote before importing them
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")

import numpy as np
import torch
import torchaudio

# Compatibility shims: torchaudio >= 2.0 removed the audio backend selection API
# and the torchaudio.backend submodule. pyannote.audio 3.1.x calls these at import time.
import sys, types, dataclasses

if not hasattr(torchaudio, "set_audio_backend"):
    torchaudio.set_audio_backend = lambda *a, **kw: None
if not hasattr(torchaudio, "get_audio_backend"):
    torchaudio.get_audio_backend = lambda: "soundfile"
if not hasattr(torchaudio, "list_audio_backends"):
    torchaudio.list_audio_backends = lambda: ["soundfile"]

# Shim torchaudio.backend.common.AudioMetaData (removed in torchaudio 2.0)
if "torchaudio.backend" not in sys.modules:
    @dataclasses.dataclass
    class _AudioMetaData:
        sample_rate: int
        num_frames: int
        num_channels: int
        bits_per_sample: int
        encoding: str
    _common_mod = types.ModuleType("torchaudio.backend.common")
    _common_mod.AudioMetaData = getattr(torchaudio, "AudioMetaData", _AudioMetaData)
    _backend_mod = types.ModuleType("torchaudio.backend")
    _backend_mod.common = _common_mod
    sys.modules["torchaudio.backend"] = _backend_mod
    sys.modules["torchaudio.backend.common"] = _common_mod
    torchaudio.backend = _backend_mod

# Compatibility shim: np.NaN and np.NAN were removed in NumPy 2.0,
# but pyannote.audio 3.1.x references them at import and runtime.
if not hasattr(np, "NaN"):
    np.NaN = np.nan
if not hasattr(np, "NAN"):
    np.NAN = np.nan

# Compatibility shim: huggingface_hub >= 0.23 removed use_auth_token parameter,
# but pyannote.audio 3.1.x passes it internally to hf_hub_download.
import huggingface_hub as _hf
_orig_hf_hub_download = _hf.hf_hub_download
def _compat_hf_hub_download(*args, use_auth_token=None, **kwargs):
    if use_auth_token is not None and "token" not in kwargs:
        kwargs["token"] = use_auth_token
    return _orig_hf_hub_download(*args, **kwargs)
_hf.hf_hub_download = _compat_hf_hub_download
# Also patch the reference inside file_download submodule (pyannote imports from there)
import huggingface_hub.file_download as _hf_fd
_hf_fd.hf_hub_download = _compat_hf_hub_download

import whisper
from pyannote.audio import Pipeline

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2
WINDOW_SECS = 10.0
STRIDE_SECS = 5.0
MIN_FLUSH_SECS = 3.0
SILENCE_RMS_THRESHOLD = 300
SILENCE_TRIGGER_SECS = 1.5


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def detect_device():
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def pcm_rms(pcm_bytes):
    if len(pcm_bytes) < 2:
        return 0.0
    samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
    return float(np.sqrt(np.mean(samples ** 2)))


def write_wav(pcm_bytes, path):
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_bytes)


def dominant_speaker(diarization, rel_start, rel_end):
    """Return the speaker with most time in [rel_start, rel_end]."""
    speaker_time = {}
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        overlap = min(turn.end, rel_end) - max(turn.start, rel_start)
        if overlap > 0:
            speaker_time[speaker] = speaker_time.get(speaker, 0) + overlap
    return max(speaker_time, key=speaker_time.get) if speaker_time else None


class DiarizeWorker:
    def __init__(self, hf_token, whisper_model_name, device):
        self.hf_token = hf_token
        self.whisper_model_name = whisper_model_name
        self.device = device

        self.pcm_buf = bytearray()
        # Absolute time of the first sample currently in pcm_buf
        self.window_start_secs = 0.0
        # Absolute time of last committed segment end (dedup)
        self.last_committed_end = 0.0
        self.silence_bytes = 0
        self.processing = False
        self.lock = threading.Lock()

    def load_models(self):
        try:
            print("[diarize.py] Loading Whisper model...", file=sys.stderr, flush=True)
            # openai-whisper on CPU — MPS has known bugs with short audio segments
            self.whisper_model = whisper.load_model(self.whisper_model_name, device="cpu")

            print(f"[diarize.py] Loading pyannote pipeline (device={self.device})...",
                  file=sys.stderr, flush=True)
            # PyTorch 2.6 changed torch.load default to weights_only=True.
            # Pyannote checkpoints embed custom classes; patch torch.load to default
            # weights_only=False so lightning_fabric's pl_load works without changes.
            _orig_torch_load = torch.load
            def _patched_torch_load(*args, **kwargs):
                # lightning_fabric >= 2.4 explicitly passes weights_only=True;
                # pyannote checkpoints require weights_only=False to unpickle custom classes.
                kwargs["weights_only"] = False
                return _orig_torch_load(*args, **kwargs)
            torch.load = _patched_torch_load
            self.pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=self.hf_token,
            )
            if self.pipeline is None:
                raise RuntimeError(
                    "Pipeline.from_pretrained returned None — check your HF token "
                    "and that you have accepted the pyannote/speaker-diarization-3.1 "
                    "model terms at https://huggingface.co/pyannote/speaker-diarization-3.1"
                )
            if self.device != "cpu":
                try:
                    self.pipeline.to(torch.device(self.device))
                except Exception as e:
                    print(f"[diarize.py] Warning: could not move pipeline to {self.device}: {e}",
                          file=sys.stderr, flush=True)

            emit({"type": "ready"})
        except Exception as e:
            emit({"type": "error", "message": f"Failed to load diarization models: {e}"})
            sys.exit(1)

    def add_audio(self, pcm_bytes):
        with self.lock:
            self.pcm_buf.extend(pcm_bytes)

            chunk_rms = pcm_rms(pcm_bytes)
            if chunk_rms < SILENCE_RMS_THRESHOLD:
                self.silence_bytes += len(pcm_bytes)
            else:
                self.silence_bytes = 0

            win_bytes = int(SAMPLE_RATE * BYTES_PER_SAMPLE * WINDOW_SECS)
            stride_bytes = int(SAMPLE_RATE * BYTES_PER_SAMPLE * STRIDE_SECS)
            min_bytes = int(SAMPLE_RATE * BYTES_PER_SAMPLE * MIN_FLUSH_SECS)
            silence_trigger = int(SAMPLE_RATE * BYTES_PER_SAMPLE * SILENCE_TRIGGER_SECS)

            force_flush = (self.silence_bytes >= silence_trigger
                           and len(self.pcm_buf) >= min_bytes)
            full_window = len(self.pcm_buf) >= win_bytes

            if (full_window or force_flush) and not self.processing:
                self.processing = True
                chunk = bytes(self.pcm_buf)
                win_start = self.window_start_secs

                if not force_flush:
                    # Keep overlap for next window
                    self.pcm_buf = bytearray(self.pcm_buf[stride_bytes:])
                    self.window_start_secs += STRIDE_SECS
                else:
                    self.pcm_buf = bytearray()
                self.silence_bytes = 0

                threading.Thread(
                    target=self._process_window,
                    args=(chunk, win_start),
                    daemon=True,
                ).start()

    def flush(self):
        with self.lock:
            min_bytes = int(SAMPLE_RATE * BYTES_PER_SAMPLE * MIN_FLUSH_SECS)
            if len(self.pcm_buf) < min_bytes:
                self.pcm_buf = bytearray()
                return
            if self.processing:
                # Processing in progress — remaining bytes will be picked up later
                return
            self.processing = True
            chunk = bytes(self.pcm_buf)
            win_start = self.window_start_secs
            self.pcm_buf = bytearray()
            threading.Thread(
                target=self._process_window,
                args=(chunk, win_start),
                daemon=True,
            ).start()

    def _process_window(self, pcm_bytes, win_start_secs):
        path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                path = f.name
            write_wav(pcm_bytes, path)

            # Transcribe with Whisper (returns segment-level timestamps)
            result = self.whisper_model.transcribe(path, verbose=False)
            segments = result.get("segments", [])
            if not segments:
                return

            # Diarize using waveform tensor (avoids extra temp file)
            pcm_f32 = (np.frombuffer(pcm_bytes, dtype=np.int16)
                       .astype(np.float32) / 32768.0)
            waveform = torch.from_numpy(pcm_f32).unsqueeze(0)  # [1, N]
            diarization = self.pipeline({
                "waveform": waveform,
                "sample_rate": SAMPLE_RATE,
            })

            for seg in segments:
                rel_start = float(seg["start"])
                rel_end = float(seg["end"])
                abs_start = win_start_secs + rel_start
                abs_end = win_start_secs + rel_end
                text = seg["text"].strip()

                if not text:
                    continue

                # Dedup: skip if this segment was already committed
                # (0.5s tolerance for Whisper boundary jitter across overlapping windows)
                if abs_start < self.last_committed_end - 0.5:
                    continue

                speaker = dominant_speaker(diarization, rel_start, rel_end)

                emit({
                    "type": "utterance",
                    "text": text,
                    "speaker": speaker,
                    "start": abs_start,
                    "end": abs_end,
                })
                self.last_committed_end = max(self.last_committed_end, abs_end)

        except Exception as e:
            emit({"type": "error", "message": str(e)})
        finally:
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass
            with self.lock:
                self.processing = False


def main():
    args = sys.argv[1:]
    hf_token = None
    whisper_model = "base"
    device = detect_device()

    i = 0
    while i < len(args):
        if args[i] == "--hf-token" and i + 1 < len(args):
            hf_token = args[i + 1]
            i += 2
        elif args[i] == "--whisper-model" and i + 1 < len(args):
            whisper_model = args[i + 1]
            i += 2
        elif args[i] == "--device" and i + 1 < len(args):
            device = args[i + 1]
            i += 2
        else:
            i += 1

    if not hf_token:
        emit({"type": "error", "message": "Missing --hf-token argument"})
        sys.exit(1)

    print(f"[diarize.py] whisper_model={whisper_model} device={device}",
          file=sys.stderr, flush=True)

    worker = DiarizeWorker(hf_token, whisper_model, device)
    worker.load_models()

    # Main loop: read JSON-line commands from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            emit({"type": "error", "message": f"JSON decode error: {e}"})
            continue

        msg_type = msg.get("type")
        if msg_type == "audio":
            worker.add_audio(base64.b64decode(msg["data"]))
        elif msg_type == "flush":
            worker.flush()
        elif msg_type == "shutdown":
            worker.flush()
            time.sleep(3)  # Allow final processing thread to finish
            break

    print("[diarize.py] Shutdown complete.", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
