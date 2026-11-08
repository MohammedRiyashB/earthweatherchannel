"""Hourly and daily weather forecast adapters for EARTH WEATHER.

MET Norway Locationforecast is the primary forecast source. Open-Meteo is a
clearly-labelled fallback. MET Norway worldwide requests are cached according
to provider guidance. Missing values remain null; forecasts are never labelled
as satellite observations.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import asyncio
import os
import time
from typing import Any
from bisect import bisect_left
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
METNORWAY_USER_AGENT = os.getenv("METNORWAY_USER_AGENT", "EARTH-WEATHER/1.0 (+https://earthweatherchannel.web.app)")
_FORECAST_CACHE: dict[tuple[float, float, int, str], tuple[float, dict[str, Any]]] = {}
_FORECAST_CACHE_LOCK = asyncio.Lock()
_METNORWAY_MIN_CACHE_SECONDS = 3 * 60 * 60
METNORWAY_URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete"

CURRENT_FIELDS = (
    "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,is_day,uv_index,"
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


def _zone_or_utc(name: str) -> ZoneInfo:
    """Resolve an IANA timezone supplied by the client, safely falling back to UTC."""
    if not name or name == "auto":
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _moon_phase_details(moment: datetime | None = None) -> dict[str, Any]:
    """Approximate the illuminated lunar phase from the synodic-month cycle."""
    instant = moment or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    reference_new_moon = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)
    synodic_days = 29.530588853
    age_days = ((instant.astimezone(timezone.utc) - reference_new_moon).total_seconds() / 86400) % synodic_days
    fraction = age_days / synodic_days
    illumination = round((1 - __import__("math").cos(2 * __import__("math").pi * fraction)) * 50, 1)
    if fraction < 0.03 or fraction >= 0.97:
        phase = "New Moon"
    elif fraction < 0.22:
        phase = "Waxing Crescent"
    elif fraction < 0.28:
        phase = "First Quarter"
    elif fraction < 0.47:
        phase = "Waxing Gibbous"
    elif fraction < 0.53:
        phase = "Full Moon"
    elif fraction < 0.72:
        phase = "Waning Gibbous"
    elif fraction < 0.78:
        phase = "Last Quarter"
    else:
        phase = "Waning Crescent"
    return {
        "phase": phase,
        "illumination_percent": illumination,
        "age_days": round(age_days, 2),
        "calculated_at": instant.astimezone(timezone.utc).isoformat(),
        "method": "Astronomical synodic-month calculation",
    }


async def _supplement_met_forecast_details(
    client: httpx.AsyncClient,
    forecast: dict[str, Any],
    latitude: float,
    longitude: float,
    days: int,
    timezone_name: str,
) -> None:
    """Fill MET Norway gaps with aligned Open-Meteo dew point, UV, visibility and sun times.

    MET Norway remains the primary weather forecast. This supplementary request only
    fills fields it does not expose in the normalized response. A failed supplement
    never invalidates a good primary forecast.
    """
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "dew_point_2m,uv_index,pressure_msl",
        "hourly": "uv_index,visibility",
        "daily": "sunrise,sunset,uv_index_max",
        "forecast_days": days,
        "timezone": timezone_name,
    }
    try:
        response = await asyncio.wait_for(client.get(OPEN_METEO_URL, params=params), timeout=12.0)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            return

        supplemental_current = payload.get("current") or {}
        current = forecast.setdefault("current", {})
        for key in ("dew_point_2m", "uv_index", "pressure_msl"):
            value = supplemental_current.get(key)
            if _is_number(value) and (key != "pressure_msl" or not _is_number(current.get(key))):
                current[key] = value

        # Open-Meteo supplies local wall-clock timestamps; MET timestamps are UTC.
        # Convert both to UTC instants, then select the nearest hour (within 45 min)
        # to handle half-hour timezones such as Asia/Kolkata.
        zone_name = payload.get("timezone") or timezone_name
        zone = _zone_or_utc(str(zone_name))
        supplemental_hourly = payload.get("hourly") or {}
        supplemental_times = supplemental_hourly.get("time") or []
        source_points: list[tuple[float, int]] = []
        for index, raw_time in enumerate(supplemental_times):
            if not isinstance(raw_time, str):
                continue
            try:
                parsed = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=zone)
                source_points.append((parsed.astimezone(timezone.utc).timestamp(), index))
            except ValueError:
                continue
        source_points.sort(key=lambda point: point[0])
        source_stamps = [point[0] for point in source_points]

        hourly = forecast.setdefault("hourly", {})
        met_times = hourly.get("time") or []
        for key in ("uv_index", "visibility"):
            source_values = supplemental_hourly.get(key) or []
            aligned: list[Any] = []
            for raw_time in met_times:
                if not isinstance(raw_time, str) or not source_points:
                    aligned.append(None)
                    continue
                try:
                    target = _parse_met_time(raw_time)
                    if target is None:
                        aligned.append(None)
                        continue
                    stamp = target.astimezone(timezone.utc).timestamp()
                    position = bisect_left(source_stamps, stamp)
                    candidates = source_points[max(0, position - 1):min(len(source_points), position + 1)]
                    nearest = min(candidates, key=lambda point: abs(point[0] - stamp))
                    if abs(nearest[0] - stamp) > 45 * 60:
                        aligned.append(None)
                        continue
                    source_index = nearest[1]
                    aligned.append(source_values[source_index] if source_index < len(source_values) else None)
                except (ValueError, TypeError, IndexError):
                    aligned.append(None)
            if aligned and any(_is_number(value) for value in aligned):
                hourly[key] = aligned

        supplemental_daily = payload.get("daily") or {}
        source_dates = supplemental_daily.get("time") or []
        daily_lookup = {str(day)[:10]: index for index, day in enumerate(source_dates)}
        daily = forecast.setdefault("daily", {})
        for key in ("sunrise", "sunset", "uv_index_max"):
            source_values = supplemental_daily.get(key) or []
            aligned_daily = []
            for day in daily.get("time") or []:
                source_index = daily_lookup.get(str(day)[:10])
                aligned_daily.append(
                    source_values[source_index]
                    if source_index is not None and source_index < len(source_values)
                    else None
                )
            if aligned_daily and any(value is not None for value in aligned_daily):
                daily[key] = aligned_daily

        forecast["supplemental_source"] = {
            "provider": "open-meteo",
            "name": "Open-Meteo supplementary atmospheric and solar fields",
            "url": "https://open-meteo.com/en/docs",
            "fields": ["dew_point_2m", "uv_index", "visibility", "sunrise", "sunset", "uv_index_max"],
        }
        if payload.get("timezone"):
            forecast["timezone"] = payload["timezone"]
    except (httpx.HTTPError, ValueError, TypeError, KeyError, asyncio.TimeoutError):
        # Keep the complete primary forecast and leave unavailable supplements null.
        return


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


def _normalize_met_norway(payload: dict[str, Any], latitude: float, longitude: float, days: int, timezone_name: str = "UTC") -> dict[str, Any]:
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
        next_period = next_hour or next_six or data.get("next_12_hours") or {}
        summary = next_period.get("summary") or {}
        precip_details = next_period.get("details") or {}
        symbol = summary.get("symbol_code")
        row = {
            "time": timestamp,
            "temperature_2m": details.get("air_temperature"),
            "relative_humidity_2m": details.get("relative_humidity"),
            "apparent_temperature": details.get("apparent_air_temperature", details.get("air_temperature")),
            "precipitation_probability": precip_details.get("probability_of_precipitation"),
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
        "sunrise": [],
        "sunset": [],
        "uv_index_max": [],
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
        "timezone": timezone_name if timezone_name != "auto" else "UTC",
        "timezone_abbreviation": timezone_name if timezone_name != "auto" else "UTC",
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
            "dew_point_2m": "°C",
            "pressure_msl": "hPa",
            "uv_index": "",
            "visibility": "m",
        },
        "daily": daily,
        "daily_units": {
            "temperature_2m_max": "°C",
            "temperature_2m_min": "°C",
            "precipitation_sum": "mm",
            "wind_speed_10m_max": "km/h",
            "sunrise": "iso8601",
            "sunset": "iso8601",
            "uv_index_max": "",
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
    """Return cached MET Norway forecast first, with a validated Open-Meteo fallback."""
    # MET Norway advises no more than four coordinate decimals; bucketing to 2
    # decimals also prevents a moving GPS fix from defeating the cache.
    cache_key = (round(latitude, 2), round(longitude, 2), days, timezone_name)
    async with _FORECAST_CACHE_LOCK:
        cached = _FORECAST_CACHE.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return deepcopy(cached[1])

    errors: list[str] = []
    try:
        response = await client.get(
            METNORWAY_URL,
            params={"lat": cache_key[0], "lon": cache_key[1]},
            headers={"User-Agent": METNORWAY_USER_AGENT, "Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("MET Norway returned a non-object response")
        forecast = _normalize_met_norway(payload, cache_key[0], cache_key[1], days, timezone_name)
        headers = getattr(response, "headers", {}) or {}
        ttl = float(_METNORWAY_MIN_CACHE_SECONDS)
        expires = headers.get("expires")
        if expires:
            try:
                ttl = max(ttl, (parsedate_to_datetime(expires) - datetime.now(timezone.utc)).total_seconds())
            except (TypeError, ValueError, OverflowError):
                pass
        await _supplement_met_forecast_details(client, forecast, cache_key[0], cache_key[1], days, timezone_name)
        forecast["astronomy"] = _moon_phase_details()
        forecast["source"]["cache_seconds"] = int(ttl)
        forecast["source"]["last_modified"] = headers.get("last-modified")
        async with _FORECAST_CACHE_LOCK:
            _FORECAST_CACHE[cache_key] = (time.monotonic() + ttl, deepcopy(forecast))
        return forecast
    except (httpx.HTTPError, ValueError, TypeError, KeyError) as exc:
        errors.append(f"metnorway:{exc.__class__.__name__}")

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
        payload["astronomy"] = _moon_phase_details()
        payload["source"] = {
            "provider": "open-meteo",
            "name": "Open-Meteo multi-model forecast · fallback",
            "url": "https://open-meteo.com/en/docs",
        }
        payload["fallback_reason"] = errors[0]
        async with _FORECAST_CACHE_LOCK:
            _FORECAST_CACHE[cache_key] = (time.monotonic() + 10 * 60, deepcopy(payload))
        return payload
    except (httpx.HTTPError, ValueError, TypeError, KeyError) as exc:
        errors.append(f"open-meteo:{exc.__class__.__name__}")

    raise ForecastUnavailable("; ".join(errors))
