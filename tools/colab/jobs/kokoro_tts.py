#!/usr/bin/env python3
"""Poshtetgarm Kokoro TTS job for Google Colab.

Batch mode:
  python kokoro_tts.py --input starter-tts-input.json --output out.zip --cache-dir /content/colab_cache --voice af_bella

Temporary dev server mode (OpenAI-compatible /v1/audio/speech over cloudflared):
  python kokoro_tts.py --serve --cache-dir /content/colab_cache --voice af_bella
"""

import argparse
import hashlib
import io
import json
import re
import subprocess
import sys
import threading
import time
import urllib.request
import zipfile
from pathlib import Path

MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"


def ensure_deps(serve: bool) -> None:
    pkgs = ["kokoro-onnx", "soundfile"]
    if serve:
        pkgs.extend(["fastapi", "uvicorn", "pydantic"])
    subprocess.run([sys.executable, "-m", "pip", "-q", "install", *pkgs], check=True)
    if Path("/usr/bin/apt-get").exists():
        subprocess.run(
            ["apt-get", "-qq", "install", "-y", "ffmpeg", "espeak-ng"],
            stdout=subprocess.DEVNULL,
            check=True,
        )


def load_kokoro(cache_dir: Path):
    from kokoro_onnx import Kokoro

    model_dir = cache_dir / "kokoro-v1.0"
    model_dir.mkdir(parents=True, exist_ok=True)
    model_path = model_dir / "kokoro-v1.0.onnx"
    voices_path = model_dir / "voices-v1.0.bin"

    for url, path in [(MODEL_URL, model_path), (VOICES_URL, voices_path)]:
        if not path.exists():
            print(f"Downloading {path.name} to {model_dir}...")
            urllib.request.urlretrieve(url, path)
            print(f"Saved {path.name} ({path.stat().st_size / 1e6:.1f} MB)")

    kokoro = Kokoro(str(model_path), str(voices_path))
    print(f"Kokoro ready ({len(kokoro.get_voices())} voices)")
    return kokoro


def lang_for_voice(voice: str) -> str:
    return "en-gb" if voice.startswith("b") else "en-us"


def run_batch(
    kokoro,
    input_path: Path,
    output_zip: Path,
    voice_override: str | None,
    speed_override: float | None,
    bitrate: str,
) -> None:
    import soundfile as sf

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        items = [{"text": x} if isinstance(x, str) else x for x in payload]
        voice = voice_override or "af_bella"
        speed = speed_override or 0.95
    else:
        items = payload["items"]
        voice = voice_override or payload.get("voice", "af_bella")
        speed = speed_override or float(payload.get("speed", 0.95))

    lang = lang_for_voice(voice)
    out_dir = output_zip.parent / f"kokoro_batch_{voice}"
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}

    t0 = time.time()
    total = len(items)
    for i, item in enumerate(items, 1):
        text = item["text"].strip()
        key = item.get("id") or hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        mp3_path = out_dir / f"{key}.mp3"
        if not mp3_path.exists():
            samples, sr = kokoro.create(text, voice=voice, speed=speed, lang=lang)
            wav_path = out_dir / f"{key}.wav"
            sf.write(wav_path, samples, sr)
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-b:a", bitrate, str(mp3_path)],
                check=True,
            )
            wav_path.unlink()
        manifest[text] = f"{key}.mp3"
        if i % 10 == 0 or i == total:
            print(f"[{i}/{total}] elapsed {time.time() - t0:.1f}s")

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps({"voice": voice, "speed": speed, "bitrate": bitrate, "files": manifest}, indent=2) + "\n",
        encoding="utf-8",
    )

    output_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(manifest_path, "manifest.json")
        for mp3_path in sorted(out_dir.glob("*.mp3")):
            zf.write(mp3_path, mp3_path.name)

    print(f"ZIP ready: {output_zip} ({output_zip.stat().st_size // 1024} KB, {len(manifest)} files)")


def run_serve(kokoro, default_voice: str, speed: float, bitrate: str, token: str) -> None:
    import soundfile as sf
    import uvicorn
    from fastapi import FastAPI, Header, HTTPException, Response
    from pydantic import BaseModel

    valid_voices = set(kokoro.get_voices())
    app = FastAPI()

    class SpeechBody(BaseModel):
        model: str = default_voice
        input: str
        voice: str | None = None
        speed: float = speed

    @app.post("/v1/audio/speech")
    def speech(body: SpeechBody, authorization: str | None = Header(default=None)):
        if authorization != f"Bearer {token}":
            raise HTTPException(status_code=401, detail="Invalid token")
        voice = body.voice or body.model
        if voice not in valid_voices:
            voice = default_voice
        samples, sr = kokoro.create(body.input, voice=voice, speed=body.speed, lang=lang_for_voice(voice))
        wav_buf = io.BytesIO()
        sf.write(wav_buf, samples, sr, format="WAV")
        proc = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-f", "mp3", "-b:a", bitrate, "pipe:1"],
            input=wav_buf.getvalue(),
            capture_output=True,
            check=True,
        )
        return Response(content=proc.stdout, media_type="audio/mpeg")

    threading.Thread(
        target=lambda: uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning"),
        daemon=True,
    ).start()
    time.sleep(1)

    cf_bin = Path("/usr/local/bin/cloudflared")
    if not cf_bin.exists():
        urllib.request.urlretrieve(
            "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
            cf_bin,
        )
        cf_bin.chmod(0o755)

    tunnel = subprocess.Popen(
        [str(cf_bin), "tunnel", "--url", "http://127.0.0.1:8000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    assert tunnel.stdout is not None
    for line in tunnel.stdout:
        m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
        if m:
            base = m.group(0)
            print("\n=== Poshtetgarm Dev TTS Settings ===")
            print("URL:    ", f"{base}/v1")
            print("Model:  ", default_voice)
            print("Model 2:", "am_michael")
            print("API Key:", token)
            print("Press Stop in Colab to shut down.")
            break
    tunnel.wait()


def main() -> None:
    parser = argparse.ArgumentParser(description="Poshtetgarm Kokoro TTS Colab job")
    parser.add_argument("--input", type=Path, help="Input JSON manifest (from export-starter-tts-input.mjs)")
    parser.add_argument("--output", type=Path, default=Path("/content/work/output.zip"), help="Output ZIP path")
    parser.add_argument("--cache-dir", type=Path, default=Path("/content/colab_cache"), help="Model cache dir")
    parser.add_argument("--voice", type=str, default=None, help="Kokoro voice (e.g. af_bella, af_heart, am_michael)")
    parser.add_argument("--speed", type=float, default=None, help="Speech speed (default 0.95)")
    parser.add_argument("--bitrate", type=str, default="64k", help="MP3 bitrate (default 64k)")
    parser.add_argument("--serve", action="store_true", help="Run temporary OpenAI-compatible dev TTS endpoint")
    parser.add_argument("--token", type=str, default="colab-test-key", help="Bearer token for --serve mode")
    args = parser.parse_args()

    ensure_deps(serve=args.serve)
    kokoro = load_kokoro(args.cache_dir)

    if args.serve:
        run_serve(kokoro, args.voice or "af_bella", args.speed or 0.95, args.bitrate, args.token)
    else:
        if not args.input:
            parser.error("--input is required in batch mode (or pass --serve)")
        run_batch(kokoro, args.input, args.output, args.voice, args.speed, args.bitrate)


if __name__ == "__main__":
    main()
