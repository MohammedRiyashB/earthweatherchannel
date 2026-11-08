import os
import unittest
from unittest.mock import patch, AsyncMock

from fastapi import HTTPException
from app import main as weather_api


def params_for(points: int) -> dict[str, str]:
    latitudes = [str(index - 6) for index in range(points)]
    longitudes = [str(index + 100) for index in range(points)]
    return {"latitude": ",".join(latitudes), "longitude": ",".join(longitudes)}


class WeatherProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_met_norway_is_the_primary_provider(self):
        class FakeResponse:
            headers = {"cache-control": "max-age=0"}
            def raise_for_status(self): pass
            def json(self):
                return {"properties":{"timeseries":[{"time":"2026-11-07T17:00:00Z","data":{"instant":{"details":{"air_temperature":28.0,"relative_humidity":65,"wind_speed":2.0}},"next_1_hours":{"summary":{"symbol_code":"clearsky_day"},"details":{"precipitation_amount":0.0}}}}]}}
        class FakeClient:
            async def get(self, url, params, **kwargs): return FakeResponse()
        result = await weather_api._fetch_weather_current(FakeClient(), params_for(1))
        self.assertEqual(result["provider"], "metnorway")
        self.assertEqual(result["temperature_2m"], 28.0)

    async def test_met_norway_failure_falls_back_to_open_meteo(self):
        class FakeResponse:
            def raise_for_status(self): pass
            def json(self):
                return {"current":{"time":"2026-11-07T17:00","temperature_2m":25.0,"relative_humidity_2m":90,"wind_speed_10m":2.0,"weather_code":0},"hourly":{"time":["2026-11-07T17:00"],"rain":[0.0]}}
        class FakeClient:
            def __init__(self): self.calls = 0
            async def get(self, url, params, **kwargs):
                self.calls += 1
                if self.calls == 1: raise weather_api.httpx.ConnectError("MET Norway unavailable")
                return FakeResponse()
        result = await weather_api._fetch_weather_current(FakeClient(), params_for(1))
        self.assertEqual(result["provider"], "open-meteo")
        self.assertEqual(result["temperature_2m"], 25.0)

    async def test_open_meteo_is_free_and_needs_no_environment_key(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertTrue(weather_api._provider_is_configured("open-meteo"))

    async def test_coordinate_count_and_ranges_are_validated(self):
        with self.assertRaises(HTTPException) as raised:
            await weather_api._fetch_weather_current(object(), {"latitude":"10,11", "longitude":"70"})
        self.assertEqual(raised.exception.status_code, 422)

    async def test_batch_keeps_coordinate_order(self):
        class FakeResponse:
            def raise_for_status(self): pass
            def json(self):
                return {"properties":{"timeseries":[{"time":"2026-11-07T17:00:00Z","data":{"instant":{"details":{"air_temperature":1.0,"wind_speed":1.0}}}}]}}
        class FakeClient:
            async def get(self, url, params, **kwargs):
                response = FakeResponse()
                response.json = lambda: {"properties":{"timeseries":[{"time":"2026-11-07T17:00:00Z","data":{"instant":{"details":{"air_temperature":float(params["lat"])+6,"wind_speed":1.0}}}}]}}
                return response
        result = await weather_api._fetch_weather_rows(FakeClient(), [-6.0,-5.0,-4.0], [100.0,101.0,102.0])
        self.assertEqual([row["current"]["temperature_2m"] for row in result], [0.0,1.0,2.0])

    async def test_open_meteo_adapter_maps_all_live_weather_fields(self):
        class FakeResponse:
            def raise_for_status(self): pass
            def json(self):
                return {
                    "current": {"time":"2026-11-07T17:00","temperature_2m":25.8,"relative_humidity_2m":91,
                        "apparent_temperature":31.2,"is_day":0,"precipitation":0.0,"rain":0.0,"showers":0.0,
                        "weather_code":1,"cloud_cover":24,"pressure_msl":1014,"wind_speed_10m":5.9,
                        "wind_direction_10m":337,"wind_gusts_10m":13.0},
                    "hourly":{"time":["2026-11-07T17:00"],"rain":[0.2]},
                }
        class FakeClient:
            async def get(self, url, params):
                self.url=url; self.params=params; return FakeResponse()
        client=FakeClient()
        result=await weather_api._fetch_provider_current(client,"open-meteo",13.08,80.27)
        current=result["current"]
        self.assertEqual(current["temperature_2m"],25.8)
        self.assertEqual(current["relative_humidity_2m"],91)
        self.assertEqual(current["wind_speed_10m"],5.9)
        self.assertEqual(current["wind_direction_10m"],337)
        self.assertEqual(current["cloud_cover"],24)
        self.assertEqual(current["rainfall_rate_mm_h"],0.2)
        self.assertEqual(result["provider"],"open-meteo")

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


class WeatherNewsReaderTests(unittest.TestCase):
    def test_article_parser_extracts_title_metadata_image_and_paragraphs(self):
        parser = weather_api._WeatherArticleParser()
        parser.feed("""<html><head><title>Weather update</title>
        <meta property='og:title' content='Heavy rain warning'>
        <meta property='og:description' content='A weather alert for the region.'>
        <meta property='og:image' content='https://news.example/image.jpg'></head>
        <body><main><article><p>Authorities issued a weather alert after heavy rain affected several towns across the district.</p>
        <p>Residents have been advised to avoid flooded roads and follow official weather updates.</p></article></main></body></html>""")
        self.assertEqual(parser.meta["og:title"], "Heavy rain warning")
        self.assertEqual(parser.meta["og:image"], "https://news.example/image.jpg")
        self.assertEqual(len(parser.paragraphs), 2)
        self.assertIn("flooded roads", parser.paragraphs[1])

    def test_sachet_rss_item_maps_official_alert_metadata_and_localized_text(self):
        import xml.etree.ElementTree as ET
        payload = ET.fromstring("""<item><title>Rain and thunderstorm over Namakkal</title>
        <description></description><category>Met</category>
        <link>https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=123</link>
        <author>controlroom@ndma.gov.in (IMD Chennai)</author>
        <pubDate>Sat, 07 Nov 2026 16:45:33 GMT</pubDate></item>""")
        story = weather_api._rss_item_to_story(payload, "NDMA SACHET")
        self.assertIn("Namakkal", story["title"])
        self.assertEqual(story["category"], "Met")
        self.assertIn("IMD Chennai", story["source"])
        self.assertTrue(weather_api._weather_story_matches(story))
        self.assertTrue(story["url"].startswith("https://sachet.ndma.gov.in/"))

    def test_rss_image_entities_are_decoded(self):
        import xml.etree.ElementTree as ET
        payload = ET.fromstring("""<item><title>Storm photo</title><link>https://example.com/story</link>
        <description><![CDATA[<img src='https://example.com/photo.jpg?width=120&amp;caption=storm'>]]></description></item>""")
        story = weather_api._rss_item_to_story(payload, "Example")
        self.assertEqual(story["image"], "https://example.com/photo.jpg?width=120&caption=storm")
        self.assertEqual(story["description"], "")

    def test_article_host_rejects_loopback_addresses(self):
        async def check():
            with self.assertRaises(HTTPException) as raised:
                await weather_api._assert_public_article_host("http://127.0.0.1/private")
            self.assertEqual(raised.exception.status_code, 403)
        import asyncio
        asyncio.run(check())


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
