import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './config';

let client = null;
let clientPromise = null;
const CLIENT_KEY = '__saheli_supabase_client__';

export function getSupabase() {
  if (client) return Promise.resolve(client);
  if (globalThis[CLIENT_KEY]) {
    client = globalThis[CLIENT_KEY];
    return Promise.resolve(client);
  }
  if (!clientPromise) {
    clientPromise = loadConfig()
      .then((config) => {
        client = createClient(config.supabase_url, config.supabase_anon_key, {
          auth: {
            flowType: 'pkce',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
        globalThis[CLIENT_KEY] = client;
        return client;
      })
      .catch((error) => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

export async function getAccessToken() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}

export async function clearInvalidSession() {
  const supabase = await getSupabase();
  await supabase.auth.signOut({ scope: 'local' });
  window.dispatchEvent(new Event('saheli-auth-invalid'));
}
