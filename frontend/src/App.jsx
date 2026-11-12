import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { PublicLayout } from './components/layout/PublicLayout';
import { Loading } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './lib/auth';
import { AuthUnavailable } from './pages/auth/AuthUnavailable';

const Landing = lazy(() => import('./pages/Landing'));
const SignIn = lazy(() => import('./pages/auth/SignIn'));
const SignUp = lazy(() => import('./pages/auth/SignUp'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Safety = lazy(() => import('./pages/Safety'));
const CheckHub = lazy(() => import('./pages/CheckHub'));
const CheckConversation = lazy(() => import('./pages/check/CheckConversation'));
const CheckLink = lazy(() => import('./pages/check/CheckLink'));
const CheckImage = lazy(() => import('./pages/check/CheckImage'));
const CheckProfile = lazy(() => import('./pages/check/CheckProfile'));
const Companion = lazy(() => import('./pages/Companion'));
const Vault = lazy(() => import('./pages/vault/Vault'));
const VaultItem = lazy(() => import('./pages/vault/VaultItem'));
const Reports = lazy(() => import('./pages/reports/Reports'));
const ReportEditor = lazy(() => import('./pages/reports/ReportEditor'));
const ReportView = lazy(() => import('./pages/reports/ReportView'));
const Contacts = lazy(() => import('./pages/Contacts'));
const Emergency = lazy(() => import('./pages/Emergency'));
const StatusPage = lazy(() => import('./pages/StatusPage'));
const SafeMeeting = lazy(() => import('./pages/SafeMeeting'));
const Family = lazy(() => import('./pages/family/Family'));
const GuardianView = lazy(() => import('./pages/family/GuardianView'));
const CheckIn = lazy(() => import('./pages/family/CheckIn'));
const Devices = lazy(() => import('./pages/Devices'));
const WatchApp = lazy(() => import('./pages/watch/WatchApp'));
const Help = lazy(() => import('./pages/help/Help'));
const PrivateImageHelp = lazy(() => import('./pages/help/PrivateImageHelp'));
const Settings = lazy(() => import('./pages/Settings'));
const Privacy = lazy(() => import('./pages/legal/Privacy'));
const Terms = lazy(() => import('./pages/legal/Terms'));
const Contact = lazy(() => import('./pages/legal/Contact'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Page({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'unavailable') return <AuthUnavailable />;
  if (status !== 'signed_in') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  return <AppShell />;
}

/** Pages that work signed in or out: they sit in the app shell when signed in. */
function AdaptiveLayout() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'signed_in') return <AppShell />;
  return <PublicLayout contained />;
}

function GuestOnly() {
  const { status, recovering } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'signed_in' && !recovering && location.pathname !== '/reset-password') {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/home'} replace />;
  }
  return <Outlet />;
}

const p = (element) => <Page>{element}</Page>;

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [{ path: '/', element: p(<Landing />) }],
  },
  {
    element: <GuestOnly />,
    children: [
      { path: '/sign-in', element: p(<SignIn />) },
      { path: '/sign-up', element: p(<SignUp />) },
      { path: '/forgot-password', element: p(<ForgotPassword />) },
    ],
  },
  { path: '/reset-password', element: p(<ResetPassword />) },
  {
    element: <AdaptiveLayout />,
    children: [
      { path: '/check/conversation', element: p(<CheckConversation />) },
      { path: '/check/link', element: p(<CheckLink />) },
      { path: '/check/profile', element: p(<CheckProfile />) },
      { path: '/sos', element: p(<Emergency />) },
      { path: '/help', element: p(<Help />) },
      { path: '/help/private-images', element: p(<PrivateImageHelp />) },
      { path: '/privacy', element: p(<Privacy />) },
      { path: '/terms', element: p(<Terms />) },
      { path: '/contact', element: p(<Contact />) },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/home', element: p(<Dashboard />) },
      { path: '/safety', element: p(<Safety />) },
      { path: '/check', element: p(<CheckHub />) },
      { path: '/check/image', element: p(<CheckImage />) },
      { path: '/companion', element: p(<Companion />) },
      { path: '/vault', element: p(<Vault />) },
      { path: '/evidence', element: p(<Vault />) },
      { path: '/vault/:id', element: p(<VaultItem />) },
      { path: '/reports', element: p(<Reports />) },
      { path: '/reports/new', element: p(<ReportEditor />) },
      { path: '/reports/:id', element: p(<ReportView />) },
      { path: '/reports/:id/edit', element: p(<ReportEditor />) },
      { path: '/contacts', element: p(<Contacts />) },
      { path: '/meeting', element: p(<SafeMeeting />) },
      { path: '/family', element: p(<Family />) },
      { path: '/guardian/:linkId', element: p(<GuardianView />) },
      { path: '/checkin', element: p(<CheckIn />) },
      { path: '/devices', element: p(<Devices />) },
      { path: '/settings', element: p(<Settings />) },
      { path: '/emergency', element: <Navigate to="/sos" replace /> },
    ],
  },
  { path: '/s/:token', element: p(<StatusPage />) },
  { path: '/watch', element: p(<WatchApp />) },
  { element: <PublicLayout contained />, children: [{ path: '*', element: p(<NotFound />) }] },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
