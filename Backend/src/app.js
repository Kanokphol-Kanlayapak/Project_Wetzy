const cors = require('cors');
const express = require('express');
const { getMlServiceStatus } = require('./services/ml-service');
const { createApiRouter } = require('./routes/api');
const { createAuthRouter } = require('./routes/auth');
const { createNotificationRouter } = require('./routes/notifications');
const { createAdminRouter } = require('./routes/admin');
const { createAuthService } = require('./services/auth-service');
const mongoose = require('mongoose');

function createApp(config = {}, options = {}) {
  const normalizedConfig = {
    corsOrigins: Array.isArray(config.corsOrigins) ? config.corsOrigins : ['*'],
    mlServiceUrl: (config.mlServiceUrl || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
    mlServiceTimeoutMs: Number(config.mlServiceTimeoutMs || 15000),
    port: Number(config.port || 3000),
    mongoUri: (config.mongoUri || '').trim(),
    jwtSecret: config.jwtSecret || '',
    jwtExpiresIn: config.jwtExpiresIn || '7d',
    initialSuperAdmin: config.initialSuperAdmin || {
      username: '',
      email: '',
      password: '',
    },
  };

  const app = express();
  const corsOrigin = normalizedConfig.corsOrigins.includes('*') ? '*' : normalizedConfig.corsOrigins;

  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin }));
  // Dataset row chunks are larger than the default 32kb; the admin router applies its own limit.
  const defaultJson = express.json({ limit: '32kb' });
  app.use((request, response, next) => (/^\/api\/admin\/datasets\/[^/]+\/rows$/.test(request.path)
    ? next()
    : defaultJson(request, response, next)));

  app.get('/health', async (_request, response) => {
    const mlService = await getMlServiceStatus(normalizedConfig);
    const mongo = {
      connected: mongoose.connection.readyState === 1,
      database: mongoose.connection.readyState === 1 ? mongoose.connection.name : null,
    };
    response.json({
      status: mongo.connected && mlService.reachable && mlService.modelAvailable && mlService.status === 'ready'
        ? 'ok'
        : 'degraded',
      service: 'wetzy-backend',
      dependencies: { mongo, mlService },
    });
  });

  const authService = options.authService || createAuthService(normalizedConfig);
  app.locals.authService = authService;

  app.use('/api', createApiRouter(normalizedConfig));
  app.use('/api/auth', createAuthRouter(normalizedConfig, authService));
  app.use('/api/notifications', createNotificationRouter(normalizedConfig, authService));
  app.use('/api/admin', createAdminRouter(normalizedConfig, authService, options.datasetService));

  app.use((_request, _response, next) => {
    const error = new Error('Route not found');
    error.status = 404;
    error.code = 'NOT_FOUND';
    next(error);
  });

  app.use((error, _request, response, _next) => {
    if (error.type === 'entity.parse.failed') {
      return response.status(400).json({
        error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON' },
      });
    }

    if (error.type === 'entity.too.large') {
      return response.status(413).json({
        error: { code: 'REQUEST_TOO_LARGE', message: 'Request body exceeds the allowed size' },
      });
    }

    const status = Number.isInteger(error.status) ? error.status : 500;
    const code = error.code || 'INTERNAL_SERVER_ERROR';
    if (status === 500) console.error(error);
    const message = status === 500 ? 'An unexpected server error occurred' : error.message;
    return response.status(status).json({ error: { code, message } });
  });

  return app;
}

module.exports = { createApp };
