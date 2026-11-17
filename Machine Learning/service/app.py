import csv
import math
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException

app = FastAPI(title="Wetzy Machine Learning API")

DATASET_PATH = (
    Path(__file__).resolve().parents[1]
    / "merge_dataset"
    / "NST_merged_clean_data_2020_2025.csv"
)
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

    return {
        "status": "degraded",
        "dataset_available": True,
        "model_available": False,
        "area_count": len(areas),
        "data_period": {"from": first_date, "to": last_date},
        "reason": "trained_model_artifact_missing",
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

    return {
        "areas": areas,
        "source": "historical_dataset",
        "data_period": {"from": first_date, "to": last_date},
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

    return {
        "area": area,
        "source": "historical_dataset",
        "data_period": {"from": first_date, "to": last_date},
    }


@app.get("/areas/{district}/forecast")
def get_forecast(district: str) -> None:
    areas, _, _ = _get_areas()
    if not _find_area(areas, district):
        raise HTTPException(
            status_code=404,
            detail={
                "code": "AREA_NOT_FOUND",
                "message": "No area with this district name or code exists in the dataset",
            },
        )

    raise HTTPException(
        status_code=503,
        detail={
            "code": "PREDICTION_NOT_CONFIGURED",
            "message": (
                "No trained model artifact is available. The dataset contains historical "
                "observations, not a future flood prediction."
            ),
        },
    )
