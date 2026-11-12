import { ArrowLeft, CircleCheck, MapPin, Phone, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LogoMark } from '../../components/Logo';
import { getPosition } from '../../lib/geo';
import { useDocumentTitle, useInterval } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

// SAHELI Safety Mode: a deliberately small screen for watches and small devices.
// It holds a scoped device token, never a user session.

const TOKEN_KEY = 'saheli.device_token';

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function watchApi(path, { method = 'GET', body } = {}) {
  const token = readToken();
  const response = await fetch(path, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Device ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = new Error('request failed');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function maybePosition() {
  try {
    return await getPosition({ timeout: 8000 });
  } catch {
    return undefined;
  }
}

function Pair({ onPaired, notice }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const result = await watchApi('/api/watch/pair', { method: 'POST', body: { code } });
      localStorage.setItem(TOKEN_KEY, result.device_token);
      onPaired();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3 text-center">
      <LogoMark className="mx-auto size-10" />
      <h1 className="text-lg font-bold">{t('watch.pair_title')}</h1>
      {notice ? <p className="text-sm text-caution-100">{notice}</p> : null}
      <p className="text-sm text-white/70">{t('watch.pair_body')}</p>
      <label className="block text-left text-sm font-semibold" htmlFor="watch-code">
        {t('watch.pair_code')}
      </label>
      <input
        id="watch-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={20}
        className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-3 text-center font-mono text-xl tracking-widest text-white focus:border-white focus:outline-none"
      />
      {failed ? <p className="text-sm text-danger-100">{t('watch.failed')}</p> : null}
      <button type="submit" disabled={busy || code.length < 6} className="w-full rounded-xl bg-brand-500 py-3 text-lg font-bold disabled:opacity-50">
        {t('watch.pair_submit')}
      </button>
    </form>
  );
}

function HelpButton({ onActivate }) {
  const { t } = useI18n();
  const [holding, setHolding] = useState(false);
  const timer = useRef(null);
  const start = () => {
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      navigator.vibrate?.(200);
      onActivate();
    }, 1500);
  };
  const stop = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && start()}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && stop()}
      onContextMenu={(e) => e.preventDefault()}
      className={`col-span-2 touch-none select-none rounded-2xl py-5 text-2xl font-black tracking-wide transition-colors ${holding ? 'bg-danger-700' : 'bg-danger-600'}`}
    >
      {t('watch.help')}
      <span className="block text-xs font-semibold opacity-80">{t('watch.hold')}</span>
    </button>
  );
}

export default function WatchApp() {
  const { t } = useI18n();
  useDocumentTitle(t('watch.title'));
  const [paired, setPaired] = useState(Boolean(readToken()));
  const [home, setHome] = useState(null);
  const [view, setView] = useState('home');
  const [toast, setToast] = useState(null);
  const [notice, setNotice] = useState(null);

  const flash = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    if (!readToken()) return;
    try {
      setHome(await watchApi('/api/watch/home'));
    } catch (error) {
      if (error.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        setPaired(false);
        setNotice(t('watch.unpaired'));
      }
    }
  }, [t]);

  useEffect(() => {
    if (paired) load();
  }, [paired, load]);
  useInterval(load, paired ? 20000 : null);

  const active = home?.emergency?.active;
  useInterval(
    async () => {
      const location = await maybePosition();
      if (location) watchApi('/api/watch/location', { method: 'POST', body: location }).catch(() => {});
    },
    active ? 30000 : null,
    { immediate: true },
  );

  const run = async (action) => {
    try {
      if (action === 'safe') {
        await watchApi('/api/watch/checkin', { method: 'POST', body: { status: 'safe' } });
        flash(t('watch.sent_safe'));
      } else if (action === 'location') {
        const location = await maybePosition();
        if (!location) {
          flash(t('watch.no_location'));
          return;
        }
        await watchApi('/api/watch/checkin', { method: 'POST', body: { status: 'safe', location } });
        flash(t('watch.sent_location'));
      } else if (action === 'sos') {
        const location = await maybePosition();
        await watchApi('/api/watch/sos', { method: 'POST', body: { location } });
        await load();
      } else if (action === 'end') {
        await watchApi('/api/watch/sos/end', { method: 'POST' });
        await load();
      }
    } catch {
      flash(t('watch.failed'));
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink p-3 text-white">
      <main id="main" className="w-full max-w-[22rem]" aria-live="polite">
        {!paired ? (
          <Pair
            notice={notice}
            onPaired={() => {
              setNotice(null);
              setPaired(true);
            }}
          />
        ) : !home ? (
          <p className="text-center text-white/70">{t('common.loading')}</p>
        ) : active ? (
          <div className="space-y-3 text-center">
            <div className="rounded-2xl bg-danger-600 p-4">
              <p className="text-2xl font-black">{t('watch.alert_on')}</p>
              <p className="text-sm">{t('watch.alert_on_body')}</p>
            </div>
            <a href="tel:112" className="flex items-center justify-center gap-2 rounded-2xl border-2 border-white py-3 text-lg font-bold">
              <Phone className="size-5" aria-hidden />
              112
            </a>
            <button type="button" onClick={() => run('end')} className="w-full rounded-2xl bg-safe-600 py-4 text-lg font-bold">
              {t('watch.end')}
            </button>
          </div>
        ) : view === 'people' ? (
          <div className="space-y-2">
            <button type="button" onClick={() => setView('home')} className="flex items-center gap-1 text-sm font-semibold text-white/80">
              <ArrowLeft className="size-4" aria-hidden />
              {t('watch.back')}
            </button>
            {home.contacts.length ? (
              home.contacts.map((c) => (
                <a key={c.phone} href={`tel:${c.phone}`} className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-4 text-lg font-bold">
                  {c.name}
                  <Phone className="size-5" aria-hidden />
                </a>
              ))
            ) : (
              <p className="text-center text-white/70">{t('watch.no_people')}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-center text-lg font-bold">{t('watch.hi', { name: home.first_name })}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => run('safe')} className="col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-safe-600 py-4 text-xl font-bold">
                <CircleCheck className="size-6" aria-hidden />
                {t('watch.safe')}
              </button>
              <HelpButton onActivate={() => run('sos')} />
              <button type="button" onClick={() => run('location')} className="flex flex-col items-center gap-1 rounded-2xl bg-white/10 py-3 text-sm font-bold">
                <MapPin className="size-5" aria-hidden />
                {t('watch.location')}
              </button>
              <button type="button" onClick={() => setView('people')} className="flex flex-col items-center gap-1 rounded-2xl bg-white/10 py-3 text-sm font-bold">
                <Users className="size-5" aria-hidden />
                {t('watch.people')}
              </button>
            </div>
          </div>
        )}
        {toast ? (
          <p role="status" className="mt-3 rounded-xl bg-white px-3 py-2 text-center text-sm font-bold text-ink">
            {toast}
          </p>
        ) : null}
      </main>
    </div>
  );
}
