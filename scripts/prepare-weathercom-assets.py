#!/usr/bin/env python3
"""Prepare the public Weather.com reference CSS/fonts from the checked-in ZIP.

Only the CSS, Inter font files and weather-background sprite are extracted.
Weather.com logo assets, scripts, trackers and third-party vendors are never copied.
"""
from pathlib import Path
from zipfile import ZipFile
import sys

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "WEATHER-COM-FRONTEND.zip"
PREFIX = "WEATHER-COM-FRONTEND/weather.com/_next/static/immutable/"
DEST = ROOT / "frontend" / "public" / "_next" / "static" / "immutable"

if not ARCHIVE.is_file():
    raise SystemExit(f"Required UI reference archive is missing: {ARCHIVE}")

allowed_css = {
    "chunks/0j_ujswapoou6.css",
    "chunks/1pgkiin1bsra2.css",
    "chunks/2m3bu3_zwznmt.css",
}
count = 0
with ZipFile(ARCHIVE) as archive:
    names = set(archive.namelist())
    missing = [PREFIX + name for name in allowed_css if PREFIX + name not in names]
    if missing:
        raise SystemExit("Reference archive is incomplete: " + ", ".join(missing))

    for item in archive.infolist():
        if not item.filename.startswith(PREFIX) or item.is_dir():
            continue
        relative = item.filename[len(PREFIX):]
        keep = relative in allowed_css
        if relative.startswith("media/"):
            suffix = Path(relative).suffix.lower()
            keep = suffix == ".woff2" or Path(relative).name.startswith("weather-bg-sprite.")
        if not keep:
            continue
        target = DEST / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(item))
        count += 1

if count < 10:
    raise SystemExit(f"Only {count} reference assets were prepared; expected CSS, fonts and weather sprites.")

print(f"Prepared {count} original reference CSS/font/sprite assets from {ARCHIVE.name}")
