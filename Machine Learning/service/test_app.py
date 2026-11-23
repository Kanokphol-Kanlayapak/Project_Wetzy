import unittest
from datetime import date
from unittest.mock import patch

from fastapi import HTTPException
import numpy as np

from service.app import _build_forecasts, get_area, get_forecast, health, list_areas


class StubModel:
    classes_ = np.array([0, 1])

    def predict_proba(self, features: object) -> np.ndarray:
        return np.tile([0.2, 0.8], (len(features), 1))


def forecast_fixture() -> tuple[dict[str, object], list[dict[str, str]]]:
    artifact = {
        "model": StubModel(),
        "feature_columns": [
            "district",
            "rain_next_24h_mm",
            "month_sin",
            "month_cos",
            "doy_sin",
            "doy_cos",
        ],
        "numeric_features": ["rain_next_24h_mm", "month_sin", "month_cos", "doy_sin", "doy_cos"],
        "forecast_horizon_days": 1,
        "selected_model": "Test model",
    }
    row = {
        "date": "2026-11-22",
        "unit_level": "amphoe",
        "district_code": "26738",
        "district": "Bang Khan",
        "lat": "8.0062663233",
        "lon": "99.4891727615",
        "gfs_available": "1.0",
        "gfs_issue_time": "2026-11-22 00:00:00+00:00",
        "gfs_valid_time": "2026-11-25 00:00:00+00:00",
        "forecast_hours": "72.0",
        "rain_next_24h_mm": "3.5",
    }
    return artifact, [row]


class AreaDatasetApiTests(unittest.TestCase):
    def test_area_list_serves_unique_districts_and_historical_observations(self) -> None:
        unavailable = {
            "available": False,
            "reason": "PREDICTION_NOT_CONFIGURED",
            "message": "model unavailable",
        }
        with patch("service.app._forecast_availability", return_value=(None, unavailable)):
            response = list_areas()
        areas = response["areas"]

        self.assertEqual(len(areas), 18)
        self.assertEqual(len({area["id"] for area in areas}), len(areas))
        self.assertTrue(all(area["province"] == "นครศรีธรรมราช" for area in areas))
        self.assertTrue(all(area["observations"]["source"] == "historical_dataset" for area in areas))
        self.assertTrue(all(area["observations"]["recordedAt"] == "2025-12-01" for area in areas))
        self.assertEqual(response["data_period"], {"from": "2020-01-01", "to": "2025-12-01"})
        self.assertEqual(response["forecast_status"], unavailable)
        self.assertTrue(all("prediction" not in area for area in areas))

    def test_area_list_includes_predictions_when_the_model_is_ready(self) -> None:
        prediction = {
            "riskLevel": "สูง",
            "riskProbabilityPercent": 80.0,
            "warning": "ตรวจสอบช่วงเวลา GFS",
            "latitude": 8.0062663,
            "longitude": 99.4891728,
        }
        area = {
            "id": "26738",
            "district": "Bang Khan",
            "province": "นครศรีธรรมราช",
            "observations": {},
        }
        status = {"available": True, "timing_mismatch": True}
        with (
            patch("service.app._get_areas", return_value=([area], "2020-01-01", "2025-12-01")),
            patch(
                "service.app._forecast_availability",
                return_value=({"26738": prediction}, status),
            ),
        ):
            response = list_areas()

        self.assertEqual(response["areas"][0]["prediction"], prediction)
        self.assertEqual(response["areas"][0]["latitude"], 8.0062663)
        self.assertEqual(response["areas"][0]["longitude"], 99.4891728)
        self.assertEqual(response["forecast_status"], status)

    def test_province_filter_uses_dataset_province_values(self) -> None:
        with patch("service.app._forecast_availability", return_value=(None, {"available": False})):
            self.assertEqual(len(list_areas(province="นครศรีธรรมราช")["areas"]), 18)
            self.assertEqual(list_areas(province="unknown province")["areas"], [])

    def test_area_detail_accepts_district_name_and_dataset_code(self) -> None:
        with patch("service.app._forecast_availability", return_value=(None, {"available": False})):
            areas = list_areas()["areas"]
            sample = areas[0]

            self.assertEqual(get_area(sample["district"])["area"]["id"], sample["id"])
            self.assertEqual(get_area(sample["id"])["area"]["district"], sample["district"])

    def test_unknown_district_returns_not_found(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            get_area("not-a-real-district")

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail["code"], "AREA_NOT_FOUND")

    def test_forecast_returns_model_probability_and_gfs_timing_warning(self) -> None:
        artifact, rows = forecast_fixture()
        predictions, status = _build_forecasts(artifact, rows, date(2026, 11, 22))
        forecast = predictions["26738"]

        self.assertEqual(forecast["riskProbabilityPercent"], 80.0)
        self.assertEqual(forecast["forecastDate"], "2026-11-23")
        self.assertEqual(forecast["gfsForecastHours"], 72.0)
        self.assertAlmostEqual(forecast["latitude"], 8.0062663233)
        self.assertAlmostEqual(forecast["longitude"], 99.4891727615)
        self.assertIn("GFS ระบุวัน 2026-11-25", forecast["warning"])
        self.assertTrue(status["timing_mismatch"])

    def test_forecast_keeps_coordinates_for_each_district(self) -> None:
        artifact, rows = forecast_fixture()
        second_row = {
            **rows[0],
            "district_code": "26739",
            "district": "Cha-uat",
            "lat": "7.9569403685",
            "lon": "99.9866249435",
        }

        predictions, _ = _build_forecasts(
            artifact,
            [rows[0], second_row],
            date(2026, 11, 22),
        )

        self.assertAlmostEqual(predictions["26738"]["latitude"], 8.0062663233)
        self.assertAlmostEqual(predictions["26738"]["longitude"], 99.4891727615)
        self.assertAlmostEqual(predictions["26739"]["latitude"], 7.9569403685)
        self.assertAlmostEqual(predictions["26739"]["longitude"], 99.9866249435)

    def test_forecast_rejects_missing_gfs_input(self) -> None:
        artifact, rows = forecast_fixture()
        rows[0]["gfs_available"] = "0.0"

        with self.assertRaisesRegex(ValueError, "GFS inputs are unavailable"):
            _build_forecasts(artifact, rows, date(2026, 11, 22))

    def test_forecast_rejects_invalid_map_coordinates(self) -> None:
        artifact, rows = forecast_fixture()
        rows[0]["lat"] = "95"

        with self.assertRaisesRegex(ValueError, "invalid latitude"):
            _build_forecasts(artifact, rows, date(2026, 11, 22))

    def test_forecast_endpoint_returns_the_model_result(self) -> None:
        forecast = {"riskLevel": "สูง", "riskProbabilityPercent": 80.0}
        with patch("service.app._get_forecast_predictions", return_value=({"26738": forecast}, {})):
            response = get_forecast("26738")

        self.assertEqual(response["forecast"], forecast)
        self.assertEqual(response["source"], "gfs_next_day_model")

    def test_forecast_rejects_an_unknown_area(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            get_forecast("not-a-real-district")

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail["code"], "AREA_NOT_FOUND")

    def test_health_reports_dataset_and_forecast_readiness_separately(self) -> None:
        status = {
            "available": True,
            "input_date": "2026-11-22",
            "forecast_date": "2026-11-23",
            "forecast_count": 18,
            "gfs_valid_dates": ["2026-11-25"],
            "timing_mismatch": True,
        }
        with patch("service.app._forecast_availability", return_value=({}, status)):
            result = health()

        self.assertEqual(result["status"], "degraded")
        self.assertTrue(result["dataset_available"])
        self.assertTrue(result["model_available"])
        self.assertEqual(result["area_count"], 18)
        self.assertTrue(result["forecast"]["timing_mismatch"])


if __name__ == "__main__":
    unittest.main()
