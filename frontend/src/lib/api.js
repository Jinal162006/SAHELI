import { clearInvalidSession, getAccessToken } from './supabase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, code, message, fields = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Call the SAHELI API.
 * - Adds the signed-in session token when there is one.
 * - Sends `body` as JSON or `form` as multipart.
 * - Throws ApiError with a code and a human-readable message on any failure.
 */
export async function api(path, { method = 'GET', body, form, signal, anonymous = false, blob = false } = {}) {
  const headers = { Accept: blob ? '*/*' : 'application/json' };
  if (!anonymous) {
    try {
      const token = await getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // Configuration not available: the request goes out without a session.
    }
  }
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: payload,
      signal,
      credentials: API_BASE_URL ? 'include' : 'same-origin',
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError(0, 'network', 'network');
  }

  if (!response.ok) {
    if (response.status === 401 && !anonymous) {
      try {
        await clearInvalidSession();
      } catch {
        // The request has already failed; the auth state listener will handle sign-out.
      }
    }
    let detail = {};
    try {
      detail = (await response.json())?.detail ?? {};
    } catch {
      // Non-JSON error page (for example from a proxy).
    }
    throw new ApiError(response.status, detail.code || `http_${response.status}`, detail.message || '', detail.fields || null);
  }
  if (blob) return response;
  if (response.status === 204) return null;
  return response.json();
}

/** Download an authenticated file as a Blob (evidence files never get public URLs). */
export async function apiBlob(path) {
  const response = await api(path, { blob: true });
  return response.blob();
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
