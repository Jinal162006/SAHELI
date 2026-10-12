// Public runtime configuration from the API (Supabase URL, publishable key, feature flags).
// Loaded at runtime so one build works in every environment.

let pending = null;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const BUNDLED_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const BUNDLED_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

function configError(code, message, cause) {
  const error = new Error(message, { cause });
  error.code = code;
  return error;
}

function bundledConfig() {
  if (!BUNDLED_SUPABASE_URL || !BUNDLED_SUPABASE_ANON_KEY) return null;
  return {
    supabase_url: BUNDLED_SUPABASE_URL,
    supabase_anon_key: BUNDLED_SUPABASE_ANON_KEY,
    features: {},
  };
}

export function loadConfig() {
  if (!pending) {
    const localConfig = bundledConfig();
    if (localConfig) {
      pending = Promise.resolve(localConfig);
    } else {
      pending = fetch(`${API_BASE_URL}/api/config`, { headers: { Accept: 'application/json' } })
        .then(async (response) => {
          const contentType = response.headers.get('content-type') || '';
          if (!response.ok) {
            throw configError('config_http_error', `Configuration endpoint returned HTTP ${response.status}.`);
          }
          if (!contentType.includes('application/json')) {
            throw configError('config_not_json', 'Configuration endpoint did not return JSON.');
          }
          return response.json();
        })
        .catch((error) => {
          const detail = error?.code || 'config_unavailable';
          console.error('[SAHELI] Authentication configuration unavailable.', {
            code: detail,
            apiBaseConfigured: Boolean(API_BASE_URL),
            cause: error?.message || 'unknown',
          });
          throw configError(detail, 'SAHELI authentication configuration is unavailable.', error);
        });
    }
    pending = pending
      .catch((error) => {
        pending = null; // allow a retry
        throw error;
      });
  }
  return pending;
}
