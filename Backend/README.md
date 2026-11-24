# Wetzy Backend

The Express API connects the mobile app to MongoDB and the Python Machine Learning service. MongoDB access is server-side only; flood predictions continue to be provided by the existing ML service.

## Configure MongoDB and staff authentication

1. Install dependencies and create a local environment file:

   ```powershell
   cd Backend
   npm install
   Copy-Item .env.example .env
   ```

2. Edit `.env`:
   - Set `MONGODB_URI` to your MongoDB connection string. The existing local database is case-sensitive `Wetzy_DB`; the Backend maps to its `User`, `Flood_predictions`, and `Notifications` collections and creates `system_logs` only if missing. It does not copy, overwrite, or delete account or prediction documents.
   - Set `JWT_SECRET` to a unique random value of at least 32 characters. For example:

     ```powershell
     $bytes = New-Object byte[] 48
     [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
     [Convert]::ToBase64String($bytes)
     ```

   - To provision the initial superadmin, set all three `INITIAL_SUPER_ADMIN_USERNAME`, `INITIAL_SUPER_ADMIN_EMAIL`, and `INITIAL_SUPER_ADMIN_PASSWORD` values. Use a password with at least 12 characters. On startup, the account is created only if that username/email is not already present. Do not commit `.env`.

3. Start the Backend:

   ```powershell
   npm run dev
   ```

MongoDB connection or configuration failures stop startup and are reported in the Backend console. `GET /health` reports MongoDB connectivity and the existing ML service status. No sample account or prediction data is generated.

## Staff API

- `POST /api/auth/staff/login` — authenticate with `{ "identifier": "username-or-email", "password": "..." }`. Only active `admin` and `superadmin` accounts are accepted.
- `GET /api/auth/staff/me` — return the authenticated staff account.
- `POST /api/auth/staff/logout` — invalidate the account's existing JWTs and record the logout.
- `POST /api/auth/staff/users` — superadmin-only creation of an active admin account; requires username, email, and a password of at least 12 characters.
- `GET /api/auth/users` — list users (admins see only general users).
- `PATCH /api/auth/users/:userId/role` — superadmin-only role changes.
- `PATCH /api/auth/users/:userId/status` — activate/deactivate an account (admins cannot change superadmin status).

Login failures use the same response for unknown, inactive, non-staff, or incorrect-password accounts. Login/logout events are written to `system_logs`; passwords and tokens are never logged or returned. Protected routes validate the JWT, current account status, role, and token version against MongoDB on each request. Signing out invalidates active JWTs for that account.

For example, after signing in as superadmin, create an admin using `POST /api/auth/staff/users` with a Bearer token and JSON body:

```json
{
  "username": "wetzy-admin",
  "email": "admin@example.com",
  "password": "use-a-unique-password-of-at-least-12-characters"
}
```

There is no general-user login or registration endpoint in this staff authentication flow.

## Mobile app

Set `EXPO_PUBLIC_API_URL` in `Mobile App/.env` to the reachable Backend URL ending in `/api`. For a physical device, use the development computer's LAN address instead of `localhost`.

```powershell
cd "Mobile App"
npm install
Copy-Item .env.example .env
# Set EXPO_PUBLIC_API_URL in .env
npm start
```

Use the Wetzy profile tab to open staff login. Native clients store the JWT with Expo SecureStore; web builds keep it in session storage. The profile validates an existing token with the Backend and clears invalid or expired sessions.

## Google Earth Engine and model service

The FastAPI service uses local Earth Engine credentials and the configured Cloud project to load Nakhon Si Thammarat district boundaries and NOAA GFS data. Set or override `GEE_PROJECT_ID`, `GEE_DISTRICT_COLLECTION`, and `GEE_PROVINCE_NAME` in `Backend/.env`. The default project ID is `hybrid-heaven-515215-h0`; never put credential files or private keys in the repository.

Authenticate once on the development machine if Earth Engine credentials are not already configured:

```powershell
cd Backend
.\.venv\Scripts\python.exe -c "import ee; ee.Authenticate()"
```

The Google account must have Earth Engine access and permission to use the configured Cloud project. Start the ML API in a separate PowerShell terminal from `Backend`:

```powershell
cd Backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml_service\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn ml_service.app:app --host 127.0.0.1 --port 8000
```

The service loads `main_model/flood_next_day_model.joblib` from the repository root, and falls back to `Backend/ml_service/flood_next_day_model.joblib` if the root copy is absent. Set `WETZY_MODEL_PATH` in `Backend/.env` to override both locations.

`GET /areas` queries the public `FAO/GAUL/2015/level2` boundaries and the latest complete 72-hour `NOAA/GFS0P25` forecast run. It sums the GFS six-hour precipitation accumulations to derive 24-, 48-, and 72-hour rain totals, and caches the result for 30 minutes. The first cold request can take over a minute while Earth Engine computes the district, terrain, and catchment reductions; `ML_SERVICE_TIMEOUT_MS` defaults to 120 seconds for this request. Each area response includes the model's GFS features and issue/valid-time metadata. GAUL 2015 is deprecated by its publisher and is used here as the initial integration dataset; replace it with an approved district boundary asset before production if required.

The `flood_next_day_model.joblib` artifact requires exactly 33 inputs: `district`, the six GFS rain totals (district and upstream), four GFS weather values, four cyclical date values generated by the Backend for the target day, and 18 static terrain/soil/land-cover/river features. `flood_obs`, historical rainfall, soil moisture, pressure, and sea level are not inputs to this artifact. Do not fetch them as model features unless the model is retrained with a matching schema.

All model inputs are obtained through the Earth Engine API; the service does not read feature CSV files. Static features are computed by reducing public SRTM, MERIT Hydro, OpenLandMap, ESA WorldCover, and HydroSHEDS datasets over each district. The service derives upstream regions by following the HydroBASINS level-12 `NEXT_DOWN` network from basins draining out of each district. Set `GEE_UPSTREAM_COLLECTION` only when supplying a custom, training-matched upstream FeatureCollection with a `district` property matching the district boundary names; otherwise the HydroBASINS derivation is used.

The public-data static-feature definitions are operational proxies for terrain and land cover, not direct measurements of flood conditions. The active model is trained with the same GEE feature pipeline used at inference. Historical district GFS features were checked against Earth Engine on seven dates across 2020-2026 (all 833 comparable values matched within floating-point tolerance), and upstream GFS features were recomputed from Earth Engine for all 478 labeled issue dates. The model passed a chronological 2026 holdout against satellite-derived next-day labels; those labels have not been independently verified against field flood reports. The API includes a `feature_provenance.warning` and each prediction includes `probabilityNote` to state this limitation. If the artifact or feature provenance has not passed validation, `probabilityStatus` remains `unvalidated_inputs`; the app still displays the numeric model score and keeps unvalidated map areas neutral gray.

Run `.\.venv\Scripts\python.exe -m ml_service.train_model` from `Backend` to rebuild the artifact from labeled district rows. The training command fetches current static features and reconstructs historical upstream GFS inputs from Earth Engine, then uses a chronological split (train through 2024, calibrate on 2025, test on 2026). It saves only if the held-out Brier score beats the calibration-rate baseline, ROC AUC is at least 0.7, and mean probability is within five percentage points of the observed rate. The CSV is used only for offline training; the running API continues to get current forecast inputs from GEE. Probability warnings remain because labels are satellite-derived, not independent field observations.

`GET /api/areas/:district` returns the GEE weather data and, when all required features are configured, its model prediction. `GET /api/areas/:district/forecast` returns that prediction. `POST /api/predictions` continues to accept one complete feature row directly.

```json
{
  "district": "Example District",
  "rain_next_24h_mm": 12.5,
  "rain_next_48h_mm": 25,
  "rain_next_72h_mm": 37.5,
  "up_rain_next_24h_mm": 8,
  "up_rain_next_48h_mm": 16,
  "up_rain_next_72h_mm": 24,
  "temperature_2m": 29,
  "relative_humidity_2m": 80,
  "wind_u_10m": 1.2,
  "wind_v_10m": -0.5,
  "month_sin": 0.5,
  "month_cos": 0.866,
  "doy_sin": 0.2,
  "doy_cos": 0.98,
  "elevation_m": 10,
  "slope_deg": 2,
  "tpi_2km_m": 0,
  "bowl_frac": 0.1,
  "hand_m": 3,
  "frac_hand_lt5": 0.7,
  "frac_hand_lt10": 0.9,
  "twi": 5,
  "clay_pct": 20,
  "sand_pct": 40,
  "lc_tree": 0.2,
  "lc_crop": 0.3,
  "impervious_built_frac": 0.1,
  "lc_water": 0.05,
  "lc_wetland": 0.05,
  "lc_mangrove": 0,
  "river_km_per_km2": 1.5,
  "river_max_cms": 100
}
```

The response contains the predicted class and calibrated probability for `flood_next_day`. Probabilities are calibrated against satellite-observed labels and are not verified flood warnings. If GEE cannot derive a required feature or upstream catchment, `GET /api/areas` returns live GFS area data with predictions marked unavailable and a source error; do not treat an input row as current conditions.

## Checks

From `Backend`:

```powershell
npm test
npm run check
```

Run the model service tests from `Backend`:

```powershell
py -m unittest ml_service.test_app
```
