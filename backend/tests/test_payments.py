import os
import unittest
from unittest.mock import patch

from app.payments import _services, calculate_checkout_amount


class DynamicPaymentPricingTests(unittest.TestCase):
    def test_service_catalogue_loads_server_owned_usd_daily_rates_and_quotas(self):
        catalogue = {
            "current-weather": {"name": "Current Weather API", "price_per_day": 0.42, "requests_per_day": 2500},
            "daily-forecast": {"name": "Daily Forecast API", "price_per_day": 0.14},
        }
        with patch.dict(os.environ, {"EARTH_WEATHER_API_SERVICES": __import__("json").dumps(catalogue)}):
            result = _services()
        self.assertEqual(result["current-weather"]["price_per_day"], 0.42)
        self.assertEqual(result["current-weather"]["requests_per_day"], 2500)
        self.assertEqual(result["daily-forecast"]["requests_per_day"], 1000)

    def test_zero_price_services_are_not_sellable(self):
        with patch.dict(os.environ, {"EARTH_WEATHER_API_SERVICES": '{"current-weather":{"name":"Current Weather","price_per_day":0}}'}):
            self.assertEqual(_services(), {})

    def test_weekly_dynamic_amount_uses_sum_of_selected_server_rates(self):
        services = {
            "current-weather": {"price_per_day": 0.4271},
            "daily-forecast": {"price_per_day": 0.1414},
            "weather-maps": {"price_per_day": 0.1414},
        }
        self.assertEqual(calculate_checkout_amount(services, ["current-weather", "daily-forecast"], 7), 3.98)

    def test_twenty_eight_day_term_receives_fifteen_percent_discount(self):
        services = {
            "current-weather": {"price_per_day": 0.4271},
            "daily-forecast": {"price_per_day": 0.1414},
        }
        self.assertEqual(calculate_checkout_amount(services, ["current-weather", "daily-forecast"], 28), 13.55)

    def test_unknown_service_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unknown API service IDs"):
            calculate_checkout_amount({"current-weather": {"price_per_day": 0.5}}, ["unknown"], 7)

    def test_duration_outside_one_to_thirty_days_is_rejected(self):
        with self.assertRaises(ValueError):
            calculate_checkout_amount({"current-weather": {"price_per_day": 0.5}}, ["current-weather"], 31)


if __name__ == "__main__":
    unittest.main()
