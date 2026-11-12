import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Chips, Field, Input, Notice } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { AuthLayout, authErrorMessage } from './AuthLayout';

import { PENDING_AGE_KEY as PENDING_AGE } from '../../lib/constants';

export default function SignUp() {
  const t = useT();
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError(t('auth.password_short'));
      return;
    }
    setBusy(true);
    // The home screen applies this once the new account is signed in (now, or after email
    // confirmation). If storage is blocked, the age question is simply asked again there.
    try {
      if (age) localStorage.setItem(PENDING_AGE, age);
    } catch {
      // ignore
    }
    try {
      const { needsConfirmation } = await signUp(email.trim(), password, `${window.location.origin}/home`);
      if (needsConfirmation) {
        setSent(true);
        return;
      }
      const next = params.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/home', { replace: true });
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title={t('auth.check_email_title')}>
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            <MailCheck className="size-7" aria-hidden />
          </span>
          <p className="text-ink-soft">{t('auth.check_email_body', { email })}</p>
        </div>
      </AuthLayout>
    );
  }
  const ageOptions = [
    { value: '13_17', label: t('auth.age_13_17') },
    { value: '18_plus', label: t('auth.age_18_plus') },
    { value: 'under_13', label: t('auth.age_under_13') },
  ];

  return (
    <AuthLayout
      title={t('auth.sign_up_title')}
      description={t('auth.sign_up_body')}
      footer={
        <>
          {t('auth.have_account')}{' '}
          <Link to="/sign-in" className="font-semibold text-brand-700 hover:underline">
            {t('auth.sign_in')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
        <Field label={t('auth.email')} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')} hint={t('auth.password_hint')} htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t('auth.age_label')} hint={t('auth.age_hint')}>
          <Chips options={ageOptions} value={age} onChange={setAge} label={t('auth.age_label')} />
        </Field>
        {age === 'under_13' ? <Notice tone="info">{t('auth.under_13_note')}</Notice> : null}
        <Button type="submit" className="w-full" loading={busy} disabled={!email || !password}>
          {t('auth.sign_up')}
        </Button>
        <p className="text-center text-xs text-muted">
          <TermsLine />
        </p>
      </form>
    </AuthLayout>
  );
}

function TermsLine() {
  const t = useT();
  const template = t('auth.terms_agree');
  const [before, rest] = template.split('{terms}');
  const [middle, after] = (rest ?? '').split('{privacy}');
  return (
    <>
      {before}
      <Link to="/terms" className="underline">
        {t('footer.terms')}
      </Link>
      {middle}
      <Link to="/privacy" className="underline">
        {t('footer.privacy_policy')}
      </Link>
      {after}
    </>
  );
}
