#!/usr/bin/env python3
"""Template for Poshtetgarm Google Colab batch jobs.

Standard CLI contract:
  python jobs/<name>.py --input <path> --output <zip_or_file> --cache-dir <dir>
"""

import argparse
import json
import subprocess
import sys
import zipfile
from pathlib import Path


def ensure_packages(packages: list[str]) -> None:
    """Install Python packages on Colab runtime if missing."""
    subprocess.run(
        [sys.executable, "-m", "pip", "-q", "install", *packages],
        check=True,
    )


def ensure_apt(packages: list[str]) -> None:
    """Install system packages on Debian/Ubuntu (Colab) if available."""
    if Path("/usr/bin/apt-get").exists():
        subprocess.run(
            ["apt-get", "-qq", "install", "-y", *packages],
            stdout=subprocess.DEVNULL,
            check=True,
        )


def zip_directory(src_dir: Path, zip_path: Path) -> None:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in sorted(src_dir.rglob("*")):
            if file_path.is_file():
                zf.write(file_path, file_path.relative_to(src_dir))


def main() -> None:
    parser = argparse.ArgumentParser(description="Poshtetgarm Colab job template")
    parser.add_argument("--input", type=Path, required=True, help="Input file or JSON manifest")
    parser.add_argument("--output", type=Path, required=True, help="Output ZIP or file path")
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path("/content/colab_cache"),
        help="Persistent cache directory (e.g. on Google Drive)",
    )
    args = parser.parse_args()

    args.cache_dir.mkdir(parents=True, exist_ok=True)
    work_out = Path("/content/work/job_out")
    work_out.mkdir(parents=True, exist_ok=True)

    # Example: read JSON input and write a summary artifact
    data = json.loads(args.input.read_text(encoding="utf-8"))
    (work_out / "result.json").write_text(
        json.dumps({"ok": True, "inputKeys": list(data.keys())}, indent=2),
        encoding="utf-8",
    )

    zip_directory(work_out, args.output)
    print(f"Done -> {args.output} ({args.output.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
