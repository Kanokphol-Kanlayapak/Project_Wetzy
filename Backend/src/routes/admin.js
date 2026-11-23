const express = require('express');
const { createAuthMiddleware } = require('../middleware/auth');
const { getMlServiceStatus } = require('../services/ml-service');
const { createDatasetService } = require('../services/dataset-service');

const ROWS_BODY_LIMIT = '3mb';

function createAdminRouter(config, authService, datasetService = createDatasetService()) {
  const router = express.Router();
  const { authenticateToken, authorizeRoles } = createAuthMiddleware(config, authService);
  router.use(authenticateToken, authorizeRoles('admin', 'superadmin'));

  // Wraps an async handler so rejected promises reach the Express error handler.
  const wrap = (handler) => (request, response, next) => Promise.resolve(handler(request, response)).catch(next);

  const audit = (request, action, status = 'success') => authService.recordAuthLog({
    username: request.user.username,
    role: request.user.role,
    action,
    status,
  }).catch(() => null);

  router.get('/overview', wrap(async (_request, response) => {
    const overview = await datasetService.getOverview();
    const mlService = await getMlServiceStatus(config);
    response.json({ ...overview, mlService });
  }));

  router.get('/logs', wrap(async (request, response) => {
    const logs = await datasetService.listLogs({ limit: request.query.limit, status: request.query.status });
    response.json({ logs });
  }));

  router.get('/dataset-types', (_request, response) => {
    response.json({ types: datasetService.listTypes() });
  });

  router.get('/datasets', wrap(async (_request, response) => {
    response.json({ datasets: await datasetService.listDatasets() });
  }));

  router.post('/datasets', wrap(async (request, response) => {
    const dataset = await datasetService.createDataset(request.body || {}, request.user);
    response.status(201).json({ dataset });
  }));

  router.post('/datasets/:id/rows', express.json({ limit: ROWS_BODY_LIMIT }), wrap(async (request, response) => {
    response.json(await datasetService.appendRows(request.params.id, request.body?.rows));
  }));

  router.post('/datasets/:id/complete', wrap(async (request, response) => {
    const dataset = await datasetService.completeDataset(request.params.id);
    await audit(request, `dataset_upload:${dataset.name}`.slice(0, 120), dataset.status === 'ready' ? 'success' : 'failure');
    response.json({ dataset });
  }));

  router.post('/datasets/:id/abort', wrap(async (request, response) => {
    const dataset = await datasetService.abortDataset(request.params.id);
    await audit(request, `dataset_abort:${dataset.name}`.slice(0, 120), 'failure');
    response.json({ dataset });
  }));

  router.get('/datasets/:id/preview', wrap(async (request, response) => {
    response.json(await datasetService.previewDataset(request.params.id, request.query.limit));
  }));

  router.delete('/datasets/:id', wrap(async (request, response) => {
    const dataset = await datasetService.deleteDataset(request.params.id);
    await audit(request, `dataset_delete:${dataset.name}`.slice(0, 120));
    response.json({ message: 'ลบชุดข้อมูลเรียบร้อยแล้ว', dataset });
  }));

  return router;
}

module.exports = { createAdminRouter };
