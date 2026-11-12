import { LogOut } from 'lucide-react';
import { useEffect } from 'react';
import { useT } from '../lib/i18n';
import { cx } from './ui';

const SAFE_PAGE = 'https://www.google.com/search?q=weather';

export function quickExit() {
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
  // replace() keeps SAHELI out of the back button history for this tab.
  window.location.replace(SAFE_PAGE);
}

/** Leaves the site immediately. Also bound to pressing Escape three times quickly. */
export function QuickExit({ className, compact = false }) {
  const t = useT();

  useEffect(() => {
    let presses = [];
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      const now = Date.now();
      presses = [...presses.filter((time) => now - time < 1500), now];
      if (presses.length >= 3) quickExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <button
      type="button"
      onClick={quickExit}
      title={t('nav.quick_exit_hint')}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm font-semibold text-ink-soft hover:border-ink-soft hover:text-ink',
        className,
      )}
    >
      <LogOut className="size-4" aria-hidden />
      <span className={compact ? 'sr-only sm:not-sr-only' : undefined}>{t('nav.quick_exit')}</span>
    </button>
  );
}
