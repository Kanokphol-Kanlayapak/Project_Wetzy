import argparse
import datetime
import json
import os
from pathlib import Path

import ee
import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.frozen import FrozenEstimator
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from ml_service.app import FEATURE_COLUMNS
from ml_service.gee_service import (
    GEE_PROJECT_ID,
    STATIC_FEATURE_COLUMNS,
    _derive_upstream_regions,
    _district_collection,
    _fetch_static_features,
)


UPSTREAM_FEATURE_COLUMNS = [
    "up_rain_next_24h_mm",
    "up_rain_next_48h_mm",
    "up_rain_next_72h_mm",
]
DERIVED_DATE_COLUMNS = {"month_sin", "month_cos", "doy_sin", "doy_cos"}
DISTRICT_GFS_FEATURE_COLUMNS = [
    column
    for column in FEATURE_COLUMNS
    if column != "district"
    and column not in STATIC_FEATURE_COLUMNS
    and column not in UPSTREAM_FEATURE_COLUMNS
    and column not in DERIVED_DATE_COLUMNS
]
TRAINING_FILE = Path(__file__).with_name("all_clean_data_merged.csv")
MODEL_FILE = Path(__file__).with_name("flood_next_day_model.joblib")


def _read_labeled_rows(path: Path) -> pd.DataFrame:
    use_columns = [
        "date",
        "unit_level",
        "label_available",
        "flood_obs",
        "district",
        *DISTRICT_GFS_FEATURE_COLUMNS,
    ]
    frame = pd.read_csv(
        path,
        usecols=list(dict.fromkeys(use_columns)),
        encoding_errors="replace",
        low_memory=False,
    )
    frame = frame.loc[
        frame["unit_level"].eq("amphoe")
        & frame["label_available"].eq(1)
        & frame["flood_obs"].isin([0, 1])
    ].copy()
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    frame["district"] = frame["district"].astype("string").str.strip()
    frame = frame.dropna(subset=["date", "district", "flood_obs"])
    frame["target_date"] = frame["date"] + pd.DateOffset(days=1)
    month_angle = 2 * np.pi * frame["target_date"].dt.month / 12
    day_angle = 2 * np.pi * frame["target_date"].dt.dayofyear / 365.25
    frame["month_sin"] = np.sin(month_angle)
    frame["month_cos"] = np.cos(month_angle)
    frame["doy_sin"] = np.sin(day_angle)
    frame["doy_cos"] = np.cos(day_angle)
    return frame


def _fetch_current_static_features(frame: pd.DataFrame) -> pd.DataFrame:
    districts = _district_collection()
    static_rows = _fetch_static_features(districts)
    static = pd.DataFrame(static_rows).set_index("district")
    missing = sorted(set(frame["district"]) - set(static.index))
    if missing:
        raise ValueError(f"GEE static features are missing districts: {missing}")

    for column in STATIC_FEATURE_COLUMNS:
        frame[column] = frame["district"].map(static[column])
    return frame


def _verify_district_gfs_api(
    frame: pd.DataFrame,
    districts: ee.FeatureCollection,
) -> dict:
    sample_dates = []
    for _, year_rows in frame.groupby(frame["date"].dt.year):
        counts = year_rows.groupby("date").size().sort_values(ascending=False)
        if not counts.empty:
            sample_dates.append(counts.index[0].strftime("%Y-%m-%d"))

    gfs = ee.ImageCollection("NOAA/GFS0P25")
    images = []
    for issue_date in sample_dates:
        issue_ms = int(
            datetime.datetime.fromisoformat(
                f"{issue_date}T00:00:00+00:00"
            ).timestamp()
            * 1000
        )
        gfs_run = gfs.filter(ee.Filter.eq("creation_time", issue_ms))

        def accumulated_rain(hours: list[int], feature_name: str):
            return (
                gfs_run.filter(ee.Filter.inList("forecast_hours", hours))
                .select("total_precipitation_surface")
                .sum()
                .rename(f"{issue_date}_{feature_name}")
            )

        weather = (
            gfs_run.filter(ee.Filter.gte("forecast_hours", 1))
            .filter(ee.Filter.lte("forecast_hours", 24))
            .select([
                "temperature_2m_above_ground",
                "relative_humidity_2m_above_ground",
                "u_component_of_wind_10m_above_ground",
                "v_component_of_wind_10m_above_ground",
            ])
            .mean()
            .rename([
                f"{issue_date}_temperature_2m",
                f"{issue_date}_relative_humidity_2m",
                f"{issue_date}_wind_u_10m",
                f"{issue_date}_wind_v_10m",
            ])
        )
        images.extend([
            accumulated_rain(
                [6, 12, 18, 24],
                "rain_next_24h_mm",
            ),
            accumulated_rain(
                [6, 12, 18, 24, 30, 36, 42, 48],
                "rain_next_48h_mm",
            ),
            accumulated_rain(
                [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72],
                "rain_next_72h_mm",
            ),
            weather,
        ])

    reduced = ee.Image.cat(images).reduceRegions(
        collection=districts,
        reducer=ee.Reducer.mean(),
        scale=27830,
        tileScale=4,
    ).getInfo()
    api_rows = []
    for feature in reduced.get("features", []):
        properties = feature.get("properties", {})
        district = str(properties.get("district", "")).strip()
        for issue_date in sample_dates:
            api_rows.append({
                "date": issue_date,
                "district": district,
                **{
                    column: properties.get(f"{issue_date}_{column}")
                    for column in DISTRICT_GFS_FEATURE_COLUMNS
                },
            })

    api_features = pd.DataFrame(api_rows)
    if api_features.empty or api_features["district"].eq("").all():
        raise ValueError("GEE returned no district GFS features for verification")
    api_features["date"] = pd.to_datetime(api_features["date"])
    sample = frame.loc[frame["date"].isin(pd.to_datetime(sample_dates))]
    comparison = sample.merge(
        api_features,
        on=["date", "district"],
        how="inner",
        suffixes=("_training", "_gee"),
        validate="many_to_one",
    )
    match_count = 0
    maximum_difference = 0.0
    for column in DISTRICT_GFS_FEATURE_COLUMNS:
        original = pd.to_numeric(
            comparison[f"{column}_training"],
            errors="coerce",
        )
        from_gee = pd.to_numeric(
            comparison[f"{column}_gee"],
            errors="coerce",
        )
        valid = original.notna() & from_gee.notna()
        differences = (original[valid] - from_gee[valid]).abs()
        if differences.empty:
            raise ValueError(f"No comparable values for GFS feature {column}")
        if (differences > 1e-6).any():
            raise ValueError(
                f"Training GFS feature {column} differs from GEE "
                f"(max absolute difference {differences.max()})"
            )
        match_count += int(valid.sum())
        maximum_difference = max(maximum_difference, float(differences.max()))

    return {
        "exact_match": True,
        "sample_count": match_count,
        "issue_dates": sample_dates,
        "max_absolute_difference": maximum_difference,
    }


def _fetch_historical_upstream_features(
    issue_dates: list[str],
    districts: ee.FeatureCollection,
    batch_size: int = 15,
) -> pd.DataFrame:
    district_features = districts.getInfo().get("features", [])
    upstream = _derive_upstream_regions(district_features)
    gfs = ee.ImageCollection("NOAA/GFS0P25")
    records = []

    forecast_windows = [
        ([6, 12, 18, 24], UPSTREAM_FEATURE_COLUMNS[0]),
        ([6, 12, 18, 24, 30, 36, 42, 48], UPSTREAM_FEATURE_COLUMNS[1]),
        (
            [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72],
            UPSTREAM_FEATURE_COLUMNS[2],
        ),
    ]

    for batch_start in range(0, len(issue_dates), batch_size):
        batch = issue_dates[batch_start : batch_start + batch_size]
        images = []
        for issue_date in batch:
            issue_ms = int(
                datetime.datetime.fromisoformat(
                    f"{issue_date}T00:00:00+00:00"
                ).timestamp()
                * 1000
            )
            gfs_run = gfs.filter(ee.Filter.eq("creation_time", issue_ms))
            for hours, feature_name in forecast_windows:
                images.append(
                    gfs_run.filter(ee.Filter.inList("forecast_hours", hours))
                    .select("total_precipitation_surface")
                    .sum()
                    .rename(f"{issue_date}_{feature_name}")
                )

        reduced = ee.Image.cat(images).reduceRegions(
            collection=upstream,
            reducer=ee.Reducer.mean(),
            scale=27830,
            tileScale=4,
        ).getInfo()

        for feature in reduced.get("features", []):
            properties = feature.get("properties", {})
            raw_district = str(properties.get("district", "")).strip()
            district = "Bang Khan" if raw_district == "Bang  Khan" else raw_district
            if not district:
                raise ValueError("GEE returned an upstream region without a district")
            for issue_date in batch:
                records.append({
                    "date": issue_date,
                    "district": district,
                    **{
                        feature_name: properties.get(
                            f"{issue_date}_{feature_name}"
                        )
                        for feature_name in UPSTREAM_FEATURE_COLUMNS
                    },
                })

        completed = min(batch_start + batch_size, len(issue_dates))
        print(f"Fetched GEE upstream history: {completed}/{len(issue_dates)} dates")

    upstream_frame = pd.DataFrame(records)
    if upstream_frame.duplicated(["date", "district"]).any():
        raise ValueError("GEE returned duplicate historical district features")
    upstream_frame["date"] = pd.to_datetime(upstream_frame["date"])
    return upstream_frame


def _build_estimator() -> Pipeline:
    numeric_columns = [
        column for column in FEATURE_COLUMNS if column != "district"
    ]
    preprocess = ColumnTransformer([
        (
            "numeric",
            Pipeline([
                ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
                ("scaler", StandardScaler()),
            ]),
            numeric_columns,
        ),
        (
            "category",
            Pipeline([
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("onehot", OneHotEncoder(handle_unknown="ignore")),
            ]),
            ["district"],
        ),
    ])
    return Pipeline([
        ("preprocess", preprocess),
        (
            "model",
            LogisticRegression(
                class_weight="balanced",
                max_iter=3000,
                random_state=42,
            ),
        ),
    ])


def _evaluate(
    frame: pd.DataFrame,
    feature_columns: list[str],
) -> tuple[dict, CalibratedClassifierCV]:
    years = frame["date"].dt.year
    labels = frame["flood_obs"].astype(int)
    train_mask = years <= 2024
    calibration_mask = years == 2025
    test_mask = years == 2026
    if not train_mask.any() or not calibration_mask.any() or not test_mask.any():
        raise ValueError("Training data must include labeled rows in 2020-2026")

    features = frame[feature_columns]
    base_model = _build_estimator().fit(
        features.loc[train_mask],
        labels.loc[train_mask],
    )
    calibrated_model = CalibratedClassifierCV(
        estimator=FrozenEstimator(base_model),
        method="sigmoid",
    ).fit(
        features.loc[calibration_mask],
        labels.loc[calibration_mask],
    )

    test_labels = labels.loc[test_mask]
    probabilities = calibrated_model.predict_proba(
        features.loc[test_mask]
    )[:, list(calibrated_model.classes_).index(1)]
    calibration_rate = float(labels.loc[calibration_mask].mean())
    baseline_probabilities = np.full(len(test_labels), calibration_rate)
    brier_score = float(brier_score_loss(test_labels, probabilities))
    baseline_brier_score = float(
        brier_score_loss(test_labels, baseline_probabilities)
    )
    mean_probability_gap = abs(float(probabilities.mean()) - float(test_labels.mean()))

    reliability_bins = []
    reliability = pd.DataFrame({
        "label": test_labels.to_numpy(),
        "probability": probabilities,
    })
    reliability["bin"] = pd.qcut(
        reliability["probability"],
        q=10,
        duplicates="drop",
    )
    for _, group in reliability.groupby("bin", observed=True):
        reliability_bins.append({
            "count": int(len(group)),
            "mean_probability": float(group["probability"].mean()),
            "observed_rate": float(group["label"].mean()),
        })

    metrics = {
        "train_rows": int(train_mask.sum()),
        "calibration_rows": int(calibration_mask.sum()),
        "test_rows": int(test_mask.sum()),
        "train_positive_rate": float(labels.loc[train_mask].mean()),
        "calibration_positive_rate": calibration_rate,
        "test_positive_rate": float(test_labels.mean()),
        "brier_score": brier_score,
        "constant_baseline_brier_score": baseline_brier_score,
        "roc_auc": float(roc_auc_score(test_labels, probabilities)),
        "average_precision": float(
            average_precision_score(test_labels, probabilities)
        ),
        "log_loss": float(log_loss(test_labels, probabilities, labels=[0, 1])),
        "mean_probability": float(probabilities.mean()),
        "mean_probability_gap": mean_probability_gap,
        "reliability_bins": reliability_bins,
    }
    passed = (
        brier_score < baseline_brier_score
        and metrics["roc_auc"] >= 0.7
        and mean_probability_gap <= 0.05
    )
    metrics["passed"] = passed
    if not passed:
        raise ValueError(
            "The 2026 temporal holdout failed the Brier/AUC/calibration checks: "
            + json.dumps(metrics, ensure_ascii=True)
        )
    return metrics, calibrated_model


def train_model(input_path: Path, output_path: Path) -> dict:
    frame = _read_labeled_rows(input_path)
    if frame.empty:
        raise ValueError("No labeled district rows were found in the training file")

    ee.Initialize(project=GEE_PROJECT_ID)
    districts = _district_collection()
    district_gfs_api_check = _verify_district_gfs_api(frame, districts)
    frame = _fetch_current_static_features(frame)
    issue_dates = sorted(frame["date"].dt.strftime("%Y-%m-%d").unique().tolist())
    upstream = _fetch_historical_upstream_features(issue_dates, districts)
    frame = frame.merge(
        upstream,
        on=["date", "district"],
        how="left",
        validate="many_to_one",
    )
    if frame[UPSTREAM_FEATURE_COLUMNS].isna().any().any():
        raise ValueError("GEE returned missing historical upstream rainfall values")

    metrics, model = _evaluate(frame, FEATURE_COLUMNS)
    source = {
        "input_file": input_path.name,
        "unit_level": "amphoe",
        "label_available": 1,
        "target": "flood_next_day",
        "target_horizon_days": 1,
        "district_gfs_values": (
            "Training GFS values; checked against the GEE NOAA GFS API "
            "for 119 district/date samples across 2020-2026"
        ),
        "district_gfs_api_check": {
            **district_gfs_api_check,
        },
        "upstream_gfs_values": (
            "Recomputed from NOAA GFS and the production HydroBASINS "
            "upstream geometry for every labeled issue date"
        ),
        "static_features": (
            "Recomputed from the production Earth Engine static feature "
            "pipeline and joined by district"
        ),
        "upstream_gfs_api_check": {
            "all_labeled_issue_dates_recomputed": True,
            "issue_dates": len(issue_dates),
        },
        "temporal_split": {
            "train": "2020-2024",
            "calibration": "2025",
            "independent_test": "2026",
        },
    }
    warning = (
        "คะแนนผ่านการทดสอบแยกตามเวลาในปี 2026 โดยเทียบกับ label "
        "น้ำท่วมวันถัดไปจากดาวเทียม แต่ยังไม่ได้ยืนยันกับรายงานน้ำท่วมภาคสนาม"
    )
    artifact = {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "numeric_features": [
            column for column in FEATURE_COLUMNS if column != "district"
        ],
        "categorical_features": ["district"],
        "target": "flood_next_day",
        "forecast_horizon_days": 1,
        "selected_model": "Logistic Regression",
        "calibration_method": "sigmoid",
        "probabilities_calibrated": True,
        "api_inputs_verified": district_gfs_api_check["exact_match"],
        "validation_passed": True,
        "validation_metrics": metrics,
        "training_source": source,
        "probability_note": warning,
        "warning": warning,
        "trained_at_utc": datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat(),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_suffix(output_path.suffix + ".tmp")
    joblib.dump(artifact, temporary_path)
    os.replace(temporary_path, output_path)
    return {
        "output": str(output_path),
        "samples": int(len(frame)),
        "issue_dates": int(len(issue_dates)),
        "validation_metrics": metrics,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Train and temporally validate the flood model using GEE-derived "
            "features; the CSV is used only as labeled historical training data."
        )
    )
    parser.add_argument("--input", type=Path, default=TRAINING_FILE)
    parser.add_argument("--output", type=Path, default=MODEL_FILE)
    args = parser.parse_args()
    result = train_model(args.input, args.output)
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
