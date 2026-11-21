#!/usr/bin/env python3
"""Poshtetgarm two-speaker dialogue video job for Google Colab.

Turns a dialogue JSON (see tools/colab/inputs/a1-football-dialogue.json) into an MP4 with one Kokoro voice per
speaker, the current sentence on screen (with an optional Persian translation), the active speaker highlighted,
and an SRT subtitle file. Runs on CPU; a GPU is not needed.

  python dialogue_video.py --input a1-football-dialogue.json --output football.zip --cache-dir /content/colab_cache

Options: --format 16:9|9:16, --no-fa (hide the Persian line), --no-tts (silent timing preview, no model download),
--logo path/to/logo.png.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
FONT_URL = "https://github.com/rastikerdar/vazirmatn/raw/master/fonts/ttf/Vazirmatn-{}.ttf"

SAMPLE_RATE = 24000
GAP_S = 0.7  # silence after each line
TITLE_S = 3.0
END_S = 3.5

TEAL = "#18514b"
SUN = "#e88329"
PORCELAIN = "#f4f1ec"
INK = "#1d2b2a"
MUTED = "#5c6b69"


def ensure_deps(tts: bool) -> None:
    pkgs = ["pillow", "numpy", "soundfile", "arabic-reshaper", "python-bidi"]
    if tts:
        pkgs.append("kokoro-onnx")
    subprocess.run([sys.executable, "-m", "pip", "-q", "install", *pkgs], check=True)
    if Path("/usr/bin/apt-get").exists():
        apt = ["ffmpeg"] + (["espeak-ng"] if tts else [])
        subprocess.run(["apt-get", "-qq", "install", "-y", *apt], stdout=subprocess.DEVNULL, check=True)


def download(url: str, path: Path) -> Path:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {path.name}...")
        urllib.request.urlretrieve(url, path)
    return path


# ---------- audio ----------


def synthesize(lines: list[dict], speakers: dict, speed: float, cache_dir: Path, tts: bool):
    """Return one float32 numpy array per line."""
    import numpy as np

    if not tts:
        # Timing preview: ~0.42 s per word.
        return [np.zeros(int(SAMPLE_RATE * (0.6 + 0.42 * len(l["text"].split()))), dtype=np.float32) for l in lines]

    from kokoro_onnx import Kokoro

    model_dir = cache_dir / "kokoro-v1.0"
    kokoro = Kokoro(
        str(download(MODEL_URL, model_dir / "kokoro-v1.0.onnx")),
        str(download(VOICES_URL, model_dir / "voices-v1.0.bin")),
    )
    out = []
    for i, line in enumerate(lines, 1):
        voice = speakers[line["speaker"]]["voice"]
        lang = "en-gb" if voice.startswith("b") else "en-us"
        samples, sr = kokoro.create(line["text"], voice=voice, speed=float(line.get("speed", speed)), lang=lang)
        if sr != SAMPLE_RATE:
            raise RuntimeError(f"Unexpected sample rate {sr}")
        out.append(np.asarray(samples, dtype=np.float32))
        print(f"[tts {i}/{len(lines)}] {line['speaker']}: {line['text']}")
    return out


# ---------- drawing ----------


class Painter:
    def __init__(self, width: int, height: int, font_dir: Path, logo: Path | None):
        from PIL import Image, ImageFont, features

        self.W, self.H = width, height
        self.s = min(width, height) / 1080  # scale unit
        self.raqm = features.check("raqm")
        self.fonts = {w: str(download(FONT_URL.format(w), font_dir / f"Vazirmatn-{w}.ttf")) for w in ("Regular", "Bold")}
        self.ImageFont = ImageFont
        self.logo = Image.open(logo).convert("RGBA") if logo and logo.exists() else None

    def font(self, weight: str, size: float):
        return self.ImageFont.truetype(self.fonts[weight], int(size * self.s))

    def fa(self, text: str) -> str:
        """Shape Persian for Pillow builds without raqm."""
        if self.raqm:
            return text
        import arabic_reshaper
        from bidi.algorithm import get_display

        return get_display(arabic_reshaper.reshape(text))

    def fa_kwargs(self) -> dict:
        return {"direction": "rtl", "language": "fa"} if self.raqm else {}

    @staticmethod
    def wrap(draw, text: str, font, max_w: int) -> list[str]:
        words, rows, cur = text.split(), [], ""
        for w in words:
            trial = f"{cur} {w}".strip()
            if draw.textlength(trial, font=font) <= max_w or not cur:
                cur = trial
            else:
                rows.append(cur)
                cur = w
        if cur:
            rows.append(cur)
        return rows

    def base(self):
        from PIL import Image, ImageDraw

        img = Image.new("RGB", (self.W, self.H), PORCELAIN)
        d = ImageDraw.Draw(img)
        # soft top band in brand teal
        d.rectangle([0, 0, self.W, int(150 * self.s)], fill=TEAL)
        return img, d

    def brand(self, img, d, size: float = 34):
        s = self.s
        f = self.font("Bold", size)
        label = "Poshtetgarm"
        tw = d.textlength(label, font=f)
        x = self.W - int(48 * s) - tw
        y = self.H - int(70 * s)
        if self.logo:
            lh = int(size * 1.6 * s)
            logo = self.logo.resize((lh, lh))
            img.paste(logo, (int(x - lh - 12 * s), int(y - lh * 0.25)), logo)
        d.text((x, y), label, font=f, fill=TEAL)

    def header(self, d, title: str, level: str, progress: float | None):
        s = self.s
        d.text((int(48 * s), int(42 * s)), title, font=self.font("Bold", 52), fill="white")
        badge_f = self.font("Bold", 34)
        bw = d.textlength(level, font=badge_f) + 40 * s
        bx = self.W - int(48 * s) - bw
        d.rounded_rectangle([bx, 44 * s, bx + bw, 104 * s], radius=int(30 * s), fill=SUN)
        d.text((bx + 20 * s, 49 * s), level, font=badge_f, fill="white")
        if progress is not None:
            y = int(150 * s)
            d.rectangle([0, y - int(8 * s), int(self.W * progress), y], fill=SUN)

    def speaker_chip(self, d, cx: int, cy: int, name: str, color: str, active: bool):
        s = self.s
        r = int((78 if active else 62) * s)
        if active:
            d.ellipse([cx - r - 10 * s, cy - r - 10 * s, cx + r + 10 * s, cy + r + 10 * s], fill=SUN)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color if active else "#c9d1cf")
        f = self.font("Bold", 64 if active else 50)
        initial = name[0].upper()
        d.text((cx, cy), initial, font=f, fill="white", anchor="mm")
        nf = self.font("Bold" if active else "Regular", 36)
        d.text((cx, cy + r + 40 * s), name, font=nf, fill=INK if active else MUTED, anchor="mm")

    def line_frame(self, meta: dict, line: dict, idx: int, total: int, show_fa: bool):
        s = self.s
        img, d = self.base()
        self.header(d, meta["title"], meta["level"], (idx + 1) / total)
        names = list(meta["speakers"].keys())
        portrait = self.H > self.W
        chip_y = int((330 if portrait else 300) * s)
        for i, name in enumerate(names[:2]):
            cx = int(self.W * (0.28 if i == 0 else 0.72))
            self.speaker_chip(d, cx, chip_y, name, meta["speakers"][name]["color"], name == line["speaker"])

        # sentence card
        margin = int(64 * s)
        top = int((560 if portrait else 500) * s)
        bottom = self.H - int((200 if portrait else 120) * s)
        d.rounded_rectangle([margin, top, self.W - margin, bottom], radius=int(28 * s), fill="white", outline="#e3ddd4", width=max(2, int(2 * s)))
        inner = self.W - 2 * margin - int(80 * s)
        en_f = self.font("Bold", 64 if portrait else 70)
        rows = self.wrap(d, line["text"], en_f, inner)
        fa_f = self.font("Regular", 44 if portrait else 46)
        fa_rows = self.wrap(d, line["fa"], fa_f, inner) if show_fa and line.get("fa") else []
        en_lh, fa_lh = int(en_f.size * 1.3), int(fa_f.size * 1.55)
        block = len(rows) * en_lh + (int(36 * s) + len(fa_rows) * fa_lh if fa_rows else 0)
        y = (top + bottom) // 2 - block // 2
        for r in rows:
            d.text((self.W // 2, y + en_lh // 2), r, font=en_f, fill=INK, anchor="mm")
            y += en_lh
        if fa_rows:
            y += int(36 * s)
            for r in fa_rows:
                d.text((self.W // 2, y + fa_lh // 2), self.fa(r), font=fa_f, fill=MUTED, anchor="mm", **self.fa_kwargs())
                y += fa_lh
        self.brand(img, d, 30)
        return img

    def title_frame(self, meta: dict):
        img, d = self.base()
        self.header(d, "English Conversation", meta["level"], None)
        names = list(meta["speakers"].keys())
        d.text((self.W // 2, int(self.H * 0.42)), meta["title"], font=self.font("Bold", 96), fill=INK, anchor="mm")
        d.text((self.W // 2, int(self.H * 0.42 + 120 * self.s)), " & ".join(names), font=self.font("Regular", 48), fill=MUTED, anchor="mm")
        self.brand(img, d, 40)
        return img

    def end_frame(self, meta: dict):
        from PIL import ImageDraw

        img, _ = self.base()
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, self.W, self.H], fill=TEAL)
        cy = int(self.H * 0.42)
        if self.logo:
            lh = int(260 * self.s)
            logo = self.logo.resize((lh, lh))
            img.paste(logo, (self.W // 2 - lh // 2, cy - lh), logo)
        d.text((self.W // 2, cy + int(80 * self.s)), "Poshtetgarm", font=self.font("Bold", 84), fill="white", anchor="mm")
        d.text((self.W // 2, cy + int(180 * self.s)), "poshtetgarm.ir", font=self.font("Regular", 46), fill="#f7d9bd", anchor="mm")
        return img


# ---------- assembly ----------


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    sec, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{sec:02},{ms:03}"


def build(args) -> None:
    import numpy as np
    import soundfile as sf

    meta = json.loads(args.input.read_text(encoding="utf-8"))
    lines = meta["lines"]
    unknown = {l["speaker"] for l in lines} - set(meta["speakers"])
    if unknown:
        raise SystemExit(f"Unknown speakers in lines: {sorted(unknown)}")

    width, height = (1920, 1080) if args.format == "16:9" else (1080, 1920)
    work = args.output.parent / (args.output.stem + "_work")
    frames_dir = work / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    clips = synthesize(lines, meta["speakers"], float(meta.get("speed", 0.9)), args.cache_dir, not args.no_tts)
    painter = Painter(width, height, args.cache_dir / "fonts", args.logo)

    segments: list[tuple[Path, float]] = []
    audio: list = []
    srt: list[str] = []

    def silence(sec: float):
        return np.zeros(int(SAMPLE_RATE * sec), dtype=np.float32)

    t = 0.0
    p = frames_dir / "000_title.png"
    painter.title_frame(meta).save(p)
    segments.append((p, TITLE_S))
    audio.append(silence(TITLE_S))
    t += TITLE_S

    for i, (line, clip) in enumerate(zip(lines, clips)):
        dur = len(clip) / SAMPLE_RATE
        p = frames_dir / f"{i + 1:03}.png"
        painter.line_frame(meta, line, i, len(lines), not args.no_fa).save(p)
        segments.append((p, dur + GAP_S))
        audio.extend([clip, silence(GAP_S)])
        text = f"{line['speaker']}: {line['text']}"
        if not args.no_fa and line.get("fa"):
            text += "\n" + line["fa"]
        srt.append(f"{i + 1}\n{srt_time(t)} --> {srt_time(t + dur)}\n{text}\n")
        t += dur + GAP_S

    p = frames_dir / "999_end.png"
    painter.end_frame(meta).save(p)
    segments.append((p, END_S))
    audio.append(silence(END_S))
    t += END_S

    wav = work / "audio.wav"
    sf.write(wav, np.concatenate(audio), SAMPLE_RATE)

    concat = work / "frames.txt"
    rows = []
    for path, dur in segments:
        rows += [f"file '{path.resolve()}'", f"duration {dur:.3f}"]
    rows.append(f"file '{segments[-1][0].resolve()}'")  # concat demuxer needs the last file twice
    concat.write_text("\n".join(rows) + "\n", encoding="utf-8")

    stem = args.output.stem
    mp4 = work / f"{stem}.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(concat),
            "-i", str(wav),
            "-vf", "fps=30,format=yuv420p",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-tune", "stillimage",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest", "-movflags", "+faststart",
            str(mp4),
        ],
        check=True,
    )
    srt_path = work / f"{stem}.srt"
    srt_path.write_text("\n".join(srt), encoding="utf-8")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(mp4, mp4.name)
        zf.write(srt_path, srt_path.name)
    print(f"Video: {mp4} ({t:.1f}s, {mp4.stat().st_size // 1024} KB)")
    print(f"ZIP ready: {args.output}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Poshtetgarm dialogue video Colab job")
    parser.add_argument("--input", type=Path, required=True, help="Dialogue JSON")
    parser.add_argument("--output", type=Path, default=Path("/content/work/dialogue.zip"), help="Output ZIP (MP4 + SRT)")
    parser.add_argument("--cache-dir", type=Path, default=Path("/content/colab_cache"), help="Model and font cache")
    parser.add_argument("--format", choices=["16:9", "9:16"], default="16:9")
    parser.add_argument("--no-fa", action="store_true", help="Hide the Persian translation")
    parser.add_argument("--no-tts", action="store_true", help="Silent timing preview without the TTS model")
    parser.add_argument("--logo", type=Path, default=None, help="Optional square PNG logo")
    parser.add_argument("--skip-install", action="store_true", help="Do not pip/apt install (local runs)")
    args = parser.parse_args()

    if not args.skip_install:
        ensure_deps(tts=not args.no_tts)
    build(args)


if __name__ == "__main__":
    main()
