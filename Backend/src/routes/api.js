const express = require('express');
const { createAreasController } = require('../controllers/areas');

const DISTRICT_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .()'-]{0,79}$/u;

function validateDistrict(request, response, next) {
  const district = request.params.district;

  if (!DISTRICT_ID_PATTERN.test(district)) {
    return response.status(400).json({
      error: {
        code: 'INVALID_DISTRICT',
        message: 'district must be a valid district name or identifier',
      },
    });
  }

  return next();
}

function createApiRouter(config) {
  const router = express.Router();
  const controller = createAreasController(config);

  router.get('/areas', controller.list);
  router.get('/areas/:district/forecast', validateDistrict, controller.forecast);
  router.get('/areas/:district', validateDistrict, controller.detail);

  return router;
}

module.exports = { createApiRouter };
