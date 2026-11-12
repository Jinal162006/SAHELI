import { Plus, Watch } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, ConfirmDialog, CopyButton, Dialog, EmptyState, ErrorState, Field, Input, Loading, Notice, PageHeader, errorMessage } from '../components/ui';
import { api } from '../lib/api';
import { formatDate, timeAgo } from '../lib/format';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { useI18n } from '../lib/i18n';

function PairDialog({ onClose }) {
  const { t } = useI18n();
  const [name, setName] = useState('My watch');
  const [code, setCode] = useState(null);
  const [state, setState] = useState({ busy: false, error: null });
  const watchUrl = `${window.location.origin}/watch`;

  const create = async () => {
    setState({ busy: true, error: null });
    try {
      setCode(await api('/api/devices/pairing-code', { method: 'POST', body: { name: name.trim() || 'My watch' } }));
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={code ? t('devices.pair_code_title') : t('devices.pair')}
      footer={
        code ? (
          <Button onClick={onClose}>{t('common.done')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={create} loading={state.busy}>
              {t('devices.pair_create')}
            </Button>
          </>
        )
      }
    >
      {code ? (
        <div className="space-y-4 text-center">
          <p className="font-mono text-4xl font-bold tracking-[0.2em] text-brand-800">
            {code.code.slice(0, 4)}-{code.code.slice(4)}
          </p>
          <CopyButton text={code.code} />
          <p className="text-left text-ink-soft">{t('devices.pair_code_body', { url: watchUrl, minutes: code.expires_in_minutes })}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={t('devices.pair_name')} htmlFor="device-name">
            <Input id="device-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Notice tone="neutral">{t('devices.what_watch_sees')}</Notice>
          {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
        </div>
      )}
    </Dialog>
  );
}

export default function Devices() {
  const { t, language } = useI18n();
  useDocumentTitle(t('devices.title'));
  const { data, error, loading, reload } = useApi('/api/devices');
  const [pairing, setPairing] = useState(false);
  const [removing, setRemoving] = useState(null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('devices.title')}
        description={t('devices.description')}
        actions={
          <Button icon={Plus} onClick={() => setPairing(true)}>
            {t('devices.pair')}
          </Button>
        }
      />
      <Notice tone="info" className="mb-6">
        {t('devices.honest')}
      </Notice>
      <h2 className="mb-3 text-lg font-semibold">{t('devices.paired_title')}</h2>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data.items.length ? (
        <EmptyState icon={Watch} title={t('devices.none')} action={<Button icon={Plus} onClick={() => setPairing(true)}>{t('devices.pair')}</Button>}>
          {t('devices.what_watch_sees')}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.items.map((d) => (
            <li key={d.id}>
              <Card className="flex items-center justify-between gap-3 p-4">
                <span className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <Watch className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-semibold">{d.name}</span>
                    <span className="block text-xs text-muted">
                      {t('devices.paired_on', { date: formatDate(d.paired_at, language) })}
                      {d.last_seen_at ? ` · ${t('devices.last_seen', { time: timeAgo(d.last_seen_at, language) })}` : ''}
                    </span>
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => setRemoving(d)}>
                  {t('devices.remove')}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {pairing ? (
        <PairDialog
          onClose={() => {
            setPairing(false);
            reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await api(`/api/devices/${removing.id}`, { method: 'DELETE' }).catch(() => {});
          setRemoving(null);
          reload();
        }}
        title={t('devices.remove')}
        confirmLabel={t('devices.remove')}
      >
        {removing ? t('devices.remove_confirm', { name: removing.name }) : null}
      </ConfirmDialog>
    </div>
  );
}
