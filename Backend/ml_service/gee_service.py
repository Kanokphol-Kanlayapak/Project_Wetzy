import datetime
import logging
import os
import threading
import time
from pathlib import Path

import ee
from dotenv import load_dotenv


LOGGER = logging.getLogger(__name__)
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

GEE_PROJECT_ID = (
    os.environ.get("GEE_PROJECT_ID") or "hybrid-heaven-515215-h0"
).strip()
GEE_DISTRICT_COLLECTION = os.environ.get(
    "GEE_DISTRICT_COLLECTION",
    "FAO/GAUL/2015/level2",
).strip()
GEE_PROVINCE_NAME = os.environ.get("GEE_PROVINCE_NAME", "Nakhon Si Thammarat").strip()
GEE_UPSTREAM_COLLECTION = (os.environ.get("GEE_UPSTREAM_COLLECTION") or "").strip()
GEE_HYBASINS_COLLECTION = "WWF/HydroSHEDS/v1/Basins/hybas_12"
GEE_RIVERS_COLLECTION = "WWF/HydroSHEDS/v1/FreeFlowingRivers"
AREA_CACHE_SECONDS = 30 * 60
STATIC_FEATURE_COLUMNS = [
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

_initialize_lock = threading.Lock()
_initialized_project = None
_area_cache_lock = threading.Lock()
_area_cache = None
_area_cache_expires_at = 0.0


class GeeServiceError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code


def _initialize_gee() -> None:
    global _initialized_project

    if not GEE_PROJECT_ID:
        raise GeeServiceError(503, "GEE_PROJECT_NOT_CONFIGURED", "Set GEE_PROJECT_ID in Backend/.env")

    if _initialized_project == GEE_PROJECT_ID:
        return

    with _initialize_lock:
        if _initialized_project == GEE_PROJECT_ID:
            return
        try:
            ee.Initialize(project=GEE_PROJECT_ID)
        except Exception as error:
            LOGGER.exception("Google Earth Engine initialization failed")
            raise GeeServiceError(
                503,
                "GEE_AUTHENTICATION_FAILED",
                "Earth Engine authentication failed; run `earthengine authenticate` and verify project access",
            ) from error
        _initialized_project = GEE_PROJECT_ID


def is_gee_configured() -> bool:
    return bool(GEE_PROJECT_ID and GEE_DISTRICT_COLLECTION and GEE_PROVINCE_NAME)


def _milliseconds_to_iso(milliseconds: float) -> str:
    return datetime.datetime.fromtimestamp(
        milliseconds / 1000,
        tz=datetime.timezone.utc,
    ).isoformat()


def _number_or_none(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _parse_static_features(result):
    rows = []
    seen_districts = set()
    seen_gee_districts = set()
    for feature in result.get("features", []):
        properties = feature.get("properties", {})
        district = str(properties.get("district") or "").strip()
        gee_district = str(properties.get("gee_district") or district).strip()
        if not district or not gee_district:
            raise GeeServiceError(
                503,
                "GEE_STATIC_FEATURES_SCHEMA_INVALID",
                "Every static feature must include `district` and `gee_district` properties",
            )
        if district in seen_districts or gee_district.casefold() in seen_gee_districts:
            raise GeeServiceError(
                503,
                "GEE_STATIC_FEATURES_SCHEMA_INVALID",
                "The static feature collection must map each model and GEE district once",
            )
        row = {"district": district, "gee_district": gee_district}
        seen_districts.add(district)
        seen_gee_districts.add(gee_district.casefold())
        missing_columns = []
        for column in STATIC_FEATURE_COLUMNS:
            value = _number_or_none(properties.get(column))
            if value is None:
                missing_columns.append(column)
            row[column] = value
        if missing_columns:
            raise GeeServiceError(
                503,
                "GEE_STATIC_FEATURES_SCHEMA_INVALID",
                f"Static feature for {district} is missing numeric properties: {', '.join(missing_columns)}",
            )
        rows.append(row)

    if not rows:
        raise GeeServiceError(
            503,
            "GEE_STATIC_FEATURES_EMPTY",
            "The Earth Engine static feature collection returned no features",
        )
    return rows


def _static_feature_image():
    dem = ee.Image("USGS/SRTMGL1_003").select("elevation")
    slope = ee.Terrain.slope(dem)
    tpi = dem.subtract(
        dem.focalMean(radius=2000, kernelType="circle", units="meters")
    )
    merit_hydro = ee.Image("MERIT/Hydro/v1_0_1")
    hand = merit_hydro.select("hnd")
    upstream_area = merit_hydro.select("upa")
    slope_tangent = slope.multiply(3.141592653589793 / 180).tan().max(0.001)
    twi = upstream_area.multiply(1000000).divide(90).divide(slope_tangent).log()
    clay = ee.Image(
        "OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02"
    ).select("b0")
    sand = ee.Image(
        "OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02"
    ).select("b0")
    landcover = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
    return ee.Image.cat([
        dem.rename("elevation_m"),
        slope.rename("slope_deg"),
        tpi.rename("tpi_2km_m"),
        tpi.lt(0).rename("bowl_frac"),
        hand.rename("hand_m"),
        hand.lt(5).rename("frac_hand_lt5"),
        hand.lt(10).rename("frac_hand_lt10"),
        twi.rename("twi"),
        clay.rename("clay_pct"),
        sand.rename("sand_pct"),
        landcover.eq(10).rename("lc_tree"),
        landcover.eq(40).rename("lc_crop"),
        landcover.eq(50).rename("impervious_built_frac"),
        landcover.eq(80).rename("lc_water"),
        landcover.eq(90).rename("lc_wetland"),
        landcover.eq(95).rename("lc_mangrove"),
    ])


def _add_river_features(district, rivers):
    geometry = district.geometry()
    local_rivers = rivers.filterBounds(geometry).map(
        lambda river: river.set(
            "segment_km",
            river.geometry().intersection(geometry, 100).length(100).divide(1000),
        )
    )
    river_length_km = ee.Number(ee.Algorithms.If(
        local_rivers.size().gt(0),
        local_rivers.aggregate_sum("segment_km"),
        0,
    ))
    max_average_discharge = ee.Algorithms.If(
        local_rivers.size().gt(0),
        local_rivers.aggregate_max("DIS_AV_CMS"),
        0,
    )
    return district.set({
        "river_km_per_km2": river_length_km.divide(geometry.area(100).divide(1000000)),
        "river_max_cms": max_average_discharge,
    })


def _fetch_static_features(districts):
    try:
        rivers = ee.FeatureCollection(GEE_RIVERS_COLLECTION)
        regions = districts.map(
            lambda district: _add_river_features(district, rivers)
        )
        result = _static_feature_image().reduceRegions(
            collection=regions,
            reducer=ee.Reducer.mean(),
            scale=250,
            tileScale=4,
        ).getInfo()
        return _parse_static_features(result)
    except GeeServiceError:
        raise
    except Exception as error:
        LOGGER.exception("Could not derive static model features from Earth Engine")
        raise GeeServiceError(
            503,
            "GEE_STATIC_FEATURES_UNAVAILABLE",
            "Could not derive static model features from public Earth Engine datasets",
        ) from error


def _derive_upstream_regions(district_features):
    try:
        districts = ee.FeatureCollection(district_features)
        region = districts.geometry().buffer(500000)
        basins = ee.FeatureCollection(GEE_HYBASINS_COLLECTION)
        regional_basins = basins.filterBounds(region)
        links = regional_basins.reduceColumns(
            ee.Reducer.toList(2),
            ["HYBAS_ID", "NEXT_DOWN"],
        ).get("list").getInfo()
        district_basin_features = districts.map(
            lambda district: ee.Feature(
                None,
                {
                    "gee_district": district.get("gee_district"),
                    "basin_ids": basins.filterBounds(
                        district.geometry()
                    ).aggregate_array("HYBAS_ID"),
                },
            )
        ).getInfo().get("features", [])
        basin_ids_by_district = {
            str(feature["properties"]["gee_district"]): {
                int(basin_id) for basin_id in feature["properties"]["basin_ids"]
            }
            for feature in district_basin_features
        }

        downstream_by_basin = {
            int(basin_id): int(downstream_id or 0)
            for basin_id, downstream_id in links
        }
        upstream_by_downstream = {}
        for basin_id, downstream_id in downstream_by_basin.items():
            if downstream_id:
                upstream_by_downstream.setdefault(downstream_id, set()).add(basin_id)

        upstream_features = []
        for district in district_features:
            properties = district.get("properties", {})
            gee_district = str(properties.get("gee_district") or "").strip()
            inside_ids = basin_ids_by_district.get(gee_district, set())
            outlet_ids = {
                basin_id
                for basin_id in inside_ids
                if downstream_by_basin.get(basin_id, 0) not in inside_ids
            }
            if not gee_district or not outlet_ids:
                raise GeeServiceError(
                    503,
                    "GEE_UPSTREAM_DELINEATION_FAILED",
                    f"Could not identify HydroBASINS outlets for {gee_district or 'a district'}",
                )

            basin_ids = set(outlet_ids)
            frontier = set(outlet_ids)
            while frontier:
                candidates = set()
                for downstream_id in frontier:
                    candidates.update(
                        upstream_by_downstream.get(downstream_id, set())
                    )
                frontier = candidates.difference(basin_ids)
                basin_ids.update(frontier)

            catchment = basins.filter(
                ee.Filter.inList("HYBAS_ID", sorted(basin_ids))
            ).geometry(100)
            upstream_features.append(
                ee.Feature(catchment, {"district": gee_district})
            )
        return ee.FeatureCollection(upstream_features)
    except GeeServiceError:
        raise
    except Exception as error:
        LOGGER.exception("Could not derive upstream regions from HydroBASINS")
        raise GeeServiceError(
            503,
            "GEE_UPSTREAM_DELINEATION_FAILED",
            "Could not derive district upstream regions from the HydroBASINS network",
        ) from error


def _district_collection():
    def prepare_district(feature):
        gee_name = ee.String(feature.get("ADM2_NAME"))
        model_name = ee.Algorithms.If(
            ee.Algorithms.IsEqual(gee_name, "Bang  Khan"),
            "Bang Khan",
            gee_name,
        )
        return feature.set({
            "district": model_name,
            "gee_district": gee_name,
            "district_centroid": feature.geometry().centroid(1000).coordinates(),
        })

    return (
        ee.FeatureCollection(GEE_DISTRICT_COLLECTION)
        .filter(ee.Filter.eq("ADM0_NAME", "Thailand"))
        .filter(ee.Filter.eq("ADM1_NAME", GEE_PROVINCE_NAME))
        .map(prepare_district)
    )


def _fetch_area_data():
    _initialize_gee()
    now = datetime.datetime.now(datetime.timezone.utc)
    now_ms = int(now.timestamp() * 1000)
    earliest_issue_ms = now_ms - 36 * 60 * 60 * 1000

    districts = _district_collection()
    district_features = districts.getInfo().get("features", [])
    if not district_features:
        raise GeeServiceError(
            503,
            "GEE_DISTRICTS_NOT_FOUND",
            f"No district boundaries found for {GEE_PROVINCE_NAME}",
        )

    gfs = ee.ImageCollection("NOAA/GFS0P25")
    complete_issues = (
        gfs.filter(ee.Filter.gte("creation_time", earliest_issue_ms))
        .filter(ee.Filter.lte("creation_time", now_ms))
        .filter(ee.Filter.eq("forecast_hours", 72))
        .sort("creation_time", False)
    )
    if complete_issues.size().getInfo() == 0:
        raise GeeServiceError(
            503,
            "GEE_GFS_FORECAST_UNAVAILABLE",
            "No GFS forecast cycle with data through 72 hours was found in the last 36 hours",
        )

    latest_complete_issue = complete_issues.first()
    issue_ms = latest_complete_issue.get("creation_time").getInfo()

    gfs_run = gfs.filter(ee.Filter.eq("creation_time", issue_ms))

    def accumulated_rain(hours, output_band):
        return (
            gfs_run.filter(ee.Filter.inList("forecast_hours", hours))
            .select("total_precipitation_surface")
            .sum()
            .rename(output_band)
        )

    rain_24h = accumulated_rain([6, 12, 18, 24], "rain_next_24h_mm")
    rain_48h = accumulated_rain([6, 12, 18, 24, 30, 36, 42, 48], "rain_next_48h_mm")
    rain_72h = accumulated_rain(
        [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72],
        "rain_next_72h_mm",
    )
    weather_24h = (
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
            "temperature_2m",
            "relative_humidity_2m",
            "wind_u_10m",
            "wind_v_10m",
        ])
    )

    district_image = ee.Image.cat([rain_24h, rain_48h, rain_72h, weather_24h])
    results = district_image.reduceRegions(
        collection=districts,
        reducer=ee.Reducer.mean(),
        scale=27830,
        tileScale=4,
    ).getInfo()

    issue_time = _milliseconds_to_iso(float(issue_ms))
    target_valid_time = _milliseconds_to_iso(float(issue_ms) + 24 * 60 * 60 * 1000)
    gfs_valid_time = _milliseconds_to_iso(float(issue_ms) + 72 * 60 * 60 * 1000)

    upstream_rain = {}
    upstream_error = None
    try:
        if GEE_UPSTREAM_COLLECTION:
            upstream_regions = ee.FeatureCollection(GEE_UPSTREAM_COLLECTION)
        else:
            upstream_regions = _derive_upstream_regions(district_features)
        upstream_image = ee.Image.cat([
            rain_24h.rename("up_rain_next_24h_mm"),
            rain_48h.rename("up_rain_next_48h_mm"),
            rain_72h.rename("up_rain_next_72h_mm"),
        ])
        upstream_results = upstream_image.reduceRegions(
            collection=upstream_regions,
            reducer=ee.Reducer.mean(),
            scale=27830,
            tileScale=4,
        ).getInfo()
        for feature in upstream_results.get("features", []):
            properties = feature.get("properties", {})
            district = str(properties.get("district", "")).strip()
            if not district:
                raise GeeServiceError(
                    503,
                    "GEE_UPSTREAM_SCHEMA_INVALID",
                    "Every upstream feature must include a `district` property",
                )
            upstream_rain[district] = {
                name: _number_or_none(properties.get(name))
                for name in (
                    "up_rain_next_24h_mm",
                    "up_rain_next_48h_mm",
                    "up_rain_next_72h_mm",
                )
            }
    except GeeServiceError as error:
        LOGGER.warning("Upstream rainfall features are unavailable: %s", error)
        upstream_error = {"code": error.code, "message": str(error)}

    try:
        static_features = _fetch_static_features(districts)
    except GeeServiceError as error:
        LOGGER.warning("Static model features are unavailable: %s", error)
        static_features = None
        static_error = {"code": error.code, "message": str(error)}
    else:
        static_error = None

    areas = []
    for feature in results.get("features", []):
        properties = feature.get("properties", {})
        district_name = properties.get("ADM2_NAME") or properties.get("gee_district")
        model_district = properties.get("district")
        district_code = properties.get("ADM2_CODE") or district_name
        centroid = properties.get("district_centroid")
        if not district_name:
            continue

        features = {
            "district": model_district or district_name,
            "rain_next_24h_mm": _number_or_none(properties.get("rain_next_24h_mm")),
            "rain_next_48h_mm": _number_or_none(properties.get("rain_next_48h_mm")),
            "rain_next_72h_mm": _number_or_none(properties.get("rain_next_72h_mm")),
            "temperature_2m": _number_or_none(properties.get("temperature_2m")),
            "relative_humidity_2m": _number_or_none(properties.get("relative_humidity_2m")),
            "wind_u_10m": _number_or_none(properties.get("wind_u_10m")),
            "wind_v_10m": _number_or_none(properties.get("wind_v_10m")),
            "up_rain_next_24h_mm": None,
            "up_rain_next_48h_mm": None,
            "up_rain_next_72h_mm": None,
        }
        features.update(upstream_rain.get(str(district_name), {}))

        areas.append({
            "id": str(district_code),
            "district": district_name,
            "province": properties.get("ADM1_NAME", GEE_PROVINCE_NAME),
            "latitude": _number_or_none(centroid[1]) if isinstance(centroid, list) and len(centroid) > 1 else None,
            "longitude": _number_or_none(centroid[0]) if isinstance(centroid, list) and len(centroid) > 1 else None,
            "features": features,
            "gfs_issue_time": issue_time,
            "gfs_valid_time": gfs_valid_time,
            "forecast_hours": 72,
            "target_valid_time": target_valid_time,
            "weatherForecast": {
                "source": "NOAA GFS via Google Earth Engine",
                "issueTime": issue_time,
                "validTime": target_valid_time,
                "temperature2mC": _number_or_none(properties.get("temperature_2m")),
                "relativeHumidity2mPercent": _number_or_none(properties.get("relative_humidity_2m")),
                "windU10mMs": _number_or_none(properties.get("wind_u_10m")),
                "windV10mMs": _number_or_none(properties.get("wind_v_10m")),
                "rainNext24hMm": _number_or_none(properties.get("rain_next_24h_mm")),
                "rainNext48hMm": _number_or_none(properties.get("rain_next_48h_mm")),
                "rainNext72hMm": _number_or_none(properties.get("rain_next_72h_mm")),
            },
        })

    if not areas:
        raise GeeServiceError(
            503,
            "GEE_DISTRICT_REDUCTION_EMPTY",
            "Earth Engine returned no district results",
        )

    areas.sort(key=lambda area: area["district"])
    static_features_available = static_features is not None
    required_upstream_fields = (
        "up_rain_next_24h_mm",
        "up_rain_next_48h_mm",
        "up_rain_next_72h_mm",
    )
    upstream_available = bool(areas) and all(
        area["features"][name] is not None
        for area in areas
        for name in required_upstream_fields
    )
    missing_sources = []
    if not static_features_available:
        missing_sources.append("gee_static_features")
    if not upstream_available:
        missing_sources.append("upstream_boundaries")
    return {
        "areas": areas,
        "static_features": static_features,
        "source_errors": {
            source: error
            for source, error in (
                ("gee_static_features", static_error),
                ("upstream_boundaries", upstream_error),
            )
            if error is not None
        },
        "forecast_status": {
            "available": False,
            "code": "PREDICTION_FEATURES_INCOMPLETE",
            "message": "GFS data is available; static model features or upstream rainfall could not be derived",
            "missing_sources": missing_sources,
        },
        "upstream_available": upstream_available,
        "feature_provenance": {
            "static_features": "SRTM, MERIT Hydro, OpenLandMap, ESA WorldCover, and HydroSHEDS via Earth Engine",
            "upstream_rain": (
                "HydroBASINS level 12 downstream-network traversal"
                if not GEE_UPSTREAM_COLLECTION
                else "Configured Earth Engine upstream FeatureCollection"
            ),
            "static_features_are_proxies": True,
            "static_features_are_training_matched": True,
            "warning": (
                "ฟีเจอร์ GEE ใช้ pipeline เดียวกับตอนฝึกและผ่านการทดสอบย้อนหลัง "
                "โดยเทียบกับ label จากดาวเทียม แต่ยังไม่ได้ยืนยันกับรายงานน้ำท่วมภาคสนาม"
            ),
        },
        "data_source": "Google Earth Engine: FAO GAUL 2015, NOAA GFS, and public terrain/hydrography datasets",
        "gfs_issue_time": issue_time,
        "gfs_valid_time": gfs_valid_time,
        "forecast_hours": 72,
    }


def get_area_data():
    global _area_cache, _area_cache_expires_at

    if _area_cache is not None and time.monotonic() < _area_cache_expires_at:
        return _area_cache

    with _area_cache_lock:
        if _area_cache is not None and time.monotonic() < _area_cache_expires_at:
            return _area_cache
        data = _fetch_area_data()
        _area_cache = data
        _area_cache_expires_at = time.monotonic() + AREA_CACHE_SECONDS
        return data


def is_area_data_cached() -> bool:
    return _area_cache is not None and time.monotonic() < _area_cache_expires_at
