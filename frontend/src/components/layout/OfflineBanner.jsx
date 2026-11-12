import { WifiOff } from 'lucide-react';
import { useOnline } from '../../lib/hooks';
import { useT } from '../../lib/i18n';

export function OfflineBanner() {
  const online = useOnline();
  const t = useT();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-caution-50 px-4 py-2 text-center text-sm font-medium text-caution-700">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>
        {t('errors.offline_banner')}{' '}
        <a href="tel:112" className="underline">
          112
        </a>
      </span>
    </div>
  );
}
