import asyncio
import unittest
from unittest.mock import patch

from app import main as weather_api


def params_for(points: int) -> dict[str, str]:
    latitudes = [str(index - 6) for index in range(points)]
    longitudes = [str(index + 100) for index in range(points)]
    return {"latitude": ",".join(latitudes), "longitude": ",".join(longitudes)}


class WeatherProviderBatchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        weather_api._current_provider_cache.clear()

    async def test_twelve_city_request_is_one_batch_and_preserves_order(self) -> None:
        calls: list[tuple[list[float], list[float]]] = []

        async def fake_request(_client, latitudes, longitudes):
            calls.append((latitudes, longitudes))
            return [
                {"current": {"temperature_2m": latitude, "weather_code": 0}}
                for latitude in latitudes
            ]

        with patch.object(weather_api, "_request_current_chunk", new=fake_request):
            result = await weather_api._fetch_open_meteo_current(object(), params_for(12))

        self.assertEqual(len(calls), 1)
        self.assertEqual(len(result), 12)
        self.assertEqual(
            [row["current"]["temperature_2m"] for row in result],
            [float(index - 6) for index in range(12)],
        )

    async def test_failed_multi_city_batch_falls_back_without_reordering(self) -> None:
        calls: list[int] = []

        async def fake_request(_client, latitudes, longitudes):
            calls.append(len(latitudes))
            if len(latitudes) > 1:
                raise RuntimeError("simulated batch failure")
            return [{"current": {"temperature_2m": latitudes[0]}}]

        with patch.object(weather_api, "_request_current_chunk", new=fake_request):
            result = await weather_api._fetch_open_meteo_current(object(), params_for(3))

        self.assertEqual(calls[0], 3)
        self.assertEqual(calls[1:], [1, 1, 1])
        self.assertEqual(
            [row["current"]["temperature_2m"] for row in result],
            [-6.0, -5.0, -4.0],
        )

    async def test_stale_good_report_is_used_after_upstream_failure(self) -> None:
        loop_now = asyncio.get_running_loop().time()
        key = (-6.0, 100.0)
        weather_api._current_provider_cache[key] = (
            loop_now - 120,
            {"current": {"temperature_2m": 27.5, "weather_code": 1}},
        )

        async def fail_request(_client, _latitudes, _longitudes):
            raise RuntimeError("simulated provider outage")

        with patch.object(weather_api, "_request_current_chunk", new=fail_request):
            result = await weather_api._fetch_open_meteo_current(
                object(), params_for(1)
            )

        self.assertEqual(result["current"]["temperature_2m"], 27.5)
        self.assertEqual(result["current"]["weather_code"], 1)


class WeatherGeographyTests(unittest.TestCase):
    def test_distance_is_zero_for_same_coordinate(self) -> None:
        self.assertAlmostEqual(
            weather_api._distance_km(11.341, 77.7172, 11.341, 77.7172),
            0.0,
            places=6,
        )

    def test_featured_city_coordinates_and_names_are_valid(self) -> None:
        names = [city["name"] for city in weather_api.FEATURED_CITIES]
        self.assertEqual(len(names), len(set(names)))
        for city in weather_api.FEATURED_CITIES:
            self.assertGreaterEqual(city["lat"], -90)
            self.assertLessEqual(city["lat"], 90)
            self.assertGreaterEqual(city["lon"], -180)
            self.assertLessEqual(city["lon"], 180)


if __name__ == "__main__":
    unittest.main()
