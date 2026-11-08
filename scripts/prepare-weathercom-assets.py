#!/usr/bin/env python3
"""Extract only the public Weather.com page-style resources from the checked-in reference ZIP.

No Weather.com brand logos, JavaScript application bundles, trackers, or vendor scripts
are copied into the EARTH WEATHER app. We retain the reference CSS, font faces and
weather-background sprites only; React and the EARTH WEATHER backend provide behaviour.
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
    raise SystemExit(f"Required public UI capture is missing: {ARCHIVE}")

try:
    with ZipFile(ARCHIVE) as archive:
        broken = archive.testzip()
        if broken:
            raise SystemExit(f"Reference ZIP integrity check failed at: {broken}")
        names = [name for name in archive.namelist() if not name.endswith("/")]

        css_paths = {}
        for filename in CSS_FILES:
            matches = [name for name in names if name.endswith("/_next/static/immutable/chunks/" + filename)]
            if not matches:
                raise SystemExit(f"Reference ZIP is missing the original CSS bundle: {filename}")
            css_paths[filename] = matches[0]

        prefixes = {
            path[:-len("chunks/" + filename)]
            for filename, path in css_paths.items()
        }
        if len(prefixes) != 1:
            raise SystemExit("The three original CSS bundles do not share one immutable asset root.")
        prefix = prefixes.pop()
        selected = list(css_paths.values())
        selected.extend(
            name for name in names
            if name.startswith(prefix + "media/")
            and (
                name.lower().endswith(".woff2")
                or Path(name).name.startswith(SPRITE_PREFIX)
            )
        )

        extracted = 0
        for name in selected:
            relative = name[len(prefix):]
            target = DEST / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(name))
            extracted += 1

        if extracted < 12:
            raise SystemExit(
                f"Only {extracted} CSS/font/sprite assets were extracted; expected 12 or more."
            )
except BadZipFile as exc:
    raise SystemExit(f"The checked-in UI reference is not a valid ZIP: {exc}") from exc

print(
    f"Extracted {extracted} original reference CSS/font/sprite assets "
    f"from {ARCHIVE.name}; Weather.com logo and JS are intentionally excluded."
)
