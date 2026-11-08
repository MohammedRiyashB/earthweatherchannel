import unittest

import httpx

from app.forecast import (
    ForecastUnavailable,
    _normalize_met_norway,
    fetch_forecast,
)


def open_meteo_payload():
    return {
        "latitude": 13.08,
        "longitude": 80.27,
        "timezone": "Asia/Kolkata",
        "current": {
            "time": "2026-11-08T12:00",
            "temperature_2m": 30.1,
            "relative_humidity_2m": 68,
            "weather_code": 2,
        },
        "current_units": {"temperature_2m": "°C"},
        "hourly": {
            "time": ["2026-11-08T12:00", "2026-11-08T13:00"],
            "temperature_2m": [30.1, 30.8],
            "precipitation_probability": [10, 20],
            "weather_code": [2, 3],
        },
        "hourly_units": {"temperature_2m": "°C"},
        "daily": {
            "time": ["2026-11-08", "2026-11-09"],
            "temperature_2m_max": [32.0, 31.5],
            "temperature_2m_min": [25.0, 24.8],
            "weather_code": [2, 61],
        },
        "daily_units": {"temperature_2m_max": "°C"},
    }


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class ForecastAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_primary_met_norway_returns_hourly_and_daily_arrays(self):
        met_payload = {"properties":{"timeseries":[
            {"time":"2026-11-08T06:00:00Z","data":{"instant":{"details":{"air_temperature":28.0,"relative_humidity":70,"wind_speed":3.0,"wind_from_direction":180,"cloud_area_fraction":20}},"next_1_hours":{"summary":{"symbol_code":"clearsky_day"},"details":{"precipitation_amount":0.0}}}},
            {"time":"2026-11-08T07:00:00Z","data":{"instant":{"details":{"air_temperature":29.0,"relative_humidity":68,"wind_speed":4.0,"wind_from_direction":190,"cloud_area_fraction":25}},"next_1_hours":{"summary":{"symbol_code":"rain"},"details":{"precipitation_amount":0.5}}}},
        ]}}
        supplement_payload = {
            "latitude": 13.08,
            "longitude": 80.27,
            "timezone": "Asia/Kolkata",
            "current": {"pressure_msl": 1014.2},
            "hourly": {
                "time": ["2026-11-08T11:30", "2026-11-08T12:30"],
                "dew_point_2m": [18.5, 18.8],
                "uv_index": [2.7, 3.0],
                "visibility": [18000, 22000],
            },
            "daily": {
                "time": ["2026-11-08"],
                "sunrise": ["2026-11-08T06:04"],
                "sunset": ["2026-11-08T17:40"],
                "uv_index_max": [7.1],
            },
        }
        class Client:
            def __init__(self):
                self.requests = []
            async def get(self, url, params, headers=None):
                self.requests.append((url, params, headers))
                return FakeResponse(met_payload if "api.met.no" in url else supplement_payload)
        client = Client()
        result = await fetch_forecast(client, 13.08, 80.27, days=2, timezone_name="Asia/Kolkata")
        self.assertEqual(result["source"]["provider"], "metnorway")
        self.assertEqual(result["current"]["temperature_2m"], 28.0)
        self.assertEqual(result["current"]["dew_point_2m"], 18.5)
        self.assertEqual(result["current"]["uv_index"], 2.7)
        self.assertEqual(result["current"]["pressure_msl"], 1014.2)
        self.assertEqual(result["hourly"]["dew_point_2m"], [18.5, 18.8])
        self.assertEqual(result["hourly"]["uv_index"], [2.7, 3.0])
        self.assertEqual(result["hourly"]["visibility"], [18000, 22000])
        self.assertEqual(result["daily"]["time"], ["2026-11-08"])
        self.assertEqual(result["daily"]["sunrise"], ["2026-11-08T06:04"])
        self.assertEqual(result["daily"]["sunset"], ["2026-11-08T17:40"])
        self.assertEqual(result["daily"]["uv_index_max"], [7.1])
        self.assertIn(result["astronomy"]["phase"], {
            "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
            "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
        })
        self.assertEqual(client.requests[0][1]["lat"], 13.08)
        self.assertEqual(client.requests[0][1]["lon"], 80.27)
        self.assertIn("supplemental_source", result)

    async def test_met_norway_invalid_payload_falls_back_to_open_meteo(self):
        met_payload = {
            "properties": {
                "timeseries": [
                    {
                        "time": "2026-11-08T06:00:00Z",
                        "data": {
                            "instant": {
                                "details": {
                                    "air_temperature": 28.0,
                                    "relative_humidity": 70,
                                    "wind_speed": 3.0,
                                    "wind_from_direction": 180,
                                    "cloud_area_fraction": 20,
                                }
                            },
                            "next_1_hours": {
                                "summary": {"symbol_code": "clearsky_day"},
                                "details": {"precipitation_amount": 0.0},
                            },
                        },
                    },
                    {
                        "time": "2026-11-08T07:00:00Z",
                        "data": {
                            "instant": {"details": {"air_temperature": 29.0, "wind_speed": 4.0}},
                            "next_1_hours": {
                                "summary": {"symbol_code": "rain"},
                                "details": {"precipitation_amount": 0.5},
                            },
                        },
                    },
                ]
            }
        }

        class Client:
            def __init__(self):
                self.calls = 0

            async def get(self, url, params, headers=None):
                self.calls += 1
                if self.calls == 1:
                    return FakeResponse({"reason": "invalid forecast"})
                return FakeResponse(open_meteo_payload())

        result = await fetch_forecast(Client(), 11.34, 77.72, days=2)

        self.assertEqual(result["source"]["provider"], "open-meteo")
        self.assertEqual(result["current"]["temperature_2m"], 30.1)
        self.assertEqual(result["fallback_reason"], "metnorway:ValueError")

    async def test_met_norway_empty_forecast_is_rejected(self):
        with self.assertRaises(ValueError):
            _normalize_met_norway({"properties": {"timeseries": []}}, 0.0, 0.0, 7)

    async def test_all_forecast_providers_down_returns_explicit_failure(self):
        class Client:
            async def get(self, url, params, headers=None):
                raise httpx.ConnectError("offline")

        with self.assertRaises(ForecastUnavailable):
            await fetch_forecast(Client(), 0.0, 0.0)


if __name__ == "__main__":
    unittest.main()
