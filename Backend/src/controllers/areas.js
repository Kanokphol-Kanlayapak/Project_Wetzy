const { requestMlService } = require('../services/ml-service');

function createAreasController(config) {
  async function forward(path, response, next, options) {
    try {
      response.json(await requestMlService(path, config, options));
    } catch (error) {
      next(error);
    }
  }

  return {
    list: (request, response, next) => {
      const { province } = request.query;
      if (province === undefined) {
        return forward('/areas', response, next);
      }

      if (typeof province !== 'string' || !province.trim()) {
        return response.status(400).json({
          error: {
            code: 'INVALID_PROVINCE',
            message: 'province must be a non-empty string',
          },
        });
      }

      const query = new URLSearchParams({ province: province.trim() });
      return forward(`/areas?${query}`, response, next);
    },
    detail: (request, response, next) => forward(`/areas/${encodeURIComponent(request.params.district)}`, response, next),
    forecast: (request, response, next) => forward(
      `/areas/${encodeURIComponent(request.params.district)}/forecast`,
      response,
      next,
    ),
    predict: (request, response, next) => {
      if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
        return response.status(400).json({
          error: {
            code: 'INVALID_PREDICTION_INPUT',
            message: 'Prediction input must be a JSON object',
          },
        });
      }

      return forward('/predict', response, next, { method: 'POST', body: request.body });
    },
  };
}

module.exports = { createAreasController };
