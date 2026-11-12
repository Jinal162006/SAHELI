import { ArrowLeft, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  Loading,
  Notice,
  PageHeader,
  Select,
  Textarea,
  errorMessage,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useApi, useConfig, useDocumentTitle } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

export const INCIDENT_TYPES = [
  'romance_scam', 'sextortion', 'financial_fraud', 'harassment', 'stalking',
  'identity_misuse', 'phishing', 'grooming', 'threats', 'other',
];

const EMPTY_DETAILS = {
  summary: '',
  timeline: [],
  people: [],
  financial_loss: { amount: '', currency: 'INR', method: '', transaction_refs: '', date: '', bank_informed: false },
  narrative: '',
  notes: '',
  reported_to: [],
};
const EMPTY_PERSON = { name: '', handle: '', platform: '', profile_url: '', phone: '', payment_ids: '', role: '' };

function SectionCard({ title, help, children }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {help ? <p className="mt-1 text-sm text-muted">{help}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

export default function ReportEditor() {
  const { id } = useParams();
  const isNew = !id;
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { features } = useConfig();
  useDocumentTitle(isNew ? t('reports.editor.new_title') : t('reports.editor.edit_title'));

  const existing = useApi(isNew ? null : `/api/incidents/${id}`);
  const vault = useApi('/api/evidence');
  const [form, setForm] = useState({ incident_type: location.state?.incident_type ?? 'other', title: '', details: EMPTY_DETAILS, evidence_ids: [] });
  const [state, setState] = useState({ busy: false, error: null });
  const [draft, setDraft] = useState({ busy: false, error: null, result: null });
  const [confirming, setConfirming] = useState(false);
  const [savedId, setSavedId] = useState(id ?? null);

  useEffect(() => {
    if (existing.data) {
      setForm({
        incident_type: existing.data.incident_type,
        title: existing.data.title,
        details: { ...EMPTY_DETAILS, ...existing.data.details, financial_loss: { ...EMPTY_DETAILS.financial_loss, ...existing.data.details.financial_loss } },
        evidence_ids: existing.data.evidence.map((e) => e.id),
      });
    }
  }, [existing.data]);

  const setDetail = (key, value) => setForm((f) => ({ ...f, details: { ...f.details, [key]: value } }));
  const setLoss = (key, value) => setDetail('financial_loss', { ...form.details.financial_loss, [key]: value });
  const updateList = (key, index, patch) => setDetail(key, form.details[key].map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const removeFromList = (key, index) => setDetail(key, form.details[key].filter((_, i) => i !== index));

  const save = async (andView = false) => {
    if (!form.title.trim()) {
      setState({ busy: false, error: { message: t('reports.editor.required_title') } });
      return null;
    }
    setState({ busy: true, error: null });
    try {
      const body = { ...form, title: form.title.trim() };
      const saved = savedId
        ? await api(`/api/incidents/${savedId}`, { method: 'PUT', body })
        : await api('/api/incidents', { method: 'POST', body });
      if (!savedId) {
        setSavedId(saved.id);
        // Keep editing in place; update the address so a reload opens this report.
        window.history.replaceState(window.history.state, '', `/reports/${saved.id}/edit`);
      }
      setState({ busy: false, error: null, saved: true });
      if (andView) navigate(`/reports/${saved.id}`);
      return saved;
    } catch (error) {
      setState({ busy: false, error });
      return null;
    }
  };

  const requestDraft = async () => {
    setDraft({ busy: true, error: null, result: null });
    const saved = await save(false);
    if (!saved) {
      setDraft({ busy: false, error: null, result: null });
      return;
    }
    try {
      const result = await api(`/api/incidents/${saved.id}/draft`, { method: 'POST', body: { language } });
      setDraft({ busy: false, error: null, result });
    } catch (error) {
      setDraft({ busy: false, error, result: null });
    }
  };

  const remove = async () => {
    await api(`/api/incidents/${savedId}`, { method: 'DELETE' });
    navigate('/reports', { replace: true });
  };

  if (!isNew && existing.loading) return <Loading />;
  if (!isNew && existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;

  const d = form.details;
  const vaultItems = vault.data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to={isNew ? '/reports' : `/reports/${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t('reports.title')}
      </Link>
      <PageHeader title={isNew ? t('reports.editor.new_title') : t('reports.editor.edit_title')} description={t('reports.not_police')} />
      {state.saved ? <Notice tone="success">{t('reports.editor.saved')}</Notice> : null}

      <SectionCard title={t('reports.editor.type')}>
        <Field label={t('reports.editor.type')} htmlFor="r-type">
          <Select id="r-type" value={form.incident_type} onChange={(e) => setForm({ ...form, incident_type: e.target.value })}>
            {INCIDENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`reports.types.${type}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('reports.editor.title')} htmlFor="r-title">
          <Input id="r-title" maxLength={200} placeholder={t('reports.editor.title_placeholder')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label={t('reports.editor.summary')} hint={t('reports.editor.summary_help')} htmlFor="r-summary">
          <Textarea id="r-summary" rows={4} maxLength={5000} value={d.summary} onChange={(e) => setDetail('summary', e.target.value)} />
        </Field>
      </SectionCard>

      <SectionCard title={t('reports.editor.timeline')} help={t('reports.editor.timeline_help')}>
        {d.timeline.map((entry, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[10rem_1fr_auto]">
            <Input aria-label={t('reports.editor.timeline_when')} placeholder={t('reports.editor.timeline_when_placeholder')} maxLength={40} value={entry.when} onChange={(e) => updateList('timeline', i, { when: e.target.value })} />
            <Textarea aria-label={t('reports.editor.timeline_what')} rows={2} maxLength={2000} value={entry.what} onChange={(e) => updateList('timeline', i, { what: e.target.value })} />
            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => removeFromList('timeline', i)} aria-label={t('common.remove')} />
          </div>
        ))}
        <Button variant="soft" size="sm" icon={Plus} onClick={() => setDetail('timeline', [...d.timeline, { when: '', what: '' }])}>
          {t('reports.editor.add_moment')}
        </Button>
      </SectionCard>

      <SectionCard title={t('reports.editor.people')} help={t('reports.editor.people_help')}>
        {d.people.map((person, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-line p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['name', 'person_name', 120],
                ['handle', 'person_handle', 120],
                ['platform', 'person_platform', 60],
                ['profile_url', 'person_url', 500],
                ['phone', 'person_phone', 40],
                ['role', 'person_role', 120],
              ].map(([key, label, max]) => (
                <Field key={key} label={t(`reports.editor.${label}`)} htmlFor={`p-${i}-${key}`}>
                  <Input id={`p-${i}-${key}`} maxLength={max} value={person[key]} onChange={(e) => updateList('people', i, { [key]: e.target.value })} />
                </Field>
              ))}
            </div>
            <Field label={t('reports.editor.person_payment')} htmlFor={`p-${i}-pay`}>
              <Input id={`p-${i}-pay`} maxLength={300} value={person.payment_ids} onChange={(e) => updateList('people', i, { payment_ids: e.target.value })} />
            </Field>
            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => removeFromList('people', i)}>
              {t('common.remove')}
            </Button>
          </div>
        ))}
        <Button variant="soft" size="sm" icon={Plus} onClick={() => setDetail('people', [...d.people, { ...EMPTY_PERSON }])}>
          {t('reports.editor.add_person')}
        </Button>
      </SectionCard>

      <SectionCard title={t('reports.editor.money')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('reports.editor.money_amount')} htmlFor="m-amount">
            <Input id="m-amount" inputMode="decimal" maxLength={20} value={d.financial_loss.amount} onChange={(e) => setLoss('amount', e.target.value)} />
          </Field>
          <Field label={t('reports.editor.money_method')} htmlFor="m-method" className="sm:col-span-2">
            <Input id="m-method" maxLength={60} placeholder={t('reports.editor.money_method_placeholder')} value={d.financial_loss.method} onChange={(e) => setLoss('method', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('reports.editor.money_refs')} htmlFor="m-refs" className="sm:col-span-2">
            <Input id="m-refs" maxLength={500} value={d.financial_loss.transaction_refs} onChange={(e) => setLoss('transaction_refs', e.target.value)} />
          </Field>
          <Field label={t('reports.editor.money_date')} htmlFor="m-date">
            <Input id="m-date" maxLength={40} value={d.financial_loss.date} onChange={(e) => setLoss('date', e.target.value)} />
          </Field>
        </div>
        <Checkbox label={t('reports.editor.money_bank_informed')} checked={d.financial_loss.bank_informed} onChange={(e) => setLoss('bank_informed', e.target.checked)} />
      </SectionCard>

      <SectionCard title={t('reports.editor.narrative')} help={t('reports.editor.narrative_help')}>
        <Textarea aria-label={t('reports.editor.narrative')} rows={8} maxLength={10000} value={d.narrative} onChange={(e) => setDetail('narrative', e.target.value)} />
        {features.ai ? (
          <Button variant="soft" icon={Sparkles} onClick={requestDraft} loading={draft.busy}>
            {draft.busy ? t('reports.editor.drafting') : t('reports.editor.draft')}
          </Button>
        ) : (
          <p className="text-sm text-muted">{t('reports.editor.draft_unavailable')}</p>
        )}
        {draft.error ? <Notice tone="danger">{draft.error.status === 503 ? t('reports.editor.draft_unavailable') : errorMessage(t, draft.error)}</Notice> : null}
        {draft.result ? (
          <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
            <p className="text-sm font-semibold text-brand-800">{t('reports.editor.draft_review')}</p>
            <p className="whitespace-pre-wrap text-ink">{draft.result.narrative}</p>
            {draft.result.missing?.length ? (
              <div>
                <p className="text-sm font-semibold">{t('reports.editor.draft_missing')}</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-soft">
                  {draft.result.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button size="sm" onClick={() => { setDetail('narrative', draft.result.narrative); setDraft({ busy: false, error: null, result: null }); }}>
              {t('reports.editor.draft_use')}
            </Button>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={t('reports.editor.evidence')} help={t('reports.editor.evidence_help')}>
        {vault.loading ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : vaultItems.length ? (
          <ul className="space-y-2">
            {vaultItems.map((item) => (
              <li key={item.id}>
                <Checkbox
                  label={item.title}
                  description={t(`vault.kinds.${item.kind}`)}
                  checked={form.evidence_ids.includes(item.id)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      evidence_ids: e.target.checked ? [...f.evidence_ids, item.id] : f.evidence_ids.filter((x) => x !== item.id),
                    }))
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            {t('reports.editor.evidence_none')}{' '}
            <Link to="/vault" className="font-semibold text-brand-700 hover:underline">
              {t('nav.vault')}
            </Link>
          </p>
        )}
      </SectionCard>

      <SectionCard title={t('reports.editor.reported')}>
        {d.reported_to.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_8rem_auto]">
            <Input aria-label={t('reports.editor.reported_where')} placeholder={t('reports.editor.reported_where')} maxLength={120} value={r.where} onChange={(e) => updateList('reported_to', i, { where: e.target.value })} />
            <Input aria-label={t('reports.editor.reported_ref')} placeholder={t('reports.editor.reported_ref')} maxLength={120} value={r.reference} onChange={(e) => updateList('reported_to', i, { reference: e.target.value })} />
            <Input aria-label={t('reports.editor.reported_date')} placeholder={t('reports.editor.reported_date')} maxLength={40} value={r.date} onChange={(e) => updateList('reported_to', i, { date: e.target.value })} />
            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => removeFromList('reported_to', i)} aria-label={t('common.remove')} />
          </div>
        ))}
        <Button variant="soft" size="sm" icon={Plus} onClick={() => setDetail('reported_to', [...d.reported_to, { where: '', reference: '', date: '' }])}>
          {t('reports.editor.add_reported')}
        </Button>
      </SectionCard>

      <SectionCard title={t('reports.editor.notes')}>
        <Textarea aria-label={t('reports.editor.notes')} rows={3} maxLength={5000} value={d.notes} onChange={(e) => setDetail('notes', e.target.value)} />
      </SectionCard>

      {state.error ? <Notice tone="danger">{state.error.message && !state.error.code ? state.error.message : errorMessage(t, state.error)}</Notice> : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save(true)} loading={state.busy}>
          {t('reports.editor.save')}
        </Button>
        {savedId ? (
          <Button variant="danger-soft" icon={Trash2} onClick={() => setConfirming(true)}>
            {t('reports.editor.delete')}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={remove} title={t('reports.editor.delete')} confirmLabel={t('common.delete')}>
        {t('reports.editor.delete_confirm')}
      </ConfirmDialog>
    </div>
  );
}
