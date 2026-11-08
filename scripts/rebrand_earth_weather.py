#!/usr/bin/env python3
"""Rebrand the decoded Weather UI package for EARTH WEATHER.

This keeps the decoded layouts, animations, resources and weather UI logic. It
changes product identity/legal links, redirects the weather SDK to the EARTH
WEATHER API, and disables the inherited vendor ad request paths.
"""
from __future__ import annotations

import html
import re
import shutil
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path("decoded")
API = "https://earth-weather-api.onrender.com"
SITE = "https://earthweatherchannel.web.app"

if not (ROOT / "AndroidManifest.xml").exists():
    raise SystemExit("decoded Android project is missing")

TEXT_EXT = {
    ".smali", ".xml", ".json", ".html", ".txt", ".properties", ".cfg",
    ".ini", ".aidl", ".proto", ".svg", ".js", ".css", ".kt", ".java",
}

# Rename application/platform namespaces, not unrelated Android/Google libraries.
PACKAGE_REPLACEMENTS = [
    ("com.coloros.weather2", "com.bmrinc.earthweather"),
    ("com/coloros/weather2", "com/bmrinc/earthweather"),
    ("com.coloros", "com.bmrinc.earthweather.platform"),
    ("com/coloros", "com/bmrinc/earthweather/platform"),
    ("com.oplusos", "com.bmrinc.earthweather.platformos"),
    ("com/oplusos", "com/bmrinc/earthweather/platformos"),
    ("com.oplus", "com.bmrinc.earthweather.core"),
    ("com/oplus", "com/bmrinc/earthweather/core"),
    ("com.heytap", "com.bmrinc.earthweather.platform"),
    ("com/heytap", "com/bmrinc/earthweather/platform"),
    ("com.oppo", "com.bmrinc.earthweather.vendor"),
    ("com/oppo", "com/bmrinc/earthweather/vendor"),
    ("com.opos", "com.bmrinc.earthweather.vendorad"),
    ("com/opos", "com/bmrinc/earthweather/vendorad"),
]

IDENTITY_REPLACEMENTS = [
    ("OPPOFeedAdManager", "EarthWeatherFeedAdManager"),
    ("OPPOInternalAdManager", "EarthWeatherInternalAdManager"),
    ("OppoWeather2", "EarthWeather"),
    ("OPLUS", "EARTH WEATHER"),
    ("OPlus", "Earth Weather"),
    ("Oplus", "Earth Weather"),
    ("colorOs", "earthweather"),
    ("ColorOs", "Earth Weather"),
    ("oplus", "earthweather"),
    ("OPPO", "EARTH WEATHER"),
    ("Oppo", "Earth Weather"),
    ("oppo", "earthweather"),
    ("ColorOS", "EARTH WEATHER"),
    ("coloros", "earthweather"),
    ("Heytap", "EARTH WEATHER"),
    ("heytap", "earthweather"),
    ("OPOS", "EARTH WEATHER"),
    ("Opos", "Earth Weather"),
    ("opos", "earthweather"),
]

POLICY_URL = f"{SITE}/privacy-policy"
TERMS_URL = f"{SITE}/terms-and-conditions"
DATA_URL = f"{SITE}/data-usage-policy"
COOKIE_URL = f"{SITE}/cookie-policy"
SOURCES_URL = f"{SITE}/weather-data-sources"
ABOUT_URL = f"{SITE}/aboutus"
SUPPORT_URL = f"{SITE}/contact-support"

def replace_text_file(path: Path) -> int:
    try:
        original = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return 0
    updated = original.replace("@font/oplus_sans3_nogx", "sans-serif")
    for old, new in PACKAGE_REPLACEMENTS:
        updated = updated.replace(old, new)
    updated = updated.replace("oplus_sans3_nogx", "sans-serif")
    # Replace only old vendor legal/support URLs; leave unrelated data providers intact.
    updated = re.sub(
        r"https?://(?:www\.)?(?:privacy\.)?(?:oppo|oplus|heytap|coloros)\.[^\s\"'<>]+",
        POLICY_URL,
        updated,
        flags=re.IGNORECASE,
    )
    for old, new in IDENTITY_REPLACEMENTS:
        updated = updated.replace(old, new)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        return 1
    return 0

changed_files = 0
for p in ROOT.rglob("*"):
    if p.is_file() and p.suffix.lower() in TEXT_EXT:
        changed_files += replace_text_file(p)

# Set app-facing labels and make the built-in legal screens point to the website's
# existing, maintained policy pages instead of the inherited vendor legal text.
STRING_VALUES = {
    "app_name": "Earth Weather",
    "weather_about": "About Earth Weather",
    "user_agreement": "Earth Weather User Agreement",
    "privacy_policy_weather": "Earth Weather Privacy Policy",
    "privacy_policy_weather_service": "Earth Weather Privacy Policy",
    "user_information_protection_policy": "Earth Weather Privacy Policy",
    "new_user_policy_00": "Earth Weather Privacy Policy",
    "user_policy_00": "Earth Weather Privacy Policy",
    "export_personal_service_protection_policy": "Earth Weather Data Usage Policy",
    "personal_service_protection_policy": "Earth Weather Data Usage Policy",
    "third_party_information": "Third-Party Information",
    "weather_third_party_info": "Third-Party Information",
}
KEY_URLS = {
    "url_www_oppo_feedback_01": SUPPORT_URL,
    "url_www_realme_feedback_01": SUPPORT_URL,
    "url_www_oplus_feedback_01": SUPPORT_URL,
}
def xml_escape(value: str) -> str:
    return (value.replace("&", "&amp;").replace("<", "&lt;")
                 .replace(">", "&gt;").replace('"', "&quot;"))

def set_string_entries(path: Path) -> int:
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return 0
    changed = 0
    pattern = re.compile(
        r'(<string\b(?=[^>]*\bname="([^"]+)")[^>]*>)(.*?)(</string>)',
        re.DOTALL,
    )
    def repl(m: re.Match[str]) -> str:
        nonlocal changed
        key, current = m.group(2), m.group(3)
        value = None
        if key in STRING_VALUES:
            value = STRING_VALUES[key]
        elif key in KEY_URLS:
            value = KEY_URLS[key]
        elif re.fullmatch(r"agreement_\d+", key):
            value = f"Please read the EARTH WEATHER User Agreement at {TERMS_URL}."
        elif re.fullmatch(r"(?:export_)?(?:new_)?statement_\d+", key):
            value = f"Please read the EARTH WEATHER Privacy Policy at {POLICY_URL}."
        elif re.fullmatch(r"service_\d+", key):
            value = f"Please read the EARTH WEATHER Data Usage Policy at {DATA_URL}."
        elif any(t in key.lower() for t in ("oppo", "oplus", "heytap", "coloros")):
            value = SUPPORT_URL
        elif any(t in key.lower() for t in ("privacy", "policy", "protect")) and ("url" in key.lower() or "link" in key.lower()):
            value = POLICY_URL
        elif any(t in key.lower() for t in ("agreement", "terms")) and ("url" in key.lower() or "link" in key.lower()):
            value = TERMS_URL
        if value is None:
            # Route any remaining old vendor URL in a resource to our owned legal pages.
            if re.search(r"(?:oppo|oplus|heytap|coloros)\.", current, re.IGNORECASE):
                value = SUPPORT_URL if "feedback" in key.lower() or "contact" in key.lower() else POLICY_URL
        if value is None:
            return m.group(0)
        changed += 1
        return m.group(1) + xml_escape(value) + m.group(4)
    updated = pattern.sub(repl, text)
    if updated != text:
        path.write_text(updated, encoding="utf-8")
    return changed

strings_changed = 0
for p in (ROOT / "res").glob("values*/strings.xml"):
    strings_changed += set_string_entries(p)

# Route every built-in user data / privacy / third-party disclosure page to the
# exact EARTH WEATHER legal references already published by the website.
def legal_html(title: str, lead: str, links: list[tuple[str, str]]) -> str:
    rows = "\n".join(
        f'<p><a href="{url}">{label}</a></p>' for label, url in links
    )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><h2>{title}</h2><p>{lead}</p>{rows}</body></html>"""

third_party_html = legal_html(
    "EARTH WEATHER — Third-Party Information",
    "Information about the weather data providers, maps, imagery, and third-party services used by EARTH WEATHER is maintained on the official website.",
    [
        ("Weather data sources and third-party information", SOURCES_URL),
        ("EARTH WEATHER Privacy Policy", POLICY_URL),
        ("EARTH WEATHER Terms & Conditions", TERMS_URL),
    ],
)
privacy_html = legal_html(
    "EARTH WEATHER — Privacy Policy",
    "The current privacy notice for EARTH WEATHER is published on the official website.",
    [
        ("Privacy Policy", POLICY_URL),
        ("Data Usage Policy", DATA_URL),
        ("Cookie Policy", COOKIE_URL),
        ("Terms & Conditions", TERMS_URL),
        ("Contact Support", SUPPORT_URL),
    ],
)
for p in (ROOT / "assets" / "license").glob("weather_third_party_info_*.html"):
    p.write_text(third_party_html, encoding="utf-8")
for name in ("user_information_list.html", "user_information_list_ad.html",
             "user_information_list_realme_domestic.html", "other_information_list.html"):
    p = ROOT / "res" / "raw" / name
    if p.exists():
        p.write_text(privacy_html if "information" in name else third_party_html, encoding="utf-8")

# Keep the original UI layouts but use Android's system sans-serif rather than
# embedding a proprietary branded typeface in the Earth Weather package.
font = ROOT / "res" / "font" / "oplus_sans3_nogx.ttf"
if font.exists():
    font.unlink()

# The OPPO product-certificate chain was only used by the vendor's encrypted
# service handshake, which is replaced by the EARTH WEATHER JSON API adapter.
cert_dir = ROOT / "assets" / "crypto_android_sdk" / "oplus_prod_cert_chain"
if cert_dir.exists():
    shutil.rmtree(cert_dir)

# Kotlin module metadata is build-time compiler metadata, not Android runtime data.
# Remove vendor-generated module descriptors so their original namespace strings do not ship.
for metadata in (ROOT / "META-INF").glob("*.kotlin_module"):
    metadata.unlink()
for metadata in (ROOT / "META-INF").glob("com.*.kotlin_module"):
    metadata.unlink()

# Remove original APK signing manifests and all compiler metadata before re-signing.
meta_inf = ROOT / "META-INF"
if meta_inf.exists():
    for pattern in ("*.SF", "*.RSA", "*.DSA", "*.EC", "MANIFEST.MF", "*.kotlin_module"):
        for metadata in meta_inf.rglob(pattern):
            if metadata.is_file():
                metadata.unlink()
    for directory in sorted((p for p in meta_inf.rglob("*") if p.is_dir()), reverse=True):
        if not any(directory.iterdir()):
            directory.rmdir()

# Move renamed app namespaces to their new source-tree locations after the
# descriptors have been updated in all smali files.
for base in sorted(ROOT.glob("smali*")):
    for old_rel, new_rel in [
        ("com/coloros/weather2", "com/bmrinc/earthweather"),
        ("com/oplusos", "com/bmrinc/earthweather/platformos"),
        ("com/oplus", "com/bmrinc/earthweather/core"),
        ("com/heytap", "com/bmrinc/earthweather/platform"),
        ("com/oppo", "com/bmrinc/earthweather/vendor"),
        ("com/opos", "com/bmrinc/earthweather/vendorad"),
    ]:
        src = base / old_rel
        if src.exists():
            dest = base / new_rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists():
                for child in list(src.iterdir()):
                    target = dest / child.name
                    if target.exists():
                        raise SystemExit(f"namespace move collision: {target}")
                    shutil.move(str(child), str(target))
                shutil.rmtree(src)
            else:
                shutil.move(str(src), str(dest))

# Also move vendor-named assets and Kotlin module metadata paths.
for p in sorted(ROOT.rglob("*"), key=lambda x: len(x.parts), reverse=True):
    if not p.exists():
        continue
    name = p.name
    new_name = name
    for old, new in [
        ("OppoWeather2", "EarthWeather"),
        ("oplus", "earthweather"),
        ("oppo", "earthweather"),
        ("heytap", "earthweather"),
        ("coloros", "earthweather"),
        ("OPlus", "EarthWeather"),
        ("Oplus", "EarthWeather"),
        ("colorOs", "earthweather"),
        ("ColorOs", "EarthWeather"),
        ("OPPO", "EARTHWEATHER"),
        ("Heytap", "EarthWeather"),
        ("ColorOS", "EarthWeather"),
    ]:
        new_name = new_name.replace(old, new)
    if new_name != name:
        target = p.with_name(new_name)
        if target.exists():
            raise SystemExit(f"file/path rename collision: {target}")
        p.rename(target)

# Update manifest identity and the exact app label reference.
manifest = ROOT / "AndroidManifest.xml"
tree = ET.parse(manifest)
m = tree.getroot()
m.set("package", "com.bmrinc.earthweather")
ET.register_namespace("android", "http://schemas.android.com/apk/res/android")
tree.write(manifest, encoding="utf-8", xml_declaration=True)

# Patch the original Weather SDK host to use only the EARTH WEATHER backend.
def patch_method(path: Path, method_name_pattern: str, replacement: str, label: str) -> None:
    if not path.exists():
        raise SystemExit(f"required class missing for {label}: {path}")
    source = path.read_text(encoding="utf-8")
    pattern = re.compile(
        r"(?ms)^\.method [^\n]*" + method_name_pattern + r".*?^\.end method",
    )
    updated, count = pattern.subn(replacement, source, count=1)
    if count != 1:
        raise SystemExit(f"could not patch {label}; method pattern not found")
    path.write_text(updated, encoding="utf-8")

smali_roots = sorted(ROOT.glob("smali*"))
def find_smali(relative: str) -> Path:
    for base in smali_roots:
        candidate = base / relative
        if candidate.exists():
            return candidate
    raise SystemExit(f"required smali file missing: {relative}")

host = find_smali("com/bmrinc/earthweather/core/weather/service/network/host/Host.smali")
patch_method(
    host, r"getAddress\(\)Ljava/lang/String;",
    """.method public getAddress()Ljava/lang/String;
    .locals 1
    const-string v0, "https://earth-weather-api.onrender.com"
    return-object v0
.end method""",
    "EARTH WEATHER API host",
)
crypto = find_smali("com/bmrinc/earthweather/platform/weather/interceptor/CryptoInterceptor.smali")
patch_method(
    crypto, r"intercept\(Lokhttp3/Interceptor\$Chain;\)Lokhttp3/Response;",
    """.method public intercept(Lokhttp3/Interceptor$Chain;)Lokhttp3/Response;
    .locals 1
    invoke-interface {p1}, Lokhttp3/Interceptor$Chain;->request()Lokhttp3/Request;
    move-result-object v0
    invoke-interface {p1, v0}, Lokhttp3/Interceptor$Chain;->proceed(Lokhttp3/Request;)Lokhttp3/Response;
    move-result-object v0
    return-object v0
.end method""",
    "EARTH WEATHER JSON request interceptor",
)
manager = find_smali("com/bmrinc/earthweather/core/weather/WeatherDataClientManager.smali")
patch_method(
    manager, r"cryptoInit\(\)V",
    """.method public static cryptoInit()V
    .locals 1
    sget-boolean v0, Lcom/bmrinc/earthweather/core/weather/WeatherDataClientManager;->cryptoIsInit:Z
    if-nez v0, :cond_0
    const/4 v0, 0x1
    sput-boolean v0, Lcom/bmrinc/earthweather/core/weather/WeatherDataClientManager;->cryptoIsInit:Z
    invoke-static {}, Lcom/bmrinc/earthweather/core/weather/WeatherDataClientManager;->setRequestHeader()V
    :cond_0
    return-void
.end method""",
    "vendor crypto handshake removal",
)

# The old advertising adapters are deliberately disabled. This build does not
# pretend that website AdSense is a mobile SDK; mobile ad placements remain off
# until an authorized mobile ad provider and its own app/unit IDs are configured.
banner = find_smali("com/bmrinc/earthweather/core/weather/ad/banner/BannerAdManager.smali")
patch_method(
    banner, r"requestAdByCityCode\(Ljava/lang/String;Ljava/lang/String;Z\)V",
    """.method public static requestAdByCityCode(Ljava/lang/String;Ljava/lang/String;Z)V
    .locals 0
    return-void
.end method""",
    "legacy banner ad request disable",
)
max_ad = find_smali("com/bmrinc/earthweather/core/weather/ad/banner/MaxNativeAdMgr.smali")
patch_method(
    max_ad, r"requestMainAd\(Landroid/app/Activity;Landroid/view/ViewGroup;\)V",
    """.method public final requestMainAd(Landroid/app/Activity;Landroid/view/ViewGroup;)V
    .locals 1
    if-eqz p2, :done
    const/16 v0, 0x8
    invoke-virtual {p2, v0}, Landroid/view/View;->setVisibility(I)V
    :done
    return-void
.end method""",
    "legacy MAX native ad display disable",
)

# Confirm no old vendor identity or legal URLs remain in decoded text resources.
forbidden = re.compile(
    r"OPPO|Oppo|oppo|OPLUS|OPlus|oplus|ColorOS|coloros|Heytap|heytap|"
    r"com\.oppo|com\.oplus|com\.heytap|com\.coloros|Guangdong OPPO|"
    r"oppo\.com|oplus\.com|heytap\.com",
    re.IGNORECASE,
)
hits = []
for p in ROOT.rglob("*"):
    if p.is_file() and p.suffix.lower() in TEXT_EXT:
        try:
            body = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if forbidden.search(body):
            hits.append(str(p))
if hits:
    raise SystemExit("Old vendor references remain in decoded text: " + ", ".join(hits[:30]))

print({
    "text_files_changed": changed_files,
    "legal_resource_entries_updated": strings_changed,
    "old_vendor_text_scan": "PASS",
    "application_id": "com.bmrinc.earthweather",
    "app_name": "Earth Weather",
    "api_host": API,
    "website_policy": POLICY_URL,
    "website_terms": TERMS_URL,
    "website_sources": SOURCES_URL,
    "mobile_ads": "disabled pending an authorized Earth Weather mobile ad provider",
})
