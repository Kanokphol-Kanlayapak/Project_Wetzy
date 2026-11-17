import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
const API_TIMEOUT_MS = 15000;
const STAFF_TOKEN_KEY = 'wetzy.staff.token';
const inFlightGetRequests = new Map();

export class ApiError extends Error {
  constructor(message, code = 'API_ERROR', status = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function performRequestJson(path, options) {
  if (!API_BASE_URL) {
    throw new ApiError(
      'ยังไม่ได้ตั้งค่า EXPO_PUBLIC_API_URL',
      'API_NOT_CONFIGURED',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response;
  try {
    const headers = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.token) headers.Authorization = `Bearer ${options.token}`;

    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('Backend ใช้เวลาตอบกลับนานเกินไป กรุณาลองอีกครั้ง', 'API_TIMEOUT');
    }
    throw new ApiError('เชื่อมต่อ Backend ไม่ได้ กรุณาตรวจสอบ Backend และ URL', 'API_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
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

function requestJson(path, options = {}) {
  const method = options.method || 'GET';
  if (method !== 'GET') {
    return performRequestJson(path, options);
  }

  const key = `${path}:${options.token || ''}`;
  const pendingRequest = inFlightGetRequests.get(key);
  if (pendingRequest) return pendingRequest;

  const request = performRequestJson(path, options);
  inFlightGetRequests.set(key, request);
  return request.finally(() => {
    if (inFlightGetRequests.get(key) === request) {
      inFlightGetRequests.delete(key);
    }
  });
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

export async function saveStaffToken(token) {
  if (Platform.OS === 'web') {
    window.sessionStorage.setItem(STAFF_TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(STAFF_TOKEN_KEY, token);
}

export async function getStaffToken() {
  if (Platform.OS === 'web') {
    return window.sessionStorage.getItem(STAFF_TOKEN_KEY);
  }
  return SecureStore.getItemAsync(STAFF_TOKEN_KEY);
}

export async function clearStaffToken() {
  if (Platform.OS === 'web') {
    window.sessionStorage.removeItem(STAFF_TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(STAFF_TOKEN_KEY);
}

export async function loginStaff(identifier, password) {
  const payload = await requestJson('/auth/staff/login', {
    method: 'POST',
    body: { identifier, password },
  });
  if (typeof payload.token !== 'string' || !payload.user || typeof payload.expiresAt !== 'number') {
    throw new ApiError('Backend ส่งข้อมูลการเข้าสู่ระบบไม่ถูกต้อง', 'INVALID_API_RESPONSE');
  }
  return payload;
}

export async function fetchStaffProfile(token) {
  const payload = await requestJson('/auth/staff/me', { token });
  if (!payload.user || typeof payload.user !== 'object' || typeof payload.expiresAt !== 'number') {
    throw new ApiError('Backend ส่งข้อมูลบัญชีไม่ถูกต้อง', 'INVALID_API_RESPONSE');
  }
  return { user: payload.user, expiresAt: payload.expiresAt };
}

export async function logoutStaff(token) {
  return requestJson('/auth/staff/logout', { method: 'POST', token });
}
