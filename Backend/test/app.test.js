const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const { createApp } = require('../src/app');

let mlServer;
let mlUrl;
let apiServer;
let apiUrl;
let receivedPredictionInput;

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve(`http://127.0.0.1:${server.address().port}`);
  }));
}

before(async () => {
  mlServer = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');

    if (request.url === '/health') {
      response.end(JSON.stringify({
        status: 'degraded',
        model_available: false,
        forecast: { timing_mismatch: true },
      }));
      return;
    }

    if (request.method === 'POST' && request.url === '/predict') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        receivedPredictionInput = JSON.parse(body);
        response.end(JSON.stringify({
          prediction: {
            target: 'flood_next_day',
            predicted_class: 0,
            flood_probability: 0.05,
            forecast_horizon_days: 1,
            probabilities_calibrated: true,
          },
        }));
      });
      return;
    }

    if (request.url === '/areas' || request.url.startsWith('/areas?')) {
      response.end(JSON.stringify({ areas: [{ id: 'test-area', district: 'Test District' }] }));
      return;
    }

    response.statusCode = 503;
    response.end(JSON.stringify({
      detail: { code: 'PREDICTION_NOT_CONFIGURED', message: 'No trained model artifact is configured' },
    }));
  });
  mlUrl = await listen(mlServer);

  apiServer = http.createServer(createApp({
    corsOrigins: ['*'],
    mlServiceUrl: mlUrl,
    mlServiceTimeoutMs: 1000,
  }));
  apiUrl = await listen(apiServer);
});

after(async () => {
  await Promise.all([mlServer, apiServer].map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

test('health reports that the backend is up while the model is unavailable', async () => {
  const response = await fetch(`${apiUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'degraded');
  assert.equal(body.dependencies.mlService.reachable, true);
  assert.equal(body.dependencies.mlService.modelAvailable, false);
  assert.equal(body.dependencies.mlService.forecastTimingMismatch, true);
});

test('area list is forwarded as JSON without adding local data', async () => {
  const response = await fetch(`${apiUrl}/api/areas`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    areas: [{ id: 'test-area', district: 'Test District' }],
  });
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});

test('province filters are forwarded to the ML area endpoint', async () => {
  const response = await fetch(`${apiUrl}/api/areas?province=${encodeURIComponent('Test Province')}`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    areas: [{ id: 'test-area', district: 'Test District' }],
  });
});

test('prediction inputs are forwarded to the trained-model service', async () => {
  const input = {
    district: 'Test District',
    rain_next_24h_mm: 12.5,
    temperature_2m: 29,
  };
  const response = await fetch(`${apiUrl}/api/predictions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(receivedPredictionInput, input);
  assert.deepEqual(await response.json(), {
    prediction: {
      target: 'flood_next_day',
      predicted_class: 0,
      flood_probability: 0.05,
      forecast_horizon_days: 1,
      probabilities_calibrated: true,
    },
  });
});

test('non-object prediction inputs are rejected', async () => {
  const response = await fetch(`${apiUrl}/api/predictions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([]),
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_PREDICTION_INPUT');
});

test('empty or repeated province filters are rejected', async () => {
  const emptyProvince = await fetch(`${apiUrl}/api/areas?province=%20`);
  const repeatedProvince = await fetch(`${apiUrl}/api/areas?province=one&province=two`);

  assert.equal(emptyProvince.status, 400);
  assert.equal((await emptyProvince.json()).error.code, 'INVALID_PROVINCE');
  assert.equal(repeatedProvince.status, 400);
  assert.equal((await repeatedProvince.json()).error.code, 'INVALID_PROVINCE');
});

test('district forecast errors are returned explicitly', async () => {
  const response = await fetch(`${apiUrl}/api/areas/test-area/forecast`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(body.error, {
    code: 'PREDICTION_NOT_CONFIGURED',
    message: 'No trained model artifact is configured',
  });
});

test('an unreachable Machine Learning service returns an explicit 503', async () => {
  const server = http.createServer(createApp({
    corsOrigins: ['*'],
    mlServiceUrl: 'http://127.0.0.1:1',
    mlServiceTimeoutMs: 1000,
  }));
  const url = await listen(server);

  try {
    const response = await fetch(`${url}/api/areas`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.error.code, 'ML_SERVICE_UNAVAILABLE');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('invalid district identifiers are rejected before proxying', async () => {
  const response = await fetch(`${apiUrl}/api/areas/${encodeURIComponent('Bad?Name')}`);

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_DISTRICT');
});
