const { requestMlService } = require('../services/ml-service');

function createAreasController(config) {
  async function forward(path, response, next) {
    try {
      response.json(await requestMlService(path, config));
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
  };
}

module.exports = { createAreasController };
