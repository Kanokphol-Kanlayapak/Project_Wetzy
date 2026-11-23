import csv
import math
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
import joblib
import numpy as np
import pandas as pd

app = FastAPI(title="Wetzy Machine Learning API")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATASET_PATH = (
    PROJECT_ROOT / "merge_dataset" / "NST_merged_clean_data_2020_2025.csv"
)
FORECAST_DATASET_PATH = PROJECT_ROOT / "merge_dataset" / "all_clean_data_merged.csv"
MODEL_PATH = PROJECT_ROOT / "main_model" / "flood_next_day_model.joblib"
EXPECTED_DISTRICTS = 18
REQUIRED_COLUMNS = {
    "province",
    "district",
    "district_code",
    "month_start",
    "flooded",
    "flood_status",
    "flood_events_month",
    "monthly_rain_total_mm",
    "monthly_rain_daily_max_mm",
    "river_mean_depth_m_weighted",
}
DERIVED_FEATURES = {"month_sin", "month_cos", "doy_sin", "doy_cos"}


@lru_cache(maxsize=1)
def load_dataset() -> tuple[list[dict[str, str]], str, str]:
    if not DATASET_PATH.is_file():
        raise FileNotFoundError(f"Dataset not found: {DATASET_PATH}")

    with DATASET_PATH.open(encoding="utf-8-sig", newline="") as dataset_file:
        reader = csv.DictReader(dataset_file)
        missing_columns = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise ValueError(f"Dataset is missing required columns: {missing}")

        rows = list(reader)

    if not rows:
        raise ValueError("Dataset contains no records")

    for row in rows:
        if not row["province"] or not row["district"] or not row["district_code"]:
            raise ValueError("Dataset contains a record without province or district identifiers")
        if row["flooded"] not in {"0", "1"}:
            raise ValueError("Dataset contains an invalid flooded value")
        if not row["month_start"]:
            raise ValueError("Dataset contains a record without a month_start date")

    dates = [row["month_start"][:10] for row in rows]
    return rows, min(dates), max(dates)


def _number(row: dict[str, str], field: str) -> float | None:
    value = row.get(field, "")
    if not value:
        return None

    try:
        parsed = float(value)
    except ValueError:
        return None

    return parsed if math.isfinite(parsed) else None


def _format_area(district_rows: list[dict[str, str]]) -> dict[str, object]:
    ordered_rows = sorted(district_rows, key=lambda row: row["month_start"])
    latest = ordered_rows[-1]
    flooded_months = sum(row["flooded"] == "1" for row in ordered_rows)
    flood_events = sum(_number(row, "flood_events_month") or 0 for row in ordered_rows)

    return {
        "id": latest["district_code"],
        "name": latest["district"],
        "district": latest["district"],
        "province": latest["province"],
        "observations": {
            "recordedAt": latest["month_start"][:10],
            "source": "historical_dataset",
            "flooded": latest["flooded"] == "1",
            "floodStatus": latest["flood_status"],
            "rainfallMm": _number(latest, "monthly_rain_total_mm"),
            "rainfallDailyMaxMm": _number(latest, "monthly_rain_daily_max_mm"),
            "waterLevelM": _number(latest, "river_mean_depth_m_weighted"),
            "floodHistory": flooded_months,
            "floodEvents": flood_events,
            "historyPeriod": "2020-2025",
        },
    }


def _dataset_unavailable(error: OSError | ValueError) -> HTTPException:
    message = (
        "Required area dataset file was not found"
        if isinstance(error, FileNotFoundError)
        else f"Area dataset is invalid: {error}"
    )
    return HTTPException(
        status_code=503,
        detail={
            "code": "AREA_DATASET_UNAVAILABLE",
            "message": message,
        },
    )


def _get_areas() -> tuple[list[dict[str, object]], str, str]:
    try:
        rows, first_date, last_date = load_dataset()
    except (OSError, ValueError) as error:
        raise _dataset_unavailable(error) from error

    grouped: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        grouped.setdefault(row["district_code"], []).append(row)

    areas = sorted(
        (_format_area(district_rows) for district_rows in grouped.values()),
        key=lambda area: (str(area["province"]), str(area["district"]).casefold()),
    )
    return areas, first_date, last_date


@lru_cache(maxsize=1)
def _load_model_artifact() -> dict[str, object]:
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Trained model artifact not found: {MODEL_PATH}")

    artifact = joblib.load(MODEL_PATH)
    if not isinstance(artifact, dict):
        raise ValueError("Model artifact must be a dictionary")

    feature_columns = artifact.get("feature_columns")
    model = artifact.get("model")
    if (
        not isinstance(feature_columns, list)
        or not feature_columns
        or not all(isinstance(column, str) for column in feature_columns)
    ):
        raise ValueError("Model artifact has no valid feature_columns")
    if not callable(getattr(model, "predict_proba", None)):
        raise ValueError("Model artifact does not provide predict_proba")
    if artifact.get("forecast_horizon_days") != 1:
        raise ValueError("Model artifact must predict a one-day horizon")
    if artifact.get("probabilities_calibrated") is not True:
        raise ValueError("Model artifact probabilities are not calibrated")

    return artifact


@lru_cache(maxsize=1)
def _load_latest_forecast_rows() -> tuple[list[dict[str, str]], date]:
    if not FORECAST_DATASET_PATH.is_file():
        raise FileNotFoundError(f"Forecast input dataset not found: {FORECAST_DATASET_PATH}")

    latest_date: date | None = None
    latest_rows: dict[str, dict[str, str]] = {}
    with FORECAST_DATASET_PATH.open(encoding="utf-8-sig", newline="") as dataset_file:
        reader = csv.DictReader(dataset_file)
        required = {
            "date",
            "unit_level",
            "district_code",
            "district",
            "lat",
            "lon",
            "gfs_available",
            "gfs_issue_time",
            "gfs_valid_time",
            "forecast_hours",
        }
        missing_columns = required - set(reader.fieldnames or [])
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise ValueError(f"Forecast input dataset is missing required columns: {missing}")

        for row in reader:
            if row["unit_level"] != "amphoe":
                continue
            try:
                row_date = date.fromisoformat(row["date"][:10])
            except ValueError as error:
                raise ValueError("Forecast input dataset contains an invalid date") from error

            district_code = row["district_code"].strip()
            if not district_code or not row["district"].strip():
                raise ValueError("Forecast input dataset contains an area without an identifier")

            if latest_date is None or row_date > latest_date:
                latest_date = row_date
                latest_rows = {district_code: row}
            elif row_date == latest_date:
                if district_code in latest_rows:
                    raise ValueError("Forecast input dataset has duplicate latest district rows")
                latest_rows[district_code] = row

    if latest_date is None:
        raise ValueError("Forecast input dataset has no district rows")
    if len(latest_rows) != EXPECTED_DISTRICTS:
        raise ValueError(
            f"Latest forecast input date has {len(latest_rows)} districts; "
            f"expected {EXPECTED_DISTRICTS}"
        )

    return sorted(latest_rows.values(), key=lambda row: row["district"]), latest_date


def _parse_utc_timestamp(value: str, field: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"Forecast input dataset contains an invalid {field}") from error
    if parsed.tzinfo is None:
        raise ValueError(f"Forecast input dataset {field} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _build_forecasts(
    artifact: dict[str, object],
    input_rows: list[dict[str, str]],
    input_date: date,
) -> tuple[dict[str, dict[str, object]], dict[str, object]]:
    feature_columns = artifact["feature_columns"]
    numeric_features = artifact.get("numeric_features")
    if not isinstance(numeric_features, list) or not all(
        isinstance(column, str) for column in numeric_features
    ):
        raise ValueError("Model artifact has no valid numeric_features")

    source_features = set(feature_columns) - DERIVED_FEATURES
    if not source_features.issubset(input_rows[0]):
        missing = ", ".join(sorted(source_features - set(input_rows[0])))
        raise ValueError(f"Forecast input dataset is missing model features: {missing}")

    model = artifact["model"]
    feature_rows: list[dict[str, object]] = []
    model_rows: list[dict[str, str]] = []
    valid_times: set[datetime] = set()
    forecast_hours_by_district: dict[str, float] = {}
    coordinates_by_district: dict[str, tuple[float, float]] = {}

    for row in input_rows:
        district_code = row["district_code"].strip()
        if row["date"][:10] != input_date.isoformat():
            raise ValueError("Latest forecast input rows do not share the same date")

        try:
            gfs_available = float(row["gfs_available"])
            forecast_hours = float(row["forecast_hours"])
        except ValueError as error:
            raise ValueError("Forecast input dataset has invalid GFS availability metadata") from error
        if gfs_available != 1 or not math.isfinite(forecast_hours):
            raise ValueError(f"Latest GFS inputs are unavailable for district {district_code}")

        issue_time = _parse_utc_timestamp(row["gfs_issue_time"], "gfs_issue_time")
        valid_time = _parse_utc_timestamp(row["gfs_valid_time"], "gfs_valid_time")
        if issue_time.date() > input_date:
            raise ValueError(f"GFS issue time is after the input date for district {district_code}")
        latitude = _number(row, "lat")
        longitude = _number(row, "lon")
        if latitude is None or not -90 <= latitude <= 90:
            raise ValueError(f"Forecast input has an invalid latitude for district {district_code}")
        if longitude is None or not -180 <= longitude <= 180:
            raise ValueError(f"Forecast input has an invalid longitude for district {district_code}")
        valid_times.add(valid_time)
        forecast_hours_by_district[district_code] = forecast_hours
        coordinates_by_district[district_code] = (latitude, longitude)

        row_date = date.fromisoformat(row["date"][:10])
        day_of_year = row_date.timetuple().tm_yday
        values: dict[str, object] = {}
        for column in feature_columns:
            if column == "month_sin":
                values[column] = math.sin(2 * math.pi * row_date.month / 12)
            elif column == "month_cos":
                values[column] = math.cos(2 * math.pi * row_date.month / 12)
            elif column == "doy_sin":
                values[column] = math.sin(2 * math.pi * day_of_year / 365.25)
            elif column == "doy_cos":
                values[column] = math.cos(2 * math.pi * day_of_year / 365.25)
            elif column in numeric_features:
                raw_value = row.get(column, "").strip()
                if not raw_value:
                    values[column] = np.nan
                else:
                    try:
                        numeric_value = float(raw_value)
                    except ValueError as error:
                        raise ValueError(f"Forecast feature {column} is not numeric") from error
                    values[column] = numeric_value if math.isfinite(numeric_value) else np.nan
            else:
                values[column] = row[column]
        feature_rows.append(values)
        model_rows.append(row)

    features = pd.DataFrame(feature_rows, columns=feature_columns)
    probabilities = np.asarray(model.predict_proba(features))
    classes = list(getattr(model, "classes_", []))
    if probabilities.ndim != 2 or probabilities.shape[0] != len(input_rows) or 1 not in classes:
        raise ValueError("Model returned an invalid flood probability response")
    flood_probability_index = classes.index(1)
    flood_probabilities = probabilities[:, flood_probability_index]
    if not np.isfinite(flood_probabilities).all() or (
        (flood_probabilities < 0) | (flood_probabilities > 1)
    ).any():
        raise ValueError("Model returned probabilities outside the 0 to 1 range")

    forecast_date = input_date + timedelta(days=artifact["forecast_horizon_days"])
    timing_mismatch = any(valid_time.date() != forecast_date for valid_time in valid_times)
    warning = (
        "ผลนี้เป็นค่าประเมินจากแบบจำลองที่เรียนรู้จากข้อมูลดาวเทียม "
        "ไม่ใช่การยืนยันน้ำท่วมหรือประกาศเตือนภัย"
    )
    if timing_mismatch:
        valid_dates = ", ".join(sorted({value.date().isoformat() for value in valid_times}))
        warning += (
            f" วันเป้าหมายของโมเดลคือ {forecast_date.isoformat()} "
            f"แต่ข้อมูล GFS ระบุวัน {valid_dates} "
            "ควรตรวจสอบช่วงเวลาก่อนนำผลไปใช้จริง"
        )

    forecasts: dict[str, dict[str, object]] = {}
    for row, probability in zip(model_rows, flood_probabilities):
        probability_percent = round(float(probability) * 100, 1)
        if probability < 0.25:
            risk_level = "ต่ำ"
        elif probability < 0.5:
            risk_level = "ปานกลาง"
        elif probability < 0.75:
            risk_level = "สูง"
        else:
            risk_level = "สูงมาก"

        district_code = row["district_code"].strip()
        valid_time = _parse_utc_timestamp(row["gfs_valid_time"], "gfs_valid_time")
        latitude, longitude = coordinates_by_district[district_code]
        forecasts[district_code] = {
            "riskLevel": risk_level,
            "riskProbabilityPercent": probability_percent,
            "probabilityNoFloodPercent": round(100 - probability_percent, 1),
            "periodLabel": (
                f"เป้าหมาย {forecast_date.isoformat()} · "
                f"GFS valid {valid_time.date().isoformat()}"
            ),
            "forecastDate": forecast_date.isoformat(),
            "inputDate": input_date.isoformat(),
            "gfsValidTime": valid_time.isoformat(),
            "gfsForecastHours": forecast_hours_by_district[district_code],
            "latitude": latitude,
            "longitude": longitude,
            "modelName": artifact.get("selected_model", "unknown"),
            "source": "gfs_next_day_model",
            "warning": warning,
        }

    return forecasts, {
        "input_date": input_date.isoformat(),
        "forecast_date": forecast_date.isoformat(),
        "forecast_count": len(forecasts),
        "gfs_valid_dates": sorted({value.date().isoformat() for value in valid_times}),
        "timing_mismatch": timing_mismatch,
    }


@lru_cache(maxsize=1)
def _get_forecast_predictions() -> tuple[dict[str, dict[str, object]], dict[str, object]]:
    artifact = _load_model_artifact()
    input_rows, input_date = _load_latest_forecast_rows()
    return _build_forecasts(artifact, input_rows, input_date)


def _forecast_availability() -> tuple[
    dict[str, dict[str, object]] | None,
    dict[str, object],
]:
    try:
        forecasts, status = _get_forecast_predictions()
    except (OSError, ImportError, TypeError, ValueError) as error:
        return None, {
            "available": False,
            "reason": "PREDICTION_NOT_CONFIGURED",
            "message": str(error),
        }

    return forecasts, {"available": True, **status}


def _prediction_unavailable(error: OSError | ImportError | TypeError | ValueError) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={
            "code": "PREDICTION_NOT_CONFIGURED",
            "message": f"Forecast model or its latest GFS inputs are unavailable: {error}",
        },
    )


@app.get("/health")
def health() -> dict[str, object]:
    try:
        areas, first_date, last_date = _get_areas()
    except HTTPException as error:
        return {
            "status": "not_ready",
            "dataset_available": False,
            "model_available": False,
            "reason": error.detail["code"],
        }

    forecasts, forecast_status = _forecast_availability()
    if forecasts is None:
        return {
            "status": "degraded",
            "dataset_available": True,
            "model_available": False,
            "area_count": len(areas),
            "data_period": {"from": first_date, "to": last_date},
            "reason": forecast_status["reason"],
            "detail": forecast_status["message"],
        }

    timing_mismatch = forecast_status["timing_mismatch"]
    return {
        "status": "degraded" if timing_mismatch else "ready",
        "dataset_available": True,
        "model_available": True,
        "area_count": len(areas),
        "data_period": {"from": first_date, "to": last_date},
        "forecast": {
            key: value for key, value in forecast_status.items() if key != "available"
        },
        "reason": (
            "gfs_valid_time_does_not_match_forecast_horizon"
            if timing_mismatch
            else None
        ),
    }


@app.get("/areas")
def list_areas(province: str | None = None) -> dict[str, object]:
    areas, first_date, last_date = _get_areas()
    if province:
        normalized_province = province.strip().casefold()
        areas = [
            area for area in areas
            if str(area["province"]).casefold() == normalized_province
        ]

    forecasts, forecast_status = _forecast_availability()
    if forecasts is not None:
        missing_predictions = [
            str(area["id"]) for area in areas if str(area["id"]) not in forecasts
        ]
        if missing_predictions:
            forecasts = None
            forecast_status = {
                "available": False,
                "reason": "FORECAST_AREA_MISMATCH",
                "message": "The historical and forecast datasets contain different districts",
            }
        else:
            for area in areas:
                prediction = forecasts[str(area["id"])]
                area["latitude"] = prediction["latitude"]
                area["longitude"] = prediction["longitude"]
                area["prediction"] = prediction

    return {
        "areas": areas,
        "source": "historical_dataset",
        "data_period": {"from": first_date, "to": last_date},
        "forecast_status": forecast_status,
    }


def _find_area(areas: list[dict[str, object]], district: str) -> dict[str, object] | None:
    normalized_district = district.strip().casefold()
    return next(
        (
            candidate for candidate in areas
            if normalized_district in {
                str(candidate["district"]).casefold(),
                str(candidate["id"]).casefold(),
            }
        ),
        None,
    )


@app.get("/areas/{district}")
def get_area(district: str) -> dict[str, object]:
    areas, first_date, last_date = _get_areas()
    area = _find_area(areas, district)
    if not area:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "AREA_NOT_FOUND",
                "message": "No area with this district name or code exists in the dataset",
            },
        )

    forecasts, forecast_status = _forecast_availability()
    if forecasts is not None:
        forecast = forecasts.get(str(area["id"]))
        if forecast is None:
            forecast_status = {
                "available": False,
                "reason": "FORECAST_AREA_MISMATCH",
                "message": "The historical and forecast datasets contain different districts",
            }
        else:
            area["latitude"] = forecast["latitude"]
            area["longitude"] = forecast["longitude"]
            area["prediction"] = forecast

    return {
        "area": area,
        "source": "historical_dataset",
        "data_period": {"from": first_date, "to": last_date},
        "forecast_status": forecast_status,
    }


@app.get("/areas/{district}/forecast")
def get_forecast(district: str) -> dict[str, object]:
    areas, first_date, last_date = _get_areas()
    if not _find_area(areas, district):
        raise HTTPException(
            status_code=404,
            detail={
                "code": "AREA_NOT_FOUND",
                "message": "No area with this district name or code exists in the dataset",
            },
        )

    try:
        forecasts, _ = _get_forecast_predictions()
    except (OSError, ImportError, TypeError, ValueError) as error:
        raise _prediction_unavailable(error) from error

    area = _find_area(areas, district)
    forecast = forecasts.get(str(area["id"]))
    if forecast is None:
        raise _prediction_unavailable(
            ValueError(f"No forecast input exists for district {area['id']}")
        )

    return {
        "forecast": forecast,
        "source": "gfs_next_day_model",
        "data_period": {"from": first_date, "to": last_date},
    }
