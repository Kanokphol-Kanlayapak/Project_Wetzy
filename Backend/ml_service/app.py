import copy
import datetime
import logging
import math
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ml_service.gee_service import (
    GeeServiceError,
    get_area_data,
    is_area_data_cached,
    is_gee_configured,
    STATIC_FEATURE_COLUMNS,
)


LOGGER = logging.getLogger(__name__)
DEFAULT_MODEL_PATHS = (
    Path(__file__).resolve().parents[2] / "main_model" / "flood_next_day_model.joblib",
    Path(__file__).resolve().with_name("flood_next_day_model.joblib"),
)
MODEL_PATH = Path(os.environ["WETZY_MODEL_PATH"]).expanduser() if os.environ.get(
    "WETZY_MODEL_PATH"
) else next((path for path in DEFAULT_MODEL_PATHS if path.is_file()), DEFAULT_MODEL_PATHS[0])

FEATURE_COLUMNS = [
    "district",
    "rain_next_24h_mm",
    "rain_next_48h_mm",
    "rain_next_72h_mm",
    "up_rain_next_24h_mm",
    "up_rain_next_48h_mm",
    "up_rain_next_72h_mm",
    "temperature_2m",
    "relative_humidity_2m",
    "wind_u_10m",
    "wind_v_10m",
    "month_sin",
    "month_cos",
    "doy_sin",
    "doy_cos",
    "elevation_m",
    "slope_deg",
    "tpi_2km_m",
    "bowl_frac",
    "hand_m",
    "frac_hand_lt5",
    "frac_hand_lt10",
    "twi",
    "clay_pct",
    "sand_pct",
    "lc_tree",
    "lc_crop",
    "impervious_built_frac",
    "lc_water",
    "lc_wetland",
    "lc_mangrove",
    "river_km_per_km2",
    "river_max_cms",
]


class PredictionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    district: Annotated[str, Field(min_length=1, max_length=80)]
    rain_next_24h_mm: float = Field(allow_inf_nan=False)
    rain_next_48h_mm: float = Field(allow_inf_nan=False)
    rain_next_72h_mm: float = Field(allow_inf_nan=False)
    up_rain_next_24h_mm: float = Field(allow_inf_nan=False)
    up_rain_next_48h_mm: float = Field(allow_inf_nan=False)
    up_rain_next_72h_mm: float = Field(allow_inf_nan=False)
    temperature_2m: float = Field(allow_inf_nan=False)
    relative_humidity_2m: float = Field(allow_inf_nan=False)
    wind_u_10m: float = Field(allow_inf_nan=False)
    wind_v_10m: float = Field(allow_inf_nan=False)
    month_sin: float = Field(allow_inf_nan=False)
    month_cos: float = Field(allow_inf_nan=False)
    doy_sin: float = Field(allow_inf_nan=False)
    doy_cos: float = Field(allow_inf_nan=False)
    elevation_m: float = Field(allow_inf_nan=False)
    slope_deg: float = Field(allow_inf_nan=False)
    tpi_2km_m: float = Field(allow_inf_nan=False)
    bowl_frac: float = Field(allow_inf_nan=False)
    hand_m: float = Field(allow_inf_nan=False)
    frac_hand_lt5: float = Field(allow_inf_nan=False)
    frac_hand_lt10: float = Field(allow_inf_nan=False)
    twi: float = Field(allow_inf_nan=False)
    clay_pct: float = Field(allow_inf_nan=False)
    sand_pct: float = Field(allow_inf_nan=False)
    lc_tree: float = Field(allow_inf_nan=False)
    lc_crop: float = Field(allow_inf_nan=False)
    impervious_built_frac: float = Field(allow_inf_nan=False)
    lc_water: float = Field(allow_inf_nan=False)
    lc_wetland: float = Field(allow_inf_nan=False)
    lc_mangrove: float = Field(allow_inf_nan=False)
    river_km_per_km2: float = Field(allow_inf_nan=False)
    river_max_cms: float = Field(allow_inf_nan=False)

    @field_validator("district")
    @classmethod
    def normalize_district(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("district must not be blank")
        return normalized


class ModelRuntime:
    def __init__(self) -> None:
        self.model = None
        self.metadata = None
        self.load_error = None

    def load(self) -> None:
        try:
            artifact = joblib.load(MODEL_PATH)
            if not isinstance(artifact, dict) or not {
                "model",
                "feature_columns",
                "target",
                "forecast_horizon_days",
                "probabilities_calibrated",
                "warning",
            }.issubset(artifact):
                raise ValueError("Model artifact is missing required metadata")

            model = artifact["model"]
            if artifact["feature_columns"] != FEATURE_COLUMNS:
                raise ValueError("Model feature columns do not match the prediction API schema")
            if not hasattr(model, "predict") or not hasattr(model, "predict_proba"):
                raise ValueError("Model artifact does not support class probabilities")
            if 1 not in model.classes_:
                raise ValueError("Model artifact has no flood-positive class")

            self.model = model
            self.metadata = artifact
            self.load_error = None
            LOGGER.info("Loaded flood prediction model from %s", MODEL_PATH)
        except Exception:
            self.model = None
            self.metadata = None
            self.load_error = "MODEL_LOAD_FAILED"
            LOGGER.exception("Could not load flood prediction model from %s", MODEL_PATH)


runtime = ModelRuntime()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    runtime.load()
    yield


app = FastAPI(title="Wetzy Flood Model Service", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def invalid_prediction_input(_request, error: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "code": "INVALID_PREDICTION_INPUT",
                "message": "Prediction input must contain all model features with valid values",
                "fields": [
                    {
                        "field": ".".join(str(part) for part in item["loc"][1:]),
                        "message": item["msg"],
                    }
                    for item in error.errors()
                ],
            },
        },
    )


@app.get("/health")
def health():
    model_available = runtime.model is not None
    return {
        "status": "ready" if model_available else "degraded",
        "dataset_available": is_area_data_cached(),
        "model_available": model_available,
        "model_error": runtime.load_error,
        "gee_project_configured": is_gee_configured(),
        "forecast": {"timing_mismatch": False, "horizon_days": 1},
    }


def _forecast_unavailable(payload, code, message, **details):
    payload["forecast_status"] = {
        "available": False,
        "code": code,
        "message": message,
        **details,
    }
    return payload


def _training_districts():
    estimator = runtime.model.estimator
    category_transformer = estimator.named_steps["preprocess"].named_transformers_["category"]
    encoder = category_transformer.named_steps["onehot"]
    return {str(name) for name in encoder.categories_[0]}


def _risk_level_for_probability(probability_percent):
    if not math.isfinite(probability_percent) or not 0 <= probability_percent <= 100:
        return "ไม่มีข้อมูล"
    if probability_percent < 25:
        return "ต่ำ"
    if probability_percent < 50:
        return "ปานกลาง"
    if probability_percent < 75:
        return "สูง"
    return "สูงมาก"


def _apply_area_predictions(payload):
    static_features = payload.pop("static_features", None)
    if runtime.model is None or runtime.metadata is None:
        return _forecast_unavailable(
            payload,
            "MODEL_NOT_AVAILABLE",
            "The trained flood prediction model is unavailable",
        )

    if static_features is None:
        missing_sources = ["gee_static_features"]
        if not payload.get("upstream_available"):
            missing_sources.append("upstream_boundaries")
        return _forecast_unavailable(
            payload,
            "GEE_STATIC_FEATURES_UNAVAILABLE",
            "Google Earth Engine could not derive the model static features",
            missing_sources=missing_sources,
            source_errors=payload.get("source_errors", {}),
        )

    static_by_gee_name = {
        str(row["gee_district"]).strip().casefold(): row
        for row in static_features
    }
    training_districts = _training_districts()
    static_districts = {str(row["district"]) for row in static_features}
    missing_static_districts = sorted(training_districts - static_districts)
    unknown_static_districts = sorted(static_districts - training_districts)
    if missing_static_districts or unknown_static_districts:
        return _forecast_unavailable(
            payload,
            "STATIC_DISTRICT_COVERAGE_INVALID",
            "The static feature table must contain exactly the districts used by the trained model",
            missing_districts=missing_static_districts,
            unknown_districts=unknown_static_districts,
        )

    target_date = (
        datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=7)
    ).date() + datetime.timedelta(days=1)
    month_angle = 2 * math.pi * target_date.month / 12
    day_angle = 2 * math.pi * target_date.timetuple().tm_yday / 365.25

    prediction_rows = []
    matched_areas = []
    seen_model_districts = set()
    feature_columns = runtime.metadata["feature_columns"]
    for area in payload["areas"]:
        gee_name = str(area["district"]).strip()
        static_row = static_by_gee_name.get(gee_name.casefold())
        if static_row is None:
            continue

        model_district = str(static_row["district"]).strip()
        if model_district not in training_districts:
            continue

        features = dict(area.get("features") or {})
        features.update({
            "district": model_district,
            "month_sin": math.sin(month_angle),
            "month_cos": math.cos(month_angle),
            "doy_sin": math.sin(day_angle),
            "doy_cos": math.cos(day_angle),
        })
        features.update({name: static_row[name] for name in STATIC_FEATURE_COLUMNS})
        prediction_rows.append(features)
        matched_areas.append(area)
        seen_model_districts.add(model_district)

    missing_model_districts = sorted(training_districts - seen_model_districts)
    if missing_model_districts:
        return _forecast_unavailable(
            payload,
            "DISTRICT_MAPPING_INCOMPLETE",
            "Map every trained model district to a feature in the GEE district boundary collection",
            missing_districts=missing_model_districts,
        )
    if not payload.get("upstream_available"):
        return _forecast_unavailable(
            payload,
            "UPSTREAM_FEATURES_UNAVAILABLE",
            "Google Earth Engine could not derive upstream rainfall regions for every district",
            missing_sources=["upstream_boundaries"],
            source_errors=payload.get("source_errors", {}),
        )
    if len(prediction_rows) != len(payload["areas"]):
        return _forecast_unavailable(
            payload,
            "PREDICTION_FEATURES_INCOMPLETE",
            "Not all districts have complete model input features",
        )

    frame = pd.DataFrame(prediction_rows, columns=feature_columns)
    for column in feature_columns:
        if column != "district":
            frame[column] = pd.to_numeric(frame[column], errors="coerce")

    entirely_missing = sorted(
        column for column in feature_columns
        if column != "district" and frame[column].isna().all()
    )
    if entirely_missing:
        return _forecast_unavailable(
            payload,
            "MODEL_FEATURES_EMPTY",
            "At least one required model feature has no values for any district",
            missing_features=entirely_missing,
        )

    try:
        class_probabilities = runtime.model.predict_proba(frame)
        predicted_classes = runtime.model.predict(frame)
        flood_class_index = list(runtime.model.classes_).index(1)
    except Exception as error:
        LOGGER.exception("Area flood prediction failed")
        return _forecast_unavailable(
            payload,
            "MODEL_INFERENCE_FAILED",
            "The trained model could not process the assembled district features",
        )

    provenance = payload.get("feature_provenance") or {}
    validation_metrics = runtime.metadata.get("validation_metrics") or {}
    training_source = runtime.metadata.get("training_source") or {}
    district_gfs_check = training_source.get("district_gfs_api_check") or {}
    probability_validated = (
        provenance.get("static_features_are_training_matched") is True
        and runtime.metadata.get("api_inputs_verified") is True
        and runtime.metadata.get("probabilities_calibrated") is True
        and runtime.metadata.get("validation_passed") is True
        and validation_metrics.get("passed") is True
        and district_gfs_check.get("exact_match") is True
    )
    probability_status = (
        "validated" if probability_validated else "unvalidated_inputs"
    )
    data_quality_warning = provenance.get("warning") or (
        "Input feature provenance has not been validated against the model training data."
    )
    probability_note = (
        runtime.metadata.get("probability_note")
        if probability_validated
        else (
            "เปอร์เซ็นต์นี้เป็นคะแนนจากโมเดลที่ยังไม่ยืนยัน "
            "ไม่ใช่ความน่าจะเป็นน้ำท่วมจริงที่ผ่านการตรวจสอบ"
        )
    )
    payload["areas"] = matched_areas
    for area, predicted_class, probabilities in zip(
        matched_areas,
        predicted_classes,
        class_probabilities,
    ):
        probability_percent = float(probabilities[flood_class_index]) * 100
        area["prediction"] = {
            "predictedClass": int(predicted_class),
            "riskProbabilityPercent": probability_percent,
            "probabilityStatus": probability_status,
            "probabilityNote": probability_note,
            "riskLevel": _risk_level_for_probability(probability_percent),
            "periodLabel": f"พยากรณ์วันที่ {target_date.isoformat()}",
            "warning": runtime.metadata["warning"],
            "gfsIssueTime": area.get("gfs_issue_time"),
            "gfsValidTime": area.get("target_valid_time"),
            "forecastHours": area.get("forecast_hours"),
            "dataQualityWarning": data_quality_warning,
        }

    payload["forecast_status"] = {
        "available": True,
        "target": runtime.metadata["target"],
        "forecast_horizon_days": runtime.metadata["forecast_horizon_days"],
        "gfs_issue_time": payload.get("gfs_issue_time"),
        "gfs_valid_time": payload.get("gfs_valid_time"),
        "forecast_hours": payload.get("forecast_hours"),
        "feature_provenance": payload.get("feature_provenance"),
        "probability_validated": probability_validated,
    }
    return payload


@app.post("/predict")
def predict(request: PredictionInput):
    if runtime.model is None or runtime.metadata is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": runtime.load_error or "MODEL_NOT_AVAILABLE",
                "message": "The trained flood prediction model is unavailable",
            },
        )

    features = pd.DataFrame([request.model_dump()], columns=FEATURE_COLUMNS)
    try:
        predicted_class = int(runtime.model.predict(features)[0])
        class_probabilities = runtime.model.predict_proba(features)[0]
        flood_class_index = list(runtime.model.classes_).index(1)
        flood_probability = float(class_probabilities[flood_class_index])
    except Exception as error:
        LOGGER.exception("Flood prediction failed")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "MODEL_INFERENCE_FAILED",
                "message": "The trained model could not process this input",
            },
        ) from error

    metadata = runtime.metadata
    return {
        "prediction": {
            "target": metadata["target"],
            "predicted_class": predicted_class,
            "flood_probability": flood_probability,
            "forecast_horizon_days": metadata["forecast_horizon_days"],
            "probabilities_calibrated": metadata["probabilities_calibrated"],
            "warning": metadata["warning"],
        },
    }


def _load_areas():
    try:
        return _apply_area_predictions(copy.deepcopy(get_area_data()))
    except GeeServiceError as error:
        raise HTTPException(
            status_code=error.status,
            detail={"code": error.code, "message": str(error)},
        ) from error
    except Exception as error:
        LOGGER.exception("Google Earth Engine area request failed")
        raise HTTPException(
            status_code=502,
            detail={
                "code": "GEE_REQUEST_FAILED",
                "message": "Google Earth Engine could not return district weather data",
            },
        ) from error


@app.get("/areas")
def list_areas():
    return _load_areas()


@app.get("/areas/{district}")
def get_area(district: str):
    payload = _load_areas()
    area = next(
        (
            item for item in payload["areas"]
            if item["id"] == district or item["district"].casefold() == district.casefold()
        ),
        None,
    )
    if area is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "AREA_NOT_FOUND", "message": "District was not found"},
        )
    return {"area": area}


@app.get("/areas/{district}/forecast")
def get_area_forecast(district: str):
    payload = _load_areas()
    if not payload["forecast_status"].get("available"):
        status = 503
        raise HTTPException(
            status_code=status,
            detail={
                "code": payload["forecast_status"]["code"],
                "message": payload["forecast_status"]["message"],
            },
        )
    area = next(
        (
            item for item in payload["areas"]
            if item["id"] == district or item["district"].casefold() == district.casefold()
        ),
        None,
    )
    if area is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "AREA_NOT_FOUND", "message": "District was not found"},
        )
    return {"forecast": area["prediction"]}
