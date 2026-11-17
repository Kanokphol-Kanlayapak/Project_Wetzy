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

## ML area data and forecast service

The Backend proxies the existing FastAPI routes. From the repository root, start the ML API in a separate PowerShell terminal:

```powershell
cd "Machine Learning"
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r service\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn service.app:app --host 0.0.0.0 --port 8000 --reload
```

`GET http://127.0.0.1:8000/health` reports dataset and model readiness. `GET /areas` returns the 18 districts in `Machine Learning/merge_dataset/NST_merged_clean_data_2020_2025.csv`, with the latest observed monthly flood status and weather/water measurements. These are historical observations, not current alerts or model predictions. `GET /areas?province=<name>` filters by a province present in the dataset. `GET /areas/:district` accepts a district name or dataset code. The Node API exposes these as `GET /api/areas`, `GET /api/areas?province=<name>`, and `GET /api/areas/:district`.

The existing model notebook selects Random Forest but does not save a deployable artifact, and `service/requirements.txt` contains only the API server dependencies. Therefore `GET /areas/:district/forecast` continues to return an explicit `503 PREDICTION_NOT_CONFIGURED`; the service does not fabricate a prediction or change the notebook's training process.

## Checks

From `Backend`:

```powershell
npm test
npm run check
```

Run the ML dataset API tests from `Machine Learning`:

```powershell
py -m unittest service.test_app
```
