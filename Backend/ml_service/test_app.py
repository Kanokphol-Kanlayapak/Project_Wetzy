import json
import math
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from ml_service.app import (
    FEATURE_COLUMNS,
    _risk_level_for_probability,
    _training_districts,
    app,
)
from ml_service.gee_service import (
    GeeServiceError,
    STATIC_FEATURE_COLUMNS,
    _parse_static_features,
)


def sample_features():
    return {
        column: "test-district" if column == "district" else 0
        for column in FEATURE_COLUMNS
    }


class ModelServiceTests(unittest.TestCase):
    def test_risk_level_uses_probability_ranges_and_inclusive_lower_bounds(self):
        cases = [
            (0, "ต่ำ"),
            (24.9, "ต่ำ"),
            (25, "ปานกลาง"),
            (49.9, "ปานกลาง"),
            (50, "สูง"),
            (74.9, "สูง"),
            (75, "สูงมาก"),
            (100, "สูงมาก"),
        ]

        for probability, expected in cases:
            with self.subTest(probability=probability):
                self.assertEqual(_risk_level_for_probability(probability), expected)

    def test_risk_level_rejects_out_of_range_or_non_finite_scores(self):
        for probability in (-0.1, 100.1, float("nan"), float("inf")):
            with self.subTest(probability=probability):
                self.assertEqual(_risk_level_for_probability(probability), "ไม่มีข้อมูล")

    def test_static_features_are_fetched_from_earth_engine(self):
        properties = {
            "district": "Bang Khan",
            "gee_district": "Bang  Khan",
            **{column: 1 for column in STATIC_FEATURE_COLUMNS},
        }
        rows = _parse_static_features({
            "features": [{"properties": properties}],
        })

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["district"], "Bang Khan")
        self.assertEqual(rows[0]["gee_district"], "Bang  Khan")

    def test_static_feature_collection_rejects_missing_model_features(self):
        properties = {
            "district": "Bang Khan",
            "gee_district": "Bang Khan",
            **{column: 1 for column in STATIC_FEATURE_COLUMNS if column != "hand_m"},
        }
        with self.assertRaises(GeeServiceError) as context:
            _parse_static_features({
                "features": [{"properties": properties}],
            })

        self.assertEqual(context.exception.code, "GEE_STATIC_FEATURES_SCHEMA_INVALID")

    def test_health_reports_model_ready_without_area_datasets(self):
        with TestClient(app) as client:
            response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ready")
        self.assertTrue(response.json()["model_available"])
        self.assertFalse(response.json()["dataset_available"])

    def test_prediction_uses_trained_model_and_returns_probability(self):
        with TestClient(app) as client:
            response = client.post("/predict", json=sample_features())

        self.assertEqual(response.status_code, 200)
        prediction = response.json()["prediction"]
        self.assertEqual(prediction["target"], "flood_next_day")
        self.assertIn(prediction["predicted_class"], [0, 1])
        self.assertTrue(math.isfinite(prediction["flood_probability"]))
        self.assertGreaterEqual(prediction["flood_probability"], 0)
        self.assertLessEqual(prediction["flood_probability"], 1)
        self.assertTrue(prediction["probabilities_calibrated"])

    def test_prediction_rejects_missing_or_non_finite_features(self):
        missing_feature = sample_features()
        del missing_feature["rain_next_24h_mm"]
        non_finite_feature = sample_features()
        non_finite_feature["rain_next_24h_mm"] = float("nan")

        with TestClient(app) as client:
            missing_response = client.post("/predict", json=missing_feature)
            non_finite_response = client.post(
                "/predict",
                content=json.dumps(non_finite_feature, allow_nan=True),
                headers={"content-type": "application/json"},
            )

        self.assertEqual(missing_response.status_code, 422)
        self.assertEqual(non_finite_response.status_code, 422)

    @patch("ml_service.app.get_area_data")
    def test_area_list_returns_google_earth_engine_data(self, get_area_data):
        area = {
            "id": "123",
            "district": "Test District",
            "province": "Test Province",
            "latitude": 8.4,
            "longitude": 99.9,
            "weatherForecast": {"rainNext24hMm": 12.5},
        }
        get_area_data.return_value = {
            "areas": [area],
            "forecast_status": {
                "available": False,
                "code": "PREDICTION_FEATURES_INCOMPLETE",
                "message": "Static features are not configured",
            },
            "data_source": "Google Earth Engine",
        }

        with TestClient(app) as client:
            response = client.get("/areas")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["areas"], [area])
        self.assertFalse(response.json()["forecast_status"]["available"])
        get_area_data.assert_called_once_with()

    @patch("ml_service.app.get_area_data")
    def test_area_detail_accepts_district_name_or_code(self, get_area_data):
        area = {"id": "123", "district": "Test District"}
        get_area_data.return_value = {"areas": [area]}

        with TestClient(app) as client:
            by_code = client.get("/areas/123")
            by_name = client.get("/areas/test%20district")

        self.assertEqual(by_code.json(), {"area": area})
        self.assertEqual(by_name.json(), {"area": area})

    @patch("ml_service.app.get_area_data")
    def test_area_forecast_reports_missing_static_features(self, get_area_data):
        get_area_data.return_value = {"areas": []}

        with TestClient(app) as client:
            response = client.get("/areas/123/forecast")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "GEE_STATIC_FEATURES_UNAVAILABLE")

    @patch("ml_service.app.get_area_data")
    def test_area_list_predicts_when_all_model_features_are_available(
        self,
        get_area_data,
    ):
        with TestClient(app) as client:
            districts = sorted(_training_districts())
            areas = []
            static_rows = []
            for index, district in enumerate(districts):
                areas.append({
                    "id": str(index),
                    "district": district,
                    "features": {
                        "district": district,
                        "rain_next_24h_mm": 1,
                        "rain_next_48h_mm": 2,
                        "rain_next_72h_mm": 3,
                        "up_rain_next_24h_mm": 1,
                        "up_rain_next_48h_mm": 2,
                        "up_rain_next_72h_mm": 3,
                        "temperature_2m": 29,
                        "relative_humidity_2m": 80,
                        "wind_u_10m": 1,
                        "wind_v_10m": -1,
                    },
                })
                static_rows.append({
                    "district": district,
                    "gee_district": district,
                    **{column: 0 for column in STATIC_FEATURE_COLUMNS},
                })
            get_area_data.return_value = {
                "areas": areas,
                "static_features": static_rows,
                "gfs_issue_time": "2026-11-24T00:00:00+00:00",
                "gfs_valid_time": "2026-11-27T00:00:00+00:00",
                "forecast_hours": 72,
                "upstream_available": True,
                "feature_provenance": {
                    "static_features_are_proxies": True,
                    "static_features_are_training_matched": False,
                    "warning": "Approximate static features",
                },
            }
            response = client.get("/areas")
            get_area_data.return_value["feature_provenance"] = {
                "static_features_are_proxies": False,
                "static_features_are_training_matched": True,
            }
            validated_response = client.get("/areas")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["forecast_status"]["available"])
        self.assertFalse(payload["forecast_status"]["probability_validated"])
        self.assertEqual(len(payload["areas"]), len(districts))
        for area in payload["areas"]:
            self.assertIn("prediction", area)
            prediction = area["prediction"]
            probability = prediction["riskProbabilityPercent"]
            self.assertTrue(math.isfinite(probability))
            self.assertGreaterEqual(probability, 0)
            self.assertLessEqual(probability, 100)
            self.assertEqual(prediction["riskLevel"], _risk_level_for_probability(probability))
            self.assertEqual(prediction["probabilityStatus"], "unvalidated_inputs")
            self.assertIn("คะแนนจากโมเดล", prediction["probabilityNote"])
            self.assertEqual(prediction["dataQualityWarning"], "Approximate static features")

        self.assertTrue(validated_response.json()["forecast_status"]["probability_validated"])
        for area in validated_response.json()["areas"]:
            probability = area["prediction"]["riskProbabilityPercent"]
            self.assertTrue(math.isfinite(probability))
            self.assertGreaterEqual(probability, 0)
            self.assertLessEqual(probability, 100)
            self.assertEqual(
                area["prediction"]["riskLevel"],
                _risk_level_for_probability(probability),
            )
            self.assertIn("label", area["prediction"]["probabilityNote"])

    @patch("ml_service.app.get_area_data")
    def test_area_list_surfaces_earth_engine_auth_errors(self, get_area_data):
        from ml_service.gee_service import GeeServiceError

        get_area_data.side_effect = GeeServiceError(
            503,
            "GEE_AUTHENTICATION_FAILED",
            "Earth Engine authentication failed",
        )

        with TestClient(app) as client:
            response = client.get("/areas")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "GEE_AUTHENTICATION_FAILED")


if __name__ == "__main__":
    unittest.main()
