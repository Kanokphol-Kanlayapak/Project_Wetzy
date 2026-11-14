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
    list: (_request, response, next) => forward('/areas', response, next),
    detail: (request, response, next) => forward(`/areas/${encodeURIComponent(request.params.district)}`, response, next),
    forecast: (request, response, next) => forward(
      `/areas/${encodeURIComponent(request.params.district)}/forecast`,
      response,
      next,
    ),
  };
}

module.exports = { createAreasController };
