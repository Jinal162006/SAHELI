import { BellOff, BellRing, Mail, MapPin, MapPinOff, Pencil, Phone, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Loading, Notice, PageHeader, Switch, errorMessage } from '../components/ui';
import { api } from '../lib/api';
import { useApi, useConfig, useDocumentTitle } from '../lib/hooks';
import { useI18n } from '../lib/i18n';

const EMPTY = { name: '', relationship: '', phone: '', email: '', notify_on_sos: true, share_location: true };

function ContactForm({ initial, onClose, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ ...EMPTY, ...initial, relationship: initial?.relationship ?? '', phone: initial?.phone ?? '', email: initial?.email ?? '' });
  const [state, setState] = useState({ busy: false, error: null });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.phone.trim() && !form.email.trim()) {
      setState({ busy: false, error: { code: 'no_contact_method', message: t('contacts.form.need_method') } });
      return;
    }
    setState({ busy: true, error: null });
    const body = {
      name: form.name.trim(),
      relationship: form.relationship.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notify_on_sos: form.notify_on_sos,
      share_location: form.share_location,
    };
    try {
      if (initial?.id) await api(`/api/contacts/${initial.id}`, { method: 'PUT', body });
      else await api('/api/contacts', { method: 'POST', body });
      onSaved();
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  const fieldError = (key) => state.error?.fields?.[key];

  return (
    <Dialog
      open
      onClose={onClose}
      title={initial?.id ? t('contacts.edit') : t('contacts.add')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="contact-form" loading={state.busy} disabled={!form.name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="contact-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('contacts.form.name')} htmlFor="c-name" error={fieldError('name')}>
          <Input id="c-name" maxLength={80} required value={form.name} onChange={set('name')} autoComplete="off" />
        </Field>
        <Field label={t('contacts.form.relationship')} htmlFor="c-rel" optional>
          <Input id="c-rel" maxLength={40} placeholder={t('contacts.form.relationship_placeholder')} value={form.relationship} onChange={set('relationship')} />
        </Field>
        <Field label={t('contacts.form.phone')} hint={t('contacts.form.phone_help')} htmlFor="c-phone" error={fieldError('phone')}>
          <Input id="c-phone" type="tel" inputMode="tel" maxLength={30} value={form.phone} onChange={set('phone')} autoComplete="off" />
        </Field>
        <Field label={t('contacts.form.email')} htmlFor="c-email" error={fieldError('email')} optional>
          <Input id="c-email" type="email" maxLength={320} value={form.email} onChange={set('email')} autoComplete="off" />
        </Field>
        <div className="space-y-4 rounded-xl bg-lavender-50 p-4">
          <Switch checked={form.notify_on_sos} onChange={(v) => setForm((f) => ({ ...f, notify_on_sos: v }))} label={t('contacts.form.notify')} />
          <Switch checked={form.share_location} onChange={(v) => setForm((f) => ({ ...f, share_location: v }))} label={t('contacts.form.location')} />
        </div>
        {state.error && !state.error.fields ? <Notice tone="danger">{state.error.code === 'no_contact_method' ? state.error.message : errorMessage(t, state.error)}</Notice> : null}
      </form>
    </Dialog>
  );
}

export default function Contacts() {
  const { t } = useI18n();
  const { features } = useConfig();
  useDocumentTitle(t('contacts.title'));
  const { data, error, loading, reload } = useApi('/api/contacts');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const items = data?.items ?? [];
  const atLimit = items.length >= (data?.max ?? 10);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('contacts.title')}
        description={t('contacts.description')}
        actions={
          <Button icon={Plus} onClick={() => setEditing({})} disabled={atLimit}>
            {t('contacts.add')}
          </Button>
        }
      />
      <Notice tone="neutral" title={t('contacts.what_they_get_title')} className="mb-4">
        {t('contacts.what_they_get')}
      </Notice>
      {features.email_alerts === false ? <Notice tone="info" className="mb-6">{t('contacts.email_off')}</Notice> : null}

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !items.length ? (
        <EmptyState icon={Users} title={t('contacts.empty_title')} action={<Button icon={Plus} onClick={() => setEditing({})}>{t('contacts.add')}</Button>}>
          {t('contacts.empty_body')}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {c.name}
                  {c.relationship ? <span className="font-normal text-muted"> · {c.relationship}</span> : null}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                  {c.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3.5" aria-hidden />
                      {c.phone}
                    </span>
                  ) : null}
                  {c.email ? (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="size-3.5" aria-hidden />
                      {c.email}
                    </span>
                  ) : null}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={c.notify_on_sos ? 'safe' : 'neutral'}>
                    {c.notify_on_sos ? <BellRing className="size-3" aria-hidden /> : <BellOff className="size-3" aria-hidden />}
                    {c.notify_on_sos ? t('contacts.alerts_on') : t('contacts.alerts_off')}
                  </Badge>
                  <Badge tone={c.share_location ? 'info' : 'neutral'}>
                    {c.share_location ? <MapPin className="size-3" aria-hidden /> : <MapPinOff className="size-3" aria-hidden />}
                    {c.share_location ? t('contacts.location_on') : t('contacts.location_off')}
                  </Badge>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(c)}>
                  {t('common.edit')}
                </Button>
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setRemoving(c)}>
                  {t('common.remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {atLimit ? <p className="mt-3 text-sm text-muted">{t('contacts.limit', { max: data?.max ?? 10 })}</p> : null}

      {editing ? (
        <ContactForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await api(`/api/contacts/${removing.id}`, { method: 'DELETE' }).catch(() => {});
          setRemoving(null);
          reload();
        }}
        title={t('common.remove')}
        confirmLabel={t('common.remove')}
      >
        {removing ? t('contacts.delete_confirm', { name: removing.name }) : null}
      </ConfirmDialog>
    </div>
  );
}
