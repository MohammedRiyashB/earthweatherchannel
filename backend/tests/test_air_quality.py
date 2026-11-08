import unittest
from unittest.mock import AsyncMock

from fastapi import HTTPException, Response

from app import main as weather_api


class AirQualityRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_air_quality_returns_modelled_cams_data_and_provenance(self):
        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "latitude": 13.08,
                    "longitude": 80.27,
                    "timezone": "Asia/Kolkata",
                    "current": {"us_aqi": 42, "pm2_5": 7.2, "pm10": 14.1},
                    "current_units": {"us_aqi": "USAQI", "pm2_5": "μg/m³"},
                    "hourly": {"time": ["2026-11-08T19:00"], "us_aqi": [42]},
                    "hourly_units": {"us_aqi": "USAQI"},
                }

        client = AsyncMock()
        client.get.return_value = FakeResponse()
        original = getattr(weather_api.app.state, "weather_http", None)
        weather_api.app.state.weather_http = client
        try:
            response = Response()
            result = await weather_api.air_quality(response, 13.08, 80.27, 5)
        finally:
            if original is not None:
                weather_api.app.state.weather_http = original

        self.assertEqual(result["source"]["provider"], "open-meteo-cams")
        self.assertEqual(result["current"]["us_aqi"], 42)
        self.assertIn("not the official Indian CPCB AQI", result["note"])
        self.assertIn("s-maxage=900", response.headers["cache-control"])
        request = client.get.await_args
        self.assertIn("air-quality-api.open-meteo.com", request.args[0])
        self.assertEqual(request.kwargs["params"]["forecast_days"], 5)

    async def test_air_quality_provider_errors_return_502(self):
        client = AsyncMock()
        client.get.side_effect = weather_api.httpx.ConnectError("provider unavailable")
        original = getattr(weather_api.app.state, "weather_http", None)
        weather_api.app.state.weather_http = client
        try:
            with self.assertRaises(HTTPException) as raised:
                await weather_api.air_quality(Response(), 13.08, 80.27, 5)
        finally:
            if original is not None:
                weather_api.app.state.weather_http = original
        self.assertEqual(raised.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
