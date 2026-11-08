"""Live satellite imagery catalogue adapters.

This module discovers public NASA GIBS WMTS layers at runtime. It deliberately
reports provider access requirements instead of claiming every mission is a
live, global weather feed. Satellite imagery is not a substitute for numerical
weather-model fields or official warning services.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any

import httpx

NASA_GIBS_CAPABILITIES_URL = (
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml"
)

SATELLITE_PROVIDERS: list[dict[str, Any]] = [
    {
        "id": "nasa-gibs",
        "provider": "NASA EOSDIS GIBS",
        "missions": ["Terra MODIS", "Aqua MODIS", "Suomi-NPP VIIRS", "NOAA-20 VIIRS", "NOAA-21 VIIRS", "GOES"],
        "coverage": "Global or product-specific",
        "integration": "live-public-wmts",
        "requires_credentials": False,
        "data_type": "Satellite imagery products",
        "endpoint": NASA_GIBS_CAPABILITIES_URL,
    },
    {
        "id": "noaa-goes",
        "provider": "NOAA GOES / NESDIS",
        "missions": ["GOES-16", "GOES-18", "GOES-19"],
        "coverage": "Americas and adjacent oceans",
        "integration": "public-product-dependent",
        "requires_credentials": False,
        "data_type": "ABI imagery, GeoColor, cloud and moisture imagery, GLM lightning",
        "endpoint": "https://www.goes.noaa.gov/",
    },
    {
        "id": "jma-himawari",
        "provider": "Japan Meteorological Agency",
        "missions": ["Himawari-8", "Himawari-9"],
        "coverage": "Asia-Pacific and western Pacific",
        "integration": "public-product-dependent",
        "requires_credentials": False,
        "data_type": "Visible, infrared and water-vapour imagery",
        "endpoint": "https://www.data.jma.go.jp/mscweb/en/",
    },
    {
        "id": "imd-insat",
        "provider": "India Meteorological Department",
        "missions": ["INSAT-3D", "INSAT-3DR", "INSAT-3DS"],
        "coverage": "India and surrounding region",
        "integration": "credentials-required",
        "requires_credentials": True,
        "credential_env": "IMD_API_TOKEN",
        "data_type": "Weather imagery, cloud products and official cyclone products",
        "endpoint": "https://api.imd.gov.in/public/",
    },
    {
        "id": "copernicus",
        "provider": "Copernicus Data Space / ESA",
        "missions": ["Sentinel-1", "Sentinel-2", "Sentinel-3", "Sentinel-5P"],
        "coverage": "Global archive; acquisition and revisit dependent",
        "integration": "oauth-required",
        "requires_credentials": True,
        "credential_env": "COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET",
        "data_type": "SAR, optical, ocean and atmospheric-composition products",
        "endpoint": "https://dataspace.copernicus.eu/",
    },
    {
        "id": "landsat",
        "provider": "USGS / NASA Landsat",
        "missions": ["Landsat 8", "Landsat 9"],
        "coverage": "Global archive; scene acquisition dependent",
        "integration": "public-archive",
        "requires_credentials": False,
        "data_type": "Multispectral and thermal land imagery",
        "endpoint": "https://www.usgs.gov/landsat-missions",
    },
    {
        "id": "commercial",
        "provider": "Commercial Earth-observation operators",
        "missions": ["Planet", "Maxar", "Airbus and licensed constellations"],
        "coverage": "Contract and collection dependent",
        "integration": "license-required",
        "requires_credentials": True,
        "credential_env": None,
        "data_type": "Licensed high-resolution optical and radar imagery",
        "endpoint": None,
    },
]


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_gibs_capabilities(xml_text: str, limit: int = 250) -> list[dict[str, Any]]:
    """Extract actual WMTS layers and tile URL templates from GIBS capabilities XML."""
    root = ET.fromstring(xml_text)
    layers: list[dict[str, Any]] = []
    contents = next((node for node in root.iter() if _local_name(node.tag) == "Contents"), None)
    if contents is None:
        raise ValueError("NASA GIBS WMTS capabilities has no Contents section")

    for layer in (node for node in contents if _local_name(node.tag) == "Layer"):
        fields: dict[str, list[str]] = {}
        for child in layer.iter():
            name = _local_name(child.tag)
            if name in {"Identifier", "Title", "Format"} and child.text:
                fields.setdefault(name, []).append(child.text.strip())
        identifiers = fields.get("Identifier", [])
        if not identifiers:
            continue
        templates = [
            node.attrib.get("template")
            for node in layer.iter()
            if _local_name(node.tag) == "ResourceURL" and node.attrib.get("template")
        ]
        time_default: str | None = None
        time_extent: str | None = None
        for dimension in (node for node in layer.iter() if _local_name(node.tag) == "Dimension"):
            identifier = next((child.text.strip().lower() for child in dimension.iter() if _local_name(child.tag) == "Identifier" and child.text), "")
            if identifier == "time":
                time_default = next((child.text.strip() for child in dimension.iter() if _local_name(child.tag) == "Default" and child.text), None)
                time_extent = next((child.text.strip() for child in dimension.iter() if _local_name(child.tag) == "Value" and child.text), None)
                break
        layers.append({
            "id": identifiers[0],
            "title": (fields.get("Title") or identifiers)[0],
            "formats": fields.get("Format", []),
            "tile_templates": templates[:3],
            "default_time": time_default,
            "time_extent": time_extent,
        })
        if len(layers) >= limit:
            break
    return layers


async def fetch_gibs_layers(client: httpx.AsyncClient, limit: int = 250) -> dict[str, Any]:
    """Fetch live NASA GIBS WMTS metadata; raises on upstream errors for caller handling."""
    response = await client.get(NASA_GIBS_CAPABILITIES_URL)
    response.raise_for_status()
    layers = parse_gibs_capabilities(response.text, limit=limit)
    return {
        "provider": "NASA EOSDIS GIBS",
        "status": "live",
        "retrieved_layers": len(layers),
        "layers": layers,
        "capabilities_url": NASA_GIBS_CAPABILITIES_URL,
        "note": "Live WMTS layer metadata. Product acquisition time, geographic coverage and latency vary by layer.",
    }
