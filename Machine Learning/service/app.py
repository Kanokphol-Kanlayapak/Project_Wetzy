from fastapi import FastAPI, HTTPException

app = FastAPI(title="Wetzy Machine Learning API")


def unavailable(code: str, message: str) -> None:
    raise HTTPException(
        status_code=503,
        detail={"code": code, "message": message},
    )


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "not_ready",
        "model_available": False,
        "reason": "trained_model_artifact_missing",
    }


@app.get("/areas")
def list_areas() -> None:
    unavailable(
        "AREA_DATA_UNAVAILABLE",
        "No deployed area-data API is configured",
    )


@app.get("/areas/{district}")
def get_area(district: str) -> None:
    unavailable(
        "AREA_DATA_UNAVAILABLE",
        "No deployed area-data API is configured",
    )


@app.get("/areas/{district}/forecast")
def get_forecast(district: str) -> None:
    unavailable(
        "PREDICTION_NOT_CONFIGURED",
        "No trained-model artifact or prediction API is configured",
    )
