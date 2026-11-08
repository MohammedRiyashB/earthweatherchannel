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
    async def test_primary_open_meteo_returns_hourly_and_daily_arrays(self):
        class Client:
            async def get(self, url, params):
                self.url = url
                self.params = params
                return FakeResponse(open_meteo_payload())

        client = Client()
        result = await fetch_forecast(client, 13.08, 80.27, days=2, timezone_name="Asia/Kolkata")

        self.assertEqual(result["source"]["provider"], "open-meteo")
        self.assertEqual(result["current"]["temperature_2m"], 30.1)
        self.assertEqual(len(result["hourly"]["time"]), 2)
        self.assertEqual(len(result["daily"]["time"]), 2)
        self.assertEqual(client.params["forecast_days"], 2)
        self.assertEqual(client.params["timezone"], "Asia/Kolkata")

    async def test_open_meteo_invalid_payload_falls_back_to_met_norway(self):
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

            async def get(self, url, params):
                self.calls += 1
                if self.calls == 1:
                    return FakeResponse({"reason": "invalid forecast"})
                return FakeResponse(met_payload)

        result = await fetch_forecast(Client(), 11.34, 77.72, days=2)

        self.assertEqual(result["source"]["provider"], "metnorway")
        self.assertEqual(result["current"]["temperature_2m"], 28.0)
        self.assertEqual(result["hourly"]["temperature_2m"], [28.0, 29.0])
        self.assertEqual(result["daily"]["temperature_2m_max"], [29.0])
        self.assertEqual(result["fallback_reason"], "open-meteo:ValueError")

    async def test_met_norway_empty_forecast_is_rejected(self):
        with self.assertRaises(ValueError):
            _normalize_met_norway({"properties": {"timeseries": []}}, 0.0, 0.0, 7)

    async def test_all_forecast_providers_down_returns_explicit_failure(self):
        class Client:
            async def get(self, url, params):
                raise httpx.ConnectError("offline")

        with self.assertRaises(ForecastUnavailable):
            await fetch_forecast(Client(), 0.0, 0.0)


if __name__ == "__main__":
    unittest.main()
