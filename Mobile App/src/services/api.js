const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, code = 'API_ERROR', status = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function requestJson(path) {
  if (!API_BASE_URL) {
    throw new ApiError(
      'ยังไม่ได้ตั้งค่า EXPO_PUBLIC_API_URL',
      'API_NOT_CONFIGURED',
    );
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ApiError('เชื่อมต่อ Backend ไม่ได้', 'API_UNAVAILABLE');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('Backend ส่งข้อมูล JSON ไม่ถูกต้อง', 'INVALID_API_RESPONSE', response.status);
  }

  if (!response.ok) {
    const error = payload?.error || payload?.detail || {};
    throw new ApiError(
      typeof error === 'string' ? error : error.message || 'ไม่สามารถโหลดข้อมูลได้',
      error.code || 'API_REQUEST_FAILED',
      response.status,
    );
  }

  return payload;
}

export async function fetchAreas() {
  const payload = await requestJson('/areas');
  if (!Array.isArray(payload.areas) || payload.areas.some((area) => (
    !area
    || !['string', 'number'].includes(typeof area.id)
    || !String(area.id).trim()
    || typeof area.district !== 'string'
    || !area.district.trim()
  ))) {
    throw new ApiError('รูปแบบรายการพื้นที่จาก Backend ไม่ถูกต้อง', 'INVALID_API_RESPONSE');
  }

  return payload.areas;
}

export async function fetchArea(id) {
  const payload = await requestJson(`/areas/${encodeURIComponent(id)}`);
  if (!payload.area || typeof payload.area !== 'object' || Array.isArray(payload.area)) {
    throw new ApiError('รูปแบบรายละเอียดพื้นที่จาก Backend ไม่ถูกต้อง', 'INVALID_API_RESPONSE');
  }

  return payload.area;
}

export async function fetchForecast(id) {
  const payload = await requestJson(`/areas/${encodeURIComponent(id)}/forecast`);
  if (!payload.forecast || typeof payload.forecast !== 'object' || Array.isArray(payload.forecast)) {
    throw new ApiError('รูปแบบผลพยากรณ์จาก Backend ไม่ถูกต้อง', 'INVALID_API_RESPONSE');
  }

  return payload.forecast;
}
