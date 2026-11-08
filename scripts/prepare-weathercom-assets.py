#!/usr/bin/env python3
"""Extract the original public Weather.com layout assets from the user's full capture ZIP.

Only the three page CSS bundles, Inter font files and weather-background sprites are
extracted. Proprietary application JavaScript, tracking code, vendor scripts and
Weather.com logos are not copied. EARTH WEATHER React components and APIs provide
the app behaviour and brand.
"""
from pathlib import Path
from zipfile import BadZipFile, ZipFile

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

        selected = { "chunks/" + filename: path for filename, path in css_paths.items() }

        # CSS uses ../media/<font> URLs, so place every captured WOFF2 file at
        # the common immutable media path regardless of the capture's source folder.
        for name in names:
            basename = Path(name).name
            if name.lower().endswith(".woff2") or basename.startswith(SPRITE_PREFIX):
                selected["media/" + basename] = name

        extracted = 0
        for relative, source_name in selected.items():
            target = DEST / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(source_name))
            extracted += 1

        if extracted < 12:
            raise SystemExit(
                f"Only {extracted} CSS/font/sprite assets were extracted; expected at least 12."
            )
except BadZipFile as exc:
    raise SystemExit(f"The full UI reference is not a valid ZIP: {exc}") from exc

print(
    f"Extracted {extracted} original page CSS/font/sprite assets "
    f"from {ARCHIVE.name}; brand logos and application JS are intentionally excluded."
)
