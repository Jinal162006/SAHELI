// Public runtime configuration from the API (Supabase URL, publishable key, feature flags).
// Loaded at runtime so one build works in every environment.

let pending = null;

export function loadConfig() {
  if (!pending) {
    pending = fetch('/api/config', { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`config ${response.status}`);
        return response.json();
      })
      .catch((error) => {
        pending = null; // allow a retry
        throw error;
      });
  }
  return pending;
}
