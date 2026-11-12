const LOCALES = { en: 'en-IN', hi: 'hi-IN', 'hi-Latn': 'en-IN' };

export function formatDateTime(iso, language = 'en', options = {}) {
  if (!iso) return '';
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  }).format(new Date(iso));
}

export function formatDate(iso, language = 'en') {
  if (!iso) return '';
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-IN', { dateStyle: 'medium' }).format(new Date(iso));
}

export function formatTime(iso, language = 'en') {
  if (!iso) return '';
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-IN', { timeStyle: 'short' }).format(new Date(iso));
}

export function timeAgo(iso, language = 'en') {
  if (!iso) return '';
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(LOCALES[language] ?? 'en-IN', { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A value for <input type="datetime-local"> in the device's time zone. */
export function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
