import unittest

from fastapi import HTTPException

from service.app import get_area, get_forecast, health, list_areas


class AreaDatasetApiTests(unittest.TestCase):
    def test_area_list_serves_unique_districts_and_historical_observations(self) -> None:
        response = list_areas()
        areas = response["areas"]

        self.assertEqual(len(areas), 18)
        self.assertEqual(len({area["id"] for area in areas}), len(areas))
        self.assertTrue(all(area["province"] == "นครศรีธรรมราช" for area in areas))
        self.assertTrue(all(area["observations"]["source"] == "historical_dataset" for area in areas))
        self.assertTrue(all(area["observations"]["recordedAt"] == "2025-12-01" for area in areas))
        self.assertTrue(all("prediction" not in area for area in areas))
        self.assertEqual(response["data_period"], {"from": "2020-01-01", "to": "2025-12-01"})

    def test_province_filter_uses_dataset_province_values(self) -> None:
        self.assertEqual(len(list_areas(province="นครศรีธรรมราช")["areas"]), 18)
        self.assertEqual(list_areas(province="unknown province")["areas"], [])

    def test_area_detail_accepts_district_name_and_dataset_code(self) -> None:
        areas = list_areas()["areas"]
        sample = areas[0]

        self.assertEqual(get_area(sample["district"])["area"]["id"], sample["id"])
        self.assertEqual(get_area(sample["id"])["area"]["district"], sample["district"])

    def test_unknown_district_returns_not_found(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            get_area("not-a-real-district")

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail["code"], "AREA_NOT_FOUND")

    def test_forecast_does_not_claim_historical_data_is_a_prediction(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            get_forecast("26738")

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(raised.exception.detail["code"], "PREDICTION_NOT_CONFIGURED")

    def test_forecast_rejects_an_unknown_area(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            get_forecast("not-a-real-district")

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail["code"], "AREA_NOT_FOUND")

    def test_health_reports_real_dataset_and_missing_model_separately(self) -> None:
        result = health()

        self.assertTrue(result["dataset_available"])
        self.assertFalse(result["model_available"])
        self.assertEqual(result["area_count"], 18)


if __name__ == "__main__":
    unittest.main()
