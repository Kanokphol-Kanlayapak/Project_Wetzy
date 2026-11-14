function readConfig() {
  const port = Number(process.env.PORT || 3000);
  const mlServiceTimeoutMs = Number(process.env.ML_SERVICE_TIMEOUT_MS || 5000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  if (!Number.isInteger(mlServiceTimeoutMs) || mlServiceTimeoutMs < 1) {
    throw new Error('ML_SERVICE_TIMEOUT_MS must be a positive integer');
  }

  const corsOrigins = (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port,
    corsOrigins,
    mlServiceUrl: (process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
    mlServiceTimeoutMs,
  };
}

module.exports = { readConfig };
