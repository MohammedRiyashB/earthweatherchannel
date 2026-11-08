"""Hourly and daily weather forecast adapters for EARTH WEATHER.

Open-Meteo is the primary forecast source. MET Norway Locationforecast is used
as a clearly-labelled fallback. Missing values remain null/omitted; values are
never fabricated or labelled as satellite observations.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
METNORWAY_URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete"

CURRENT_FIELDS = (
    "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,"
    "precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,"
    "wind_speed_10m,wind_direction_10m,wind_gusts_10m"
)
HOURLY_FIELDS = (
    "temperature_2m,relative_humidity_2m,apparent_temperature,"
    "precipitation_probability,precipitation,rain,showers,snowfall,weather_code,"
    "cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility"
)
DAILY_FIELDS = (
    "weather_code,temperature_2m_max,temperature_2m_min,"
    "apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,"
    "precipitation_sum,precipitation_probability_max,wind_speed_10m_max,"
    "wind_direction_10m_dominant"
)


class ForecastUnavailable(RuntimeError):
    """Raised when every configured forecast provider fails validation."""


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _validate_open_meteo(payload: dict[str, Any]) -> None:
    current = payload.get("current")
    hourly = payload.get("hourly")
    daily = payload.get("daily")
    if not isinstance(current, dict) or not _is_number(current.get("temperature_2m")):
        raise ValueError("Open-Meteo forecast has no valid current temperature")
    if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list) or not hourly["time"]:
        raise ValueError("Open-Meteo forecast has no hourly time series")
    if not isinstance(daily, dict) or not isinstance(daily.get("time"), list) or not daily["time"]:
        raise ValueError("Open-Meteo forecast has no daily time series")
    expected = len(hourly["time"])
    if any(isinstance(v, list) and len(v) != expected for v in hourly.values()):
        raise ValueError("Open-Meteo hourly arrays have inconsistent lengths")
    expected_daily = len(daily["time"])
    if any(isinstance(v, list) and len(v) != expected_daily for v in daily.values()):
        raise ValueError("Open-Meteo daily arrays have inconsistent lengths")


def _met_symbol_to_wmo(symbol: Any) -> int | None:
    if not isinstance(symbol, str):
        return None
    value = symbol.lower()
    if "thunder" in value:
        return 95
    if "snow" in value:
        return 71
    if "sleet" in value:
        return 85
    if "heavyrain" in value:
        return 65
    if "rain" in value or "shower" in value:
        return 61
    if "fog" in value:
        return 45
    if "cloudy" in value or "overcast" in value:
        return 3
    if "partlycloudy" in value:
        return 2
    if "fair" in value:
        return 1
    if "clearsky" in value:
        return 0
    return None


def _parse_met_time(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _normalize_met_norway(payload: dict[str, Any], latitude: float, longitude: float, days: int) -> dict[str, Any]:
    properties = payload.get("properties") or {}
    timeseries = properties.get("timeseries") or []
    if not timeseries:
        raise ValueError("MET Norway returned an empty forecast")

    hourly: dict[str, list[Any]] = defaultdict(list)
    day_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in timeseries:
        timestamp = item.get("time")
        parsed = _parse_met_time(timestamp) if isinstance(timestamp, str) else None
        if parsed is None:
            continue
        data = item.get("data") or {}
        details = ((data.get("instant") or {}).get("details") or {})
        next_hour = data.get("next_1_hours") or {}
        next_six = data.get("next_6_hours") or {}
        summary = next_hour.get("summary") or next_six.get("summary") or {}
        precip_details = next_hour.get("details") or next_six.get("details") or {}
        symbol = summary.get("symbol_code")
        row = {
            "time": timestamp,
            "temperature_2m": details.get("air_temperature"),
            "relative_humidity_2m": details.get("relative_humidity"),
            "apparent_temperature": details.get("air_temperature"),
            "precipitation": precip_details.get("precipitation_amount"),
            "rain": precip_details.get("precipitation_amount"),
            "weather_code": _met_symbol_to_wmo(symbol),
            "cloud_cover": details.get("cloud_area_fraction"),
            "wind_speed_10m": (details.get("wind_speed") * 3.6) if _is_number(details.get("wind_speed")) else None,
            "wind_direction_10m": details.get("wind_from_direction"),
            "wind_gusts_10m": (details.get("wind_speed_of_gust") * 3.6) if _is_number(details.get("wind_speed_of_gust")) else None,
        }
        for key, value in row.items():
            hourly[key].append(value)
        day_groups[parsed.date().isoformat()].append(row)

    if not hourly.get("time"):
        raise ValueError("MET Norway returned no valid forecast timestamps")

    # The first timestamp is the nearest available forecast point.
    current = {
        "temperature_2m": hourly.get("temperature_2m", [None])[0],
        "relative_humidity_2m": hourly.get("relative_humidity_2m", [None])[0],
        "apparent_temperature": hourly.get("apparent_temperature", [None])[0],
        "weather_code": hourly.get("weather_code", [None])[0],
        "precipitation": hourly.get("precipitation", [None])[0],
        "cloud_cover": hourly.get("cloud_cover", [None])[0],
        "wind_speed_10m": hourly.get("wind_speed_10m", [None])[0],
        "wind_direction_10m": hourly.get("wind_direction_10m", [None])[0],
        "wind_gusts_10m": hourly.get("wind_gusts_10m", [None])[0],
        "is_day": None,
    }
    if not _is_number(current["temperature_2m"]):
        raise ValueError("MET Norway forecast has no valid current temperature")

    daily: dict[str, list[Any]] = {
        "time": [],
        "temperature_2m_max": [],
        "temperature_2m_min": [],
        "precipitation_sum": [],
        "weather_code": [],
        "wind_speed_10m_max": [],
    }
    for date_key in sorted(day_groups)[:days]:
        rows = day_groups[date_key]
        temps = [r["temperature_2m"] for r in rows if _is_number(r["temperature_2m"])]
        winds = [r["wind_speed_10m"] for r in rows if _is_number(r["wind_speed_10m"])]
        rain = [r["precipitation"] for r in rows if _is_number(r["precipitation"])]
        daily["time"].append(date_key)
        daily["temperature_2m_max"].append(max(temps) if temps else None)
        daily["temperature_2m_min"].append(min(temps) if temps else None)
        daily["precipitation_sum"].append(sum(rain) if rain else None)
        daily["weather_code"].append(next((r["weather_code"] for r in rows if r["weather_code"] is not None), None))
        daily["wind_speed_10m_max"].append(max(winds) if winds else None)

    return {
        "location": {"latitude": latitude, "longitude": longitude},
        "timezone": "UTC",
        "timezone_abbreviation": "UTC",
        "current": current,
        "hourly": dict(hourly),
        "hourly_units": {
            "temperature_2m": "°C",
            "relative_humidity_2m": "%",
            "apparent_temperature": "°C",
            "precipitation": "mm",
            "rain": "mm",
            "wind_speed_10m": "km/h",
            "wind_direction_10m": "°",
            "wind_gusts_10m": "km/h",
        },
        "daily": daily,
        "daily_units": {
            "temperature_2m_max": "°C",
            "temperature_2m_min": "°C",
            "precipitation_sum": "mm",
            "wind_speed_10m_max": "km/h",
        },
        "source": {
            "provider": "metnorway",
            "name": "MET Norway Locationforecast",
            "url": "https://api.met.no/weatherapi/locationforecast/2.0/documentation",
        },
    }


async def fetch_forecast(
    client: httpx.AsyncClient,
    latitude: float,
    longitude: float,
    days: int = 7,
    timezone_name: str = "auto",
) -> dict[str, Any]:
    """Return validated hourly/daily forecast with explicit provider provenance."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": CURRENT_FIELDS,
        "hourly": HOURLY_FIELDS,
        "daily": DAILY_FIELDS,
        "forecast_days": days,
        "timezone": timezone_name,
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }
    errors: list[str] = []

    try:
        response = await client.get(OPEN_METEO_URL, params=params)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Open-Meteo returned a non-object response")
        _validate_open_meteo(payload)
        payload["location"] = {
            "latitude": payload.get("latitude", latitude),
            "longitude": payload.get("longitude", longitude),
        }
        payload["source"] = {
            "provider": "open-meteo",
            "name": "Open-Meteo multi-model forecast",
            "url": "https://open-meteo.com/en/docs",
        }
        return payload
    except (httpx.HTTPError, ValueError, TypeError, KeyError) as exc:
        errors.append(f"open-meteo:{exc.__class__.__name__}")

    try:
        response = await client.get(METNORWAY_URL, params={"lat": latitude, "lon": longitude})
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("MET Norway returned a non-object response")
        fallback = _normalize_met_norway(payload, latitude, longitude, days)
        fallback["fallback_reason"] = errors[0]
        return fallback
    except (httpx.HTTPError, ValueError, TypeError, KeyError) as exc:
        errors.append(f"metnorway:{exc.__class__.__name__}")

    raise ForecastUnavailable("; ".join(errors))
