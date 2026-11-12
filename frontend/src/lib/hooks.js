import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { loadConfig } from './config';

/** Load data from the API with loading and error states, and a reload function. */
export function useApi(path, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path && enabled) });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path || !enabled) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path, { signal: controller.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error?.name !== 'AbortError') setState({ data: null, error, loading: false });
      });
    return () => controller.abort();
  }, [path, enabled, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useConfig() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    loadConfig().then(setConfig).catch(setError);
  }, []);
  return { config, error, features: config?.features ?? {} };
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Run a callback every `ms` while mounted (and immediately once). */
export function useInterval(callback, ms, { immediate = false } = {}) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (!ms) return undefined;
    if (immediate) saved.current();
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms, immediate]);
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · SAHELI` : 'SAHELI · Your digital safety companion';
  }, [title]);
}

/** Keep a value in sessionStorage (cleared when the tab closes). */
export function useSessionState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: state still works for this page.
    }
  }, [key, value]);
  return [value, setValue];
}
