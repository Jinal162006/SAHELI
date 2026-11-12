import { HeartHandshake, KeyRound, ShieldCheck, UserPlus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Card, ConfirmDialog, CopyButton, Dialog, ErrorState, Field, Input, Loading, Notice, PageHeader, Switch, errorMessage } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi, useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

export const PERMISSIONS = ['sos_alerts', 'location_on_sos', 'checkins', 'live_location', 'safe_zones'];

function PermissionList({ permissions, onlyGranted = false }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-2">
      {PERMISSIONS.filter((p) => !onlyGranted || permissions[p]).map((p) => (
        <li key={p} className="flex gap-2">
          <ShieldCheck className={permissions[p] ? 'mt-0.5 size-4 shrink-0 text-safe-600' : 'mt-0.5 size-4 shrink-0 text-muted'} aria-hidden />
          <span>
            <span className={permissions[p] ? 'font-medium text-ink' : 'text-muted line-through'}>{t(`family.perm.${p}`)}</span>
            <span className="block text-sm text-muted">{t(`family.perm.${p}_body`)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function InviteDialog({ onClose }) {
  const { t, language } = useI18n();
  const [label, setLabel] = useState('');
  const [permissions, setPermissions] = useState({ sos_alerts: true, location_on_sos: true, checkins: true, live_location: true, safe_zones: true });
  const [invite, setInvite] = useState(null);
  const [state, setState] = useState({ busy: false, error: null });

  const create = async () => {
    setState({ busy: true, error: null });
    try {
      setInvite(await api('/api/guardian/invites', { method: 'POST', body: { child_label: label.trim(), permissions } }));
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  const display = invite ? `${invite.code.slice(0, 4)}-${invite.code.slice(4)}` : '';

  return (
    <Dialog
      open
      onClose={onClose}
      title={invite ? t('family.code_title') : t('family.invite_title')}
      footer={
        invite ? (
          <Button onClick={onClose}>{t('common.done')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={create} loading={state.busy} disabled={!label.trim()}>
              {t('family.create_code')}
            </Button>
          </>
        )
      }
    >
      {invite ? (
        <div className="space-y-4 text-center">
          <p className="font-mono text-4xl font-bold tracking-[0.2em] text-brand-800">{display}</p>
          <CopyButton text={display} />
          <p className="text-left text-ink-soft">{t('family.code_body', { time: formatDateTime(invite.expires_at, language) })}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-ink-soft">{t('family.invite_body')}</p>
          <Field label={t('family.invite_name')} htmlFor="invite-name">
            <Input id="invite-name" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <div>
            <p className="mb-3 text-sm font-semibold">{t('family.invite_permissions')}</p>
            <div className="space-y-4 rounded-xl bg-lavender-50 p-4">
              {PERMISSIONS.map((p) => (
                <Switch
                  key={p}
                  checked={permissions[p]}
                  onChange={(v) => setPermissions((current) => ({ ...current, [p]: v }))}
                  label={t(`family.perm.${p}`)}
                  description={t(`family.perm.${p}_body`)}
                />
              ))}
            </div>
          </div>
          {state.error ? <Notice tone="danger">{errorMessage(t, state.error)}</Notice> : null}
        </div>
      )}
    </Dialog>
  );
}

function AcceptDialog({ onClose, onAccepted }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState({ busy: false, error: null });

  const check = async () => {
    setState({ busy: true, error: null });
    try {
      setPreview(await api('/api/guardian/invites/preview', { method: 'POST', body: { code } }));
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  const accept = async () => {
    setState({ busy: true, error: null });
    try {
      await api('/api/guardian/invites/accept', { method: 'POST', body: { code } });
      onAccepted();
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={preview ? t('family.preview_title', { name: preview.guardian_name }) : t('family.accept_title')}
      footer={
        preview ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('family.decline')}
            </Button>
            <Button onClick={accept} loading={state.busy}>
              {t('family.accept')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={check} loading={state.busy} disabled={code.replace(/[^a-z0-9]/gi, '').length < 6}>
              {t('family.check_code')}
            </Button>
          </>
        )
      }
    >
      {preview ? (
        <div className="space-y-4">
          <p className="text-ink-soft">{t('family.preview_body', { name: preview.guardian_name })}</p>
          <PermissionList permissions={preview.permissions} onlyGranted />
          <Notice tone="neutral">{t('family.preview_not', { name: preview.guardian_name })}</Notice>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-ink-soft">{t('family.accept_body')}</p>
          <Field label={t('family.code_label')} htmlFor="link-code">
            <Input
              id="link-code"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={20}
              placeholder={t('family.code_placeholder')}
              className="font-mono tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
        </div>
      )}
      {state.error ? <Notice tone="danger" className="mt-4">{errorMessage(t, state.error)}</Notice> : null}
    </Dialog>
  );
}

export default function Family() {
  const { t, language } = useI18n();
  useDocumentTitle(t('family.title'));
  const { data, error, loading, reload } = useApi('/api/guardian/links');
  const [inviting, setInviting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [ending, setEnding] = useState(null);
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('family.title')}
        description={t('family.description')}
        actions={
          <>
            <Button icon={UserPlus} onClick={() => setInviting(true)}>
              {t('family.invite')}
            </Button>
            <Button variant="secondary" icon={KeyRound} onClick={() => setAccepting(true)}>
              {t('family.enter_code')}
            </Button>
          </>
        }
      />
      <Notice tone="neutral" icon={HeartHandshake} className="mb-6">
        {t('family.not_surveillance')}
      </Notice>
      {accepted ? <Notice tone="success" className="mb-4">{t('family.accepted')}</Notice> : null}

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">{t('family.as_guardian_title')}</h2>
            {data.as_guardian.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.as_guardian.map((link) => (
                  <li key={link.id}>
                    <Link to={`/guardian/${link.id}`} className="card flex items-center gap-3 p-4 hover:shadow-[var(--shadow-lift)]">
                      <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                        <UsersRound className="size-5" aria-hidden />
                      </span>
                      <span className="flex-1">
                        <span className="block font-semibold">{link.name}</span>
                        <span className="text-xs text-muted">{formatDateTime(link.since, language)}</span>
                      </span>
                      <Badge tone="brand">{t('family.open')}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-soft">{t('family.as_guardian_empty')}</p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">{t('family.as_child_title')}</h2>
            {data.as_child.length ? (
              <ul className="space-y-3">
                {data.as_child.map((link) => (
                  <li key={link.id}>
                    <Card className="space-y-4 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">{link.name}</p>
                        <Button variant="ghost" size="sm" onClick={() => setEnding(link)}>
                          {t('family.end_link')}
                        </Button>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-semibold text-ink-soft">{t('family.you_share')}</p>
                        <PermissionList permissions={link.permissions} />
                      </div>
                      <div>
                        <p className="mb-1 text-sm font-semibold text-ink-soft">{t('family.zones')}</p>
                        {link.zones.length ? (
                          <ul className="flex flex-wrap gap-2">
                            {link.zones.map((z) => (
                              <Badge key={z.id}>{z.name}</Badge>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted">{t('family.zones_none')}</p>
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-soft">{t('family.as_child_empty')}</p>
            )}
          </section>
        </div>
      )}

      {inviting ? <InviteDialog onClose={() => setInviting(false)} /> : null}
      {accepting ? (
        <AcceptDialog
          onClose={() => setAccepting(false)}
          onAccepted={() => {
            setAccepting(false);
            setAccepted(true);
            reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(ending)}
        onClose={() => setEnding(null)}
        onConfirm={async () => {
          await api(`/api/guardian/links/${ending.id}`, { method: 'DELETE' }).catch(() => {});
          setEnding(null);
          reload();
        }}
        title={t('family.end_link')}
        confirmLabel={t('family.end_link')}
      >
        {t('family.end_confirm')}
      </ConfirmDialog>
    </div>
  );
}
