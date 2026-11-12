import { Download, KeyRound, LogOut, Trash2, Watch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, Chips, CopyButton, Dialog, Field, Input, LinkButton, Notice, PageHeader, Select, Switch, errorMessage } from '../components/ui';
import { api, saveBlob } from '../lib/api';
import { useAuth } from '../lib/auth';
import { QUICK_SOS_KEY } from '../lib/constants';
import { formatDateTime } from '../lib/format';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { LANGUAGES, useI18n } from '../lib/i18n';

function Section({ title, children }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 space-y-5">{children}</div>
    </Card>
  );
}

function DeleteAccount() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [state, setState] = useState({ busy: false, error: null });

  const remove = async () => {
    setState({ busy: true, error: null });
    try {
      await api('/api/me', { method: 'DELETE', body: { confirm: 'DELETE' } });
      await signOut().catch(() => {});
      try {
        localStorage.clear();
      } catch {
        // ignore
      }
      navigate('/', { replace: true });
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  return (
    <>
      <div>
        <p className="font-medium">{t('settings.delete')}</p>
        <p className="text-sm text-muted">{t('settings.delete_body')}</p>
        <Button variant="danger-soft" icon={Trash2} className="mt-3" onClick={() => setOpen(true)}>
          {t('settings.delete')}
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('settings.delete')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={remove} loading={state.busy} disabled={typed !== 'DELETE'}>
              {t('settings.delete_confirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-ink-soft">{t('settings.delete_body')}</p>
          <Field label={t('settings.delete_type')} htmlFor="delete-type">
            <Input id="delete-type" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
          {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
        </div>
      </Dialog>
    </>
  );
}

export default function Settings() {
  const { t, language } = useI18n();
  const { profile, updateProfile, signOut } = useAuth();
  useDocumentTitle(t('settings.title'));
  const activity = useApi('/api/me/activity');
  const [name, setName] = useState(profile?.display_name ?? '');
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [quickSos, setQuickSos] = useState(() => {
    try {
      return localStorage.getItem(QUICK_SOS_KEY) === 'on';
    } catch {
      return false;
    }
  });

  useEffect(() => setName(profile?.display_name ?? ''), [profile?.display_name]);

  const save = async (patch, key) => {
    setError(null);
    try {
      await updateProfile(patch);
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError(err);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api('/api/me/export');
      saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'saheli-my-data.json');
      activity.reload();
    } catch (err) {
      setError(err);
    } finally {
      setExporting(false);
    }
  };

  const quickUrl = `${window.location.origin}/sos?quick=1`;
  const ageOptions = [
    { value: '13_17', label: t('auth.age_13_17') },
    { value: '18_plus', label: t('auth.age_18_plus') },
    { value: 'under_13', label: t('auth.age_under_13') },
  ];

  if (!profile) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('settings.title')} />
      {error ? <Notice tone="danger">{errorMessage(t, error)}</Notice> : null}

      <Section title={t('settings.profile')}>
        <Field label={t('settings.display_name')} hint={t('settings.display_name_help')} htmlFor="display-name">
          <div className="flex gap-2">
            <Input id="display-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            <Button variant="secondary" onClick={() => save({ display_name: name.trim() || null }, 'name')} disabled={name === (profile.display_name ?? '')}>
              {saved === 'name' ? t('common.saved') : t('common.save')}
            </Button>
          </div>
        </Field>
        <Field label={t('settings.age_group')}>
          <Chips options={ageOptions} value={profile.age_group} onChange={(v) => v && save({ age_group: v }, 'age')} label={t('settings.age_group')} />
        </Field>
        <Field label={t('settings.language')} hint={t('settings.language_beta')} htmlFor="language">
          <Select id="language" value={language} onChange={(e) => save({ language: e.target.value }, 'language')}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title={t('settings.privacy')}>
        <Switch
          checked={profile.keep_check_history}
          onChange={(v) => save({ keep_check_history: v }, 'history')}
          label={t('settings.history')}
          description={t('settings.history_body')}
        />
        <Field label={t('settings.retention')} hint={t('settings.retention_body')} htmlFor="retention">
          <Select
            id="retention"
            value={profile.evidence_retention_days ?? 0}
            onChange={(e) => save({ evidence_retention_days: Number(e.target.value) }, 'retention')}
          >
            <option value={90}>{t('settings.retention_90')}</option>
            <option value={365}>{t('settings.retention_365')}</option>
            <option value={0}>{t('settings.retention_0')}</option>
          </Select>
        </Field>
        {saved && ['history', 'retention', 'age', 'language'].includes(saved) ? <p className="text-sm text-safe-700">{t('common.saved')}</p> : null}
      </Section>

      <Section title={t('settings.security')}>
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/reset-password" variant="secondary" icon={KeyRound}>
            {t('settings.change_password')}
          </LinkButton>
          <LinkButton to="/devices" variant="secondary" icon={Watch}>
            {t('settings.devices_link')}
          </LinkButton>
        </div>
        <div>
          <p className="font-medium">{t('settings.sign_out_everywhere')}</p>
          <p className="text-sm text-muted">{t('settings.sign_out_everywhere_body')}</p>
          <Button variant="secondary" icon={LogOut} className="mt-3" onClick={() => signOut(true)}>
            {t('settings.sign_out_everywhere')}
          </Button>
        </div>
      </Section>

      <Section title={t('settings.voice')}>
        <p className="text-ink-soft">{t('settings.voice_body')}</p>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-lavender-50 p-3">
          <code className="break-all text-sm">{quickUrl}</code>
          <CopyButton text={quickUrl} />
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>{t('settings.voice_ios')}</li>
          <li>{t('settings.voice_android')}</li>
        </ul>
        <Switch
          checked={quickSos}
          onChange={(v) => {
            setQuickSos(v);
            try {
              if (v) localStorage.setItem(QUICK_SOS_KEY, 'on');
              else localStorage.removeItem(QUICK_SOS_KEY);
            } catch {
              // ignore
            }
          }}
          label={t('settings.voice_enable')}
          description={t('settings.voice_enable_body')}
        />
      </Section>

      <Section title={t('settings.activity')}>
        <p className="text-sm text-muted">{t('settings.activity_body')}</p>
        {activity.data?.items?.length ? (
          <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {activity.data.items.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-medium">{t(`settings.actions.${a.action.replace('.', '_')}`)}</span>
                <span className="text-muted">
                  {formatDateTime(a.at, language)}
                  {a.device ? ` · ${a.device}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('settings.activity_empty')}</p>
        )}
      </Section>

      <Section title={t('settings.data')}>
        <div>
          <p className="font-medium">{t('settings.export')}</p>
          <p className="text-sm text-muted">{t('settings.export_body')}</p>
          <Button variant="secondary" icon={Download} className="mt-3" onClick={exportData} loading={exporting}>
            {t('settings.export')}
          </Button>
        </div>
        <DeleteAccount />
      </Section>

      <p className="text-center text-sm text-muted">
        <Link to="/privacy" className="hover:underline">
          {t('footer.privacy_policy')}
        </Link>
        {' · '}
        <Link to="/terms" className="hover:underline">
          {t('footer.terms')}
        </Link>
      </p>
    </div>
  );
}
