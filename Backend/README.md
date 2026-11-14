# Wetzy Backend

The Express API is a gateway between the mobile app and the Python Machine Learning service. It does not contain prediction data or calculate risk.

## Run

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Set `EXPO_PUBLIC_API_URL` in `Mobile App/.env` to the reachable backend URL ending in `/api`. For a physical device, use the development computer's LAN address instead of `localhost`.

## Endpoints

- `GET /health` — backend status and Python service/model readiness.
- `GET /api/areas` — forwards the Python service's area list.
- `GET /api/areas/:district` — forwards an area's available details.
- `GET /api/areas/:district/forecast` — forwards the area's forecast.

All responses are JSON. Upstream errors and unavailable-service responses remain explicit; the API does not fall back to sample data.

The Python API currently reports that prediction data is unavailable. The repository has no exported trained-model artifact or deployed prediction API, so forecast endpoints return `503` until those are provided and integrated.

When the Python service is implemented, `/areas` must return `{ "areas": [...] }`. Each area needs an `id` and `district`; `province`, `name`, `short`, `latitude`, `longitude`, `prediction`, and `observations` may be included when real data exists. The mobile app reads optional `prediction.riskLevel`, `prediction.riskProbabilityPercent`, `prediction.periodLabel`, and `observations.rainfallMm`, `observations.waterLevelM`, and `observations.floodHistory`. Detail and forecast endpoints must return `{ "area": {...} }` and `{ "forecast": {...} }`, respectively. These are transport/UI fields only; they do not define or transform model features.

## Python service

From `Machine Learning/service`, install `requirements.txt` in the Python service's own environment and run `uvicorn app:app --host 0.0.0.0 --port 8000`. The scaffold only reports readiness and unavailable endpoints; it does not load or run a model.

## Checks

```powershell
npm test
npm run check
```
