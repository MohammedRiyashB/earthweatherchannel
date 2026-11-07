import os
import unittest
from unittest.mock import patch, AsyncMock

from fastapi import HTTPException
from app import main as weather_api


def params_for(points: int) -> dict[str, str]:
    latitudes = [str(index - 6) for index in range(points)]
    longitudes = [str(index + 100) for index in range(points)]
    return {"latitude": ",".join(latitudes), "longitude": ",".join(longitudes)}


class WeatherProviderFailoverTests(unittest.IsolatedAsyncioTestCase):
    async def test_primary_provider_is_selected_when_healthy(self):
        async def fake(_client, provider, lat, lon):
            return {"provider": provider, "current": {"temperature_2m": 28.0}}
        with patch.dict(os.environ, {"WEATHERAPI_KEY":"x", "OPENWEATHER_API_KEY":"y", "METNORWAY_USER_AGENT":"EarthWeather test contact https://example.com"}), \
             patch.object(weather_api, "_fetch_provider_current", new=fake):
            result = await weather_api._fetch_weather_current(object(), params_for(1))
        self.assertEqual(result["provider"], "weatherapi")
        self.assertEqual(result["temperature_2m"], 28.0)

    async def test_primary_failure_falls_back_to_secondary(self):
        async def fake(_client, provider, lat, lon):
            if provider == "weatherapi":
                raise weather_api.httpx.ConnectError("primary down")
            return {"provider": provider, "current": {"temperature_2m": 27.0}}
        with patch.dict(os.environ, {"WEATHERAPI_KEY":"x", "OPENWEATHER_API_KEY":"y", "METNORWAY_USER_AGENT":"EarthWeather test contact https://example.com"}), \
             patch.object(weather_api, "_fetch_provider_current", new=fake):
            result = await weather_api._fetch_weather_current(object(), params_for(1))
        self.assertEqual(result["provider"], "openweather")
        self.assertEqual(result["temperature_2m"], 27.0)

    async def test_both_paid_key_providers_down_falls_back_to_met_norway(self):
        async def fake(_client, provider, lat, lon):
            if provider != "metnorway":
                raise weather_api.httpx.ConnectError("provider down")
            return {"provider": provider, "current": {"temperature_2m": 26.0}}
        with patch.dict(os.environ, {"WEATHERAPI_KEY":"x", "OPENWEATHER_API_KEY":"y", "METNORWAY_USER_AGENT":"EarthWeather test contact https://example.com"}), \
             patch.object(weather_api, "_fetch_provider_current", new=fake):
            result = await weather_api._fetch_weather_current(object(), params_for(1))
        self.assertEqual(result["provider"], "metnorway")
        self.assertEqual(result["temperature_2m"], 26.0)

    async def test_all_unconfigured_providers_return_clear_503(self):
        with patch.dict(os.environ, {"WEATHERAPI_KEY":"", "OPENWEATHER_API_KEY":"", "METNORWAY_USER_AGENT":""}, clear=False):
            for key in ("WEATHERAPI_KEY", "OPENWEATHER_API_KEY", "METNORWAY_USER_AGENT"):
                os.environ.pop(key, None)
            with self.assertRaises(HTTPException) as raised:
                await weather_api._fetch_weather_current(object(), params_for(1))
        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(len(raised.exception.detail["provider_failures"]), 3)

    async def test_coordinate_count_and_ranges_are_validated(self):
        with self.assertRaises(HTTPException) as raised:
            await weather_api._fetch_weather_current(object(), {"latitude":"10,11", "longitude":"70"})
        self.assertEqual(raised.exception.status_code, 422)

    async def test_batch_keeps_coordinate_order(self):
        async def fake(_client, provider, lat, lon):
            return {"provider": provider, "current": {"temperature_2m": lat}}
        with patch.dict(os.environ, {"WEATHERAPI_KEY":"x"}), patch.object(weather_api, "_fetch_provider_current", new=fake):
            result = await weather_api._fetch_weather_current(object(), params_for(3))
        self.assertEqual([row["current"]["temperature_2m"] for row in result], [-6.0, -5.0, -4.0])


class WeatherNormalizationTests(unittest.TestCase):
    def test_weatherapi_current_normalizes_to_common_schema(self):
        result = weather_api._normalize_weatherapi({"current":{"temp_c":25,"humidity":70,"wind_kph":12,"condition":{"code":1000,"text":"Sunny"}}})
        self.assertEqual(result["temperature_2m"], 25)
        self.assertEqual(result["wind_speed_10m"], 12)
        self.assertEqual(result["weather_description"], "Sunny")

    def test_openweather_wind_speed_converts_meters_per_second_to_kmh(self):
        result = weather_api._normalize_openweather({"main":{"temp":26},"wind":{"speed":5,"deg":90},"weather":[{"id":800,"description":"clear sky"}]})
        self.assertEqual(result["wind_speed_10m"], 18.0)
        self.assertEqual(result["temperature_2m"], 26)

    def test_met_norway_wind_speed_converts_meters_per_second_to_kmh(self):
        result = weather_api._normalize_metnorway({"properties":{"timeseries":[{"time":"2026-11-07T10:00:00Z","data":{"instant":{"details":{"air_temperature":24,"wind_speed":3,"relative_humidity":60}}}}]}})
        self.assertEqual(result["wind_speed_10m"], 10.8)
        self.assertEqual(result["temperature_2m"], 24)


class WeatherGeographyTests(unittest.TestCase):
    def test_distance_is_zero_for_same_coordinate(self):
        self.assertAlmostEqual(weather_api._distance_km(11.341,77.7172,11.341,77.7172),0.0,places=6)

    def test_featured_city_coordinates_and_names_are_valid(self):
        names=[city["name"] for city in weather_api.FEATURED_CITIES]
        self.assertEqual(len(names),len(set(names)))
        for city in weather_api.FEATURED_CITIES:
            self.assertGreaterEqual(city["lat"],-90); self.assertLessEqual(city["lat"],90)
            self.assertGreaterEqual(city["lon"],-180); self.assertLessEqual(city["lon"],180)


if __name__ == "__main__":
    unittest.main()
