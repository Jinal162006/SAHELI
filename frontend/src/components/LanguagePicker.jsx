import { Languages } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { LANGUAGES, useI18n } from '../lib/i18n';
import { cx } from './ui';

export function LanguagePicker({ className, compact = false }) {
  const { language, setLanguage, t } = useI18n();
  const { profile, updateProfile } = useAuth();

  const change = (code) => {
    setLanguage(code);
    if (profile) updateProfile({ language: code }).catch(() => {});
  };

  return (
    <label className={cx('inline-flex items-center gap-1.5 text-sm text-ink-soft', className)}>
      <Languages className="size-4" aria-hidden />
      <span className="sr-only">{t('settings.language')}</span>
      <select
        value={language}
        onChange={(e) => change(e.target.value)}
        className={cx('cursor-pointer rounded-lg border border-transparent bg-transparent py-1 pr-1 font-medium text-ink hover:border-line', compact && 'max-w-24')}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
            {l.beta ? ` (${t('common.beta')})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
