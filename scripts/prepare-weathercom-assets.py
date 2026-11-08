#!/usr/bin/env python3
"""Extract the original public Weather.com layout assets from the user's full capture ZIP.

Only the three page CSS bundles and weather-background sprites are extracted.
The CSS's original Inter WOFF2 URLs are redirected to the public immutable CDN;
font binaries, proprietary application JS, trackers, vendor scripts and Weather.com
logos are not copied into EARTH WEATHER.
"""
from pathlib import Path
from zipfile import BadZipFile, ZipFile
import re

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "weathercom-reference.zip"
DEST = ROOT / "frontend" / "public" / "_next" / "static" / "immutable"
CSS_FILES = (
    "0j_ujswapoou6.css",
    "1pgkiin1bsra2.css",
    "2m3bu3_zwznmt.css",
)
SPRITE_PREFIX = "weather-bg-sprite."

if not ARCHIVE.is_file():
    raise SystemExit(f"Required full UI capture is missing: {ARCHIVE}")

try:
    with ZipFile(ARCHIVE) as archive:
        broken = archive.testzip()
        if broken:
            raise SystemExit(f"Reference ZIP integrity check failed at: {broken}")
        names = [name for name in archive.namelist() if not name.endswith("/")]

        css_paths = {}
        for filename in CSS_FILES:
            matches = [
                name for name in names
                if name.endswith("/_next/static/immutable/chunks/" + filename)
            ]
            if not matches:
                raise SystemExit(f"Full UI ZIP is missing the original CSS bundle: {filename}")
            css_paths[filename] = matches[0]

        prefixes = {
            path[:-len("chunks/" + filename)]
            for filename, path in css_paths.items()
        }
        if len(prefixes) != 1:
            raise SystemExit("The three original CSS bundles do not share one immutable asset root.")
        prefix = prefixes.pop()

        selected = {"chunks/" + filename: path for filename, path in css_paths.items()}
        for name in names:
            basename = Path(name).name
            if name.lower().endswith(".woff2") or basename.startswith(SPRITE_PREFIX):
                selected["media/" + basename] = name

        extracted = 0
        font_files = set()
        font_url_pattern = re.compile(
            r"url\(\s*['\"]?\.\./media/([^'\"\s)]+\.woff2)['\"]?\s*\)",
            re.IGNORECASE,
        )

        for relative, source_name in selected.items():
            target = DEST / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            payload = archive.read(source_name)

            if relative.startswith("chunks/") and relative.lower().endswith(".css"):
                css_text = payload.decode("utf-8")

                def use_public_font(match):
                    filename = match.group(1)
                    font_files.add(filename)
                    return (
                        'url("https://weather.com/_next/static/immutable/media/'
                        + filename
                        + '")'
                    )

                css_text = font_url_pattern.sub(use_public_font, css_text)
                payload = css_text.encode("utf-8")

            target.write_bytes(payload)
            extracted += 1

        if extracted < 5:
            raise SystemExit(
                f"Only {extracted} original CSS/sprite assets were extracted; expected at least five."
            )
        if not font_files:
            raise SystemExit("No original Inter WOFF2 references were found in the captured CSS.")
except BadZipFile as exc:
    raise SystemExit(f"The full UI reference is not a valid ZIP: {exc}") from exc

print(
    f"Extracted {extracted} original page CSS/sprite assets from {ARCHIVE.name}; "
    f"rewrote {len(font_files)} Inter WOFF2 references to the public Weather.com asset CDN. "
    "Brand logos, font binaries and application JavaScript are intentionally excluded."
)
