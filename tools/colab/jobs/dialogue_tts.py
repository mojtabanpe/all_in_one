#!/usr/bin/env python3
"""Voice the ready shadowing dialogues with Kokoro (Google Colab, CPU is enough).

Input: the JSON list printed by `node tools/colab/export-dialogue-lines.mjs`, items `{"voice": "primary"|"secondary",
"text": ...}`. Output: a ZIP of MP3s plus `manifest.json` whose `files` map `"<voice>\\n<text>"` to a file name, the
format `SpeechService` reads from `libs/applets/english-learning/api/assets/dialogue-tts`.

  python dialogue_tts.py --input dialogue-lines.json --output dialogue-tts.zip --cache-dir /content/colab_cache
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
# primary = the first speaker of every dialogue (a woman), secondary = the second (a man).
VOICES = {"primary": "af_heart", "secondary": "am_michael"}


def ensure_deps() -> None:
    subprocess.run([sys.executable, "-m", "pip", "-q", "install", "kokoro-onnx", "soundfile"], check=True)
    if Path("/usr/bin/apt-get").exists():
        subprocess.run(["apt-get", "-qq", "install", "-y", "ffmpeg", "espeak-ng"], stdout=subprocess.DEVNULL, check=True)


def download(url: str, path: Path) -> Path:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, path)
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("/content/work/dialogue-tts.zip"))
    parser.add_argument("--cache-dir", type=Path, default=Path("/content/colab_cache"))
    parser.add_argument("--speed", type=float, default=0.9)
    parser.add_argument("--bitrate", default="64k")
    parser.add_argument("--skip-install", action="store_true")
    args = parser.parse_args()
    if not args.skip_install:
        ensure_deps()

    import soundfile as sf
    from kokoro_onnx import Kokoro

    model_dir = args.cache_dir / "kokoro-v1.0"
    kokoro = Kokoro(
        str(download(MODEL_URL, model_dir / "kokoro-v1.0.onnx")),
        str(download(VOICES_URL, model_dir / "voices-v1.0.bin")),
    )
    items = json.loads(args.input.read_text(encoding="utf-8"))
    out = args.output.parent / (args.output.stem + "_files")
    out.mkdir(parents=True, exist_ok=True)
    files: dict[str, str] = {}
    for i, item in enumerate(items, 1):
        voice, text = item["voice"], item["text"].strip()
        key = f"{voice}\n{text}"
        name = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16] + ".mp3"
        mp3 = out / name
        if not mp3.exists():
            samples, sr = kokoro.create(text, voice=VOICES[voice], speed=args.speed, lang="en-us")
            wav = out / "tmp.wav"
            sf.write(wav, samples, sr)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-b:a", args.bitrate, str(mp3)], check=True)
            wav.unlink()
        files[key] = name
        if i % 20 == 0 or i == len(items):
            print(f"[{i}/{len(items)}]")
    manifest = {"voices": VOICES, "speed": args.speed, "files": files}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(out.iterdir()):
            zf.write(p, p.name)
    print(f"ZIP ready: {args.output} ({len(files)} clips)")


if __name__ == "__main__":
    main()
