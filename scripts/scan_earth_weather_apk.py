#!/usr/bin/env python3
from __future__ import annotations
import json, re, sys, zipfile
from pathlib import Path

apk = Path(sys.argv[1] if len(sys.argv) > 1 else "EarthWeather.apk")
if not apk.is_file():
    raise SystemExit(f"APK not found: {apk}")
patterns = [
    b"OPPO", b"oppo", b"OPLUS", b"oplus", b"ColorOS", b"coloros",
    b"Heytap", b"heytap", b"com.oplus", b"com.heytap",
    b"com.coloros", b"com.oppo", b"Guangdong OPPO",
    b"oppo.com", b"oplus.com", b"heytap.com",
]
report = {"apk": str(apk), "bytes": apk.stat().st_size, "hits": [], "scanned_entries": 0}
with zipfile.ZipFile(apk) as z:
    report["zip_test"] = z.testzip()
    for name in z.namelist():
        if name.endswith("/"):
            continue
        data = z.read(name)
        report["scanned_entries"] += 1
        found = [p.decode("ascii") for p in patterns if re.search(re.escape(p), data, re.IGNORECASE)]
        if found:
            report["hits"].append({"entry": name, "patterns": sorted(set(found))})
report["hits"].sort(key=lambda x: x["entry"])
Path("brand-scan-report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
critical = []
for item in report["hits"]:
    n = item["entry"]
    if n.startswith(("classes", "res/", "assets/", "META-INF/")) or n == "AndroidManifest.xml":
        critical.append(item)
if report["zip_test"]:
    raise SystemExit(f"APK ZIP integrity failure: {report['zip_test']}")
if critical:
    raise SystemExit("Old vendor branding remains in app code/resources; see brand-scan-report.json")
