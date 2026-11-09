import os
import unittest
from unittest.mock import patch

from app.payments import _firestore_database_id, _services, calculate_checkout_amount


class FirestoreDatabaseSelectionTests(unittest.TestCase):
    def test_uses_the_named_earthweather_database(self):
        with patch.dict(os.environ, {"CLOUD_FIRESTORE_DATABASE": "earthweather"}):
            self.assertEqual(_firestore_database_id(), "earthweather")

    def test_unset_database_id_uses_firebase_default(self):
        with patch.dict(os.environ):
            os.environ.pop("CLOUD_FIRESTORE_DATABASE", None)
            self.assertEqual(_firestore_database_id(), "(default)")


class DynamicPaymentPricingTests(unittest.TestCase):
    def test_service_catalogue_loads_server_owned_usd_daily_rates_and_quotas(self):
        catalogue = {
            "current-weather": {"name": "Current Weather API", "base_price_per_day": 2.99 / 7, "price_per_day": 0.99 / 7, "requests_per_day": 2500},
            "daily-forecast": {"name": "Daily Forecast API", "base_price_per_day": 2.99 / 7, "price_per_day": 0.99 / 7},
        }
        with patch.dict(os.environ, {"EARTH_WEATHER_API_SERVICES": __import__("json").dumps(catalogue)}):
            result = _services()
        self.assertAlmostEqual(result["current-weather"]["base_price_per_day"], 2.99 / 7, places=6)
        self.assertEqual(result["current-weather"]["requests_per_day"], 2500)
        self.assertEqual(result["daily-forecast"]["requests_per_day"], 1000)
        self.assertAlmostEqual(result["daily-forecast"]["base_price_per_day"], 2.99 / 7, places=6)

    def test_zero_price_services_are_not_sellable(self):
        with patch.dict(os.environ, {"EARTH_WEATHER_API_SERVICES": '{"current-weather":{"name":"Current Weather","price_per_day":0}}'}):
            self.assertEqual(_services(), {})

    def test_weekly_dynamic_amount_uses_sum_of_selected_server_rates(self):
        services = {
            "current-weather": {"base_price_per_day": 2.99 / 7, "price_per_day": 0.99 / 7},
            "daily-forecast": {"base_price_per_day": 2.99 / 7, "price_per_day": 0.99 / 7},
            "weather-maps": {"base_price_per_day": 2.99 / 7, "price_per_day": 0.99 / 7},
        }
        self.assertEqual(calculate_checkout_amount(services, ["current-weather", "daily-forecast"], 7), 3.98)

    def test_twenty_eight_day_term_receives_fifteen_percent_discount(self):
        services = {
            "current-weather": {"base_price_per_day": 2.99 / 7, "price_per_day": 0.99 / 7},
            "daily-forecast": {"base_price_per_day": 2.99 / 7, "price_per_day": 0.99 / 7},
        }
        self.assertEqual(calculate_checkout_amount(services, ["current-weather", "daily-forecast"], 28), 13.53)

    def test_one_selected_service_uses_the_base_weekly_price(self):
        services = {"daily-forecast": {"base_price_per_day": 2.99 / 7, "price_per_day": 0.99 / 7}}
        self.assertEqual(calculate_checkout_amount(services, ["daily-forecast"], 7), 2.99)

    def test_unknown_service_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unknown API service IDs"):
            calculate_checkout_amount({"current-weather": {"base_price_per_day": 0.5, "price_per_day": 0.2}}, ["unknown"], 7)

    def test_duration_outside_one_to_thirty_days_is_rejected(self):
        with self.assertRaises(ValueError):
            calculate_checkout_amount({"current-weather": {"base_price_per_day": 0.5, "price_per_day": 0.2}}, ["current-weather"], 31)


if __name__ == "__main__":
    unittest.main()
