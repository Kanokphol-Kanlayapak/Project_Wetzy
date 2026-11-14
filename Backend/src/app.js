const cors = require('cors');
const express = require('express');
const { getMlServiceStatus } = require('./services/ml-service');
const { createApiRouter } = require('./routes/api');

function createApp(config) {
  const app = express();
  const corsOrigin = config.corsOrigins.includes('*') ? '*' : config.corsOrigins;

  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', async (_request, response) => {
    const mlService = await getMlServiceStatus(config);
    response.json({
      status: mlService.reachable && mlService.modelAvailable ? 'ok' : 'degraded',
      service: 'wetzy-backend',
      dependencies: { mlService },
    });
  });

  app.use('/api', createApiRouter(config));

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
