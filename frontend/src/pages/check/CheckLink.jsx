import { CircleCheck, CircleHelp, Link2, OctagonAlert, RotateCcw, TriangleAlert, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Field, Input, Notice, PageHeader, cx, errorMessage } from '../../components/ui';
import { api } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

const STATUS_STYLE = {
  safe: { icon: CircleCheck, box: 'border-safe-600/25 bg-safe-50', text: 'text-safe-700' },
  unable_to_verify: { icon: CircleHelp, box: 'border-line-strong bg-lavender-50', text: 'text-ink' },
  suspicious: { icon: TriangleAlert, box: 'border-caution-600/30 bg-caution-50', text: 'text-caution-700' },
  high_risk: { icon: OctagonAlert, box: 'border-danger-600/30 bg-danger-50', text: 'text-danger-700' },
  invalid: { icon: XCircle, box: 'border-line-strong bg-lavender-50', text: 'text-ink' },
};

function LinkResult({ result, onReset }) {
  const { t } = useI18n();
  const style = STATUS_STYLE[result.status];
  const Icon = style.icon;
  const brand = result.official_brand;
  const officialText = brand
    ? ['bank', 'government'].includes(brand)
      ? t(`check.link.official_generic.${brand}`)
      : t('check.link.official', { brand: result.official_brand_name ?? brand })
    : null;

  return (
    <div className="space-y-5" aria-live="polite">
      <Card className={cx('border-2 p-5 sm:p-6', style.box)}>
        <p className={cx('flex items-center gap-2 text-xl font-semibold', style.text)}>
          <Icon className="size-6 shrink-0" aria-hidden />
          {t(`check.link.status.${result.status}`)}
        </p>
        <p className="mt-2 text-ink-soft">{t(`check.link.status_body.${result.status}`)}</p>
        {result.host ? (
          <p className="mt-4 break-all rounded-lg bg-surface/80 px-3 py-2 font-mono text-sm text-ink">
            {result.display_host && result.display_host !== result.host ? `${result.display_host} (${result.host})` : result.host}
          </p>
        ) : null}
        {officialText && result.status === 'safe' ? <p className="mt-3 font-medium text-safe-700">{officialText}</p> : null}
        {result.expanded_to ? (
          <div className="mt-3 text-sm">
            <p className="text-ink-soft">{t('check.link.expanded')}</p>
            <p className="break-all font-mono text-ink">{result.expanded_to}</p>
          </div>
        ) : null}
      </Card>

      {result.signals.length ? (
        <section aria-labelledby="signals">
          <h2 id="signals" className="mb-3 text-lg font-semibold">
            {t('check.result.why_title')}
          </h2>
          <ul className="space-y-2">
            {result.signals.map((s) => (
              <li key={s.id} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
                <span
                  className={cx('mt-1.5 size-2.5 shrink-0 rounded-full', s.severity >= 4 ? 'bg-danger-600' : s.severity >= 2 ? 'bg-caution-600' : 'bg-line-strong')}
                  aria-hidden
                />
                <span className="text-ink">{t(`check.link.signals.${s.id}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.status !== 'invalid' ? (
        <Card className="p-5">
          <h2 className="font-semibold">{t('check.link.checked_title')}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>{t('check.link.checked_structure')}</li>
            <li>{t(`check.link.checked_threat_${result.threat_check}`)}</li>
            <li>{t('check.link.not_opened')}</li>
          </ul>
        </Card>
      ) : null}

      {['suspicious', 'high_risk'].includes(result.status) ? (
        <Notice tone="warning" title={t('check.result.steps_title')}>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('check.steps.dont_click_link')}</li>
            <li>{t('check.steps.check_with_official_source')}</li>
            <li>{t('check.steps.no_codes')}</li>
            <li>{t('check.steps.report_chakshu')}</li>
          </ul>
        </Notice>
      ) : null}

      <Button variant="ghost" icon={RotateCcw} onClick={onReset}>
        {t('check.link.new_check')}
      </Button>
    </div>
  );
}

export default function CheckLink() {
  const { t } = useI18n();
  useDocumentTitle(t('check.link.title'));
  const [url, setUrl] = useState('');
  const [result, setResult] = useState(null);
  const [state, setState] = useState({ busy: false, error: null });

  const submit = async (event) => {
    event.preventDefault();
    setState({ busy: true, error: null });
    try {
      setResult(await api('/api/check/link', { method: 'POST', body: { url: url.trim() } }));
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('check.link.title')} description={t('check.link.description')} />
      {result ? (
        <LinkResult
          result={result}
          onReset={() => {
            setResult(null);
            setUrl('');
          }}
        />
      ) : (
        <Card className="p-5 sm:p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label={t('check.link.label')} htmlFor="url">
              <Input
                id="url"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={t('check.link.placeholder')}
                value={url}
                maxLength={2100}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
            <Button type="submit" icon={Link2} loading={state.busy} disabled={!url.trim()}>
              {state.busy ? t('check.link.running') : t('check.link.submit')}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
