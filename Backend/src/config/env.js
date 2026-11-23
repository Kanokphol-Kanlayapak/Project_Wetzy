function readConfig() {
  const port = Number(process.env.PORT || 3000);
  const mlServiceTimeoutMs = Number(process.env.ML_SERVICE_TIMEOUT_MS || 15000);

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

  const mongoUri = (process.env.MONGODB_URI || '').trim();
  const jwtSecret = process.env.JWT_SECRET || '';

  if (!mongoUri) {
    throw new Error('MONGODB_URI must be set to connect to MongoDB');
  }

  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  const seedUsername = (process.env.INITIAL_SUPER_ADMIN_USERNAME || '').trim();
  const seedEmail = (process.env.INITIAL_SUPER_ADMIN_EMAIL || '').trim();
  const seedPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD || '';
  const hasSeedCredentials = [seedUsername, seedEmail, seedPassword].some(Boolean);

  if (hasSeedCredentials && (!seedUsername || !seedEmail || seedPassword.length < 12)) {
    throw new Error('Set all INITIAL_SUPER_ADMIN credentials and use a password of at least 12 characters');
  }

  return {
    port,
    corsOrigins,
    mlServiceUrl: (process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
    mlServiceTimeoutMs,
    mongoUri,
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    initialSuperAdmin: {
      username: seedUsername,
      email: seedEmail,
      password: seedPassword,
    },
  };
}

module.exports = { readConfig };
