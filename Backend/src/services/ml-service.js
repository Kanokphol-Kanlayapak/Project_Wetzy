class MlServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'MlServiceError';
    this.status = status;
    this.code = code;
  }
}

async function requestMlService(path, config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.mlServiceTimeoutMs);

  try {
    const response = await fetch(`${config.mlServiceUrl}${path}`, {
      headers: { Accept: 'application/json' },
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
      throw new MlServiceError(
        response.status,
        detail.code || 'ML_SERVICE_ERROR',
        detail.message || detail || 'Machine Learning service request failed',
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
    };
  } catch (error) {
    return {
      reachable: false,
      datasetAvailable: false,
      modelAvailable: false,
      error: error.code || 'ML_SERVICE_UNAVAILABLE',
    };
  }
}

module.exports = { MlServiceError, getMlServiceStatus, requestMlService };
