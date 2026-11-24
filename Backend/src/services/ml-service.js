class MlServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'MlServiceError';
    this.status = status;
    this.code = code;
  }
}

async function requestMlService(path, config, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.mlServiceTimeoutMs);

  try {
    const headers = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${config.mlServiceUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new MlServiceError(502, 'INVALID_ML_RESPONSE', 'Machine Learning service returned invalid JSON');
    }

    if (!response.ok) {
      const detail = payload?.detail || payload?.error || {};
      const detailObject = typeof detail === 'object' && !Array.isArray(detail) ? detail : {};
      const detailMessage = typeof detail === 'string' ? detail : detailObject.message;
      throw new MlServiceError(
        response.status,
        detailObject.code || (response.status === 422 ? 'INVALID_PREDICTION_INPUT' : 'ML_SERVICE_ERROR'),
        detailMessage || 'Machine Learning service request failed',
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new MlServiceError(502, 'INVALID_ML_RESPONSE', 'Machine Learning service returned an invalid response');
    }

    return payload;
  } catch (error) {
    if (error instanceof MlServiceError) throw error;

    if (error.name === 'AbortError') {
      throw new MlServiceError(504, 'ML_SERVICE_TIMEOUT', 'Machine Learning service request timed out');
    }

    throw new MlServiceError(503, 'ML_SERVICE_UNAVAILABLE', 'Machine Learning service is unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

async function getMlServiceStatus(config) {
  try {
    const payload = await requestMlService('/health', config);
    return {
      reachable: true,
      datasetAvailable: payload.dataset_available === true,
      modelAvailable: payload.model_available === true,
      status: payload.status || 'unknown',
      forecastTimingMismatch: payload.forecast?.timing_mismatch === true,
    };
  } catch (error) {
    return {
      reachable: false,
      datasetAvailable: false,
      modelAvailable: false,
      forecastTimingMismatch: false,
      error: error.code || 'ML_SERVICE_UNAVAILABLE',
    };
  }
}

module.exports = { MlServiceError, getMlServiceStatus, requestMlService };
