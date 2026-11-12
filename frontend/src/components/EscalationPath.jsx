import { useT } from '../lib/i18n';
import { cx } from './ui';

export const STAGES = [
  'connection',
  'trust',
  'bonding',
  'secrecy',
  'isolation',
  'personal_info',
  'intimate',
  'financial',
  'urgency',
  'threat',
];

const tint = (index) => {
  if (index >= 8) return 'bg-danger-600 text-white border-danger-600';
  if (index >= 6) return 'bg-high-600 text-white border-high-600';
  if (index >= 3) return 'bg-caution-600 text-white border-caution-600';
  return 'bg-brand-600 text-white border-brand-600';
};

/**
 * The ten stages of escalation. With `stages` from a check, reached stages are filled in and
 * labelled with the message they first appeared in; without it, the path is shown as a guide.
 */
export function EscalationPath({ stages, className }) {
  const t = useT();
  const byId = Object.fromEntries((stages ?? []).map((s) => [s.id, s]));
  const showReached = Boolean(stages);

  return (
    <ol className={cx('grid grid-cols-2 gap-2 sm:grid-cols-5', className)}>
      {STAGES.map((id, index) => {
        const stage = byId[id];
        const reached = !showReached || stage?.reached;
        return (
          <li
            key={id}
            className={cx(
              'relative rounded-xl border p-3 transition-colors',
              reached ? 'border-line bg-surface' : 'border-dashed border-line bg-transparent',
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cx(
                  'grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold',
                  reached ? tint(index) : 'border-line-strong text-muted',
                )}
                aria-hidden
              >
                {index + 1}
              </span>
              <span className={cx('text-sm font-semibold leading-tight', reached ? 'text-ink' : 'text-muted')}>{t(`check.stages.${id}.title`)}</span>
            </div>
            <p className={cx('mt-1 text-xs', reached ? 'text-ink-soft' : 'text-muted/80')}>
              {showReached && stage?.reached && stage.first_message_index != null
                ? t('check.result.message_ref', { n: stage.first_message_index + 1 })
                : t(`check.stages.${id}.body`)}
            </p>
            {showReached ? <span className="sr-only">{reached ? '(found)' : '(not found)'}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
