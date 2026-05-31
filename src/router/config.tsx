import { lazy, Suspense } from 'react';
import { RouteObject } from 'react-router-dom';
import NotFound from '../pages/NotFound';

// Lazy‑load page components
const HomePage = lazy(() => import('../pages/home/page'));
const LoginPage = lazy(() => import('../pages/login/page'));
const RegisterPage = lazy(() => import('../pages/register/page'));
const LiveSportsPage = lazy(() => import('../pages/live-sports/page'));
const PromotionsPage = lazy(() => import('../pages/promotions/page'));
const DepositPage = lazy(() => import('../pages/deposit/page'));
const WalletPage = lazy(() => import('../pages/wallet/page'));
const WithdrawalPage = lazy(() => import('../pages/withdrawal/page'));
const ProfilePage = lazy(() => import('../pages/profile/page'));
const MyBetsPage = lazy(() => import('../pages/my-bets/page'));
const AdminPage = lazy(() => import('../pages/admin/page'));
const StatisticsPage = lazy(() => import('../pages/statistics/page'));
const TermsPage = lazy(() => import('../pages/terms/page'));
const PrivacyPage = lazy(() => import('../pages/privacy/page'));
const ResponsibleGamingPage = lazy(() => import('../pages/responsible-gaming/page'));
const FAQPage = lazy(() => import('../pages/faq/page'));
const PaymentSettingsPage = lazy(() => import('../pages/payment-settings/page'));
const VerificationPage = lazy(() => import('../pages/verification/page'));
const TransactionsPage = lazy(() => import('../pages/transactions/page'));
const MatchDetailsPage = lazy(() => import('../pages/match-details/page'));
const EngineDemoPage = lazy(() => import('../pages/engine-demo/page'));
const PaymentConfirmationPage = lazy(() => import('../pages/payment-confirmation/page'));
const ForgotPasswordPage = lazy(() => import('../pages/forgot-password/page'));

const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <HomePage />
      </Suspense>
    ),
  },
  {
    path: '/jogo/:matchId',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <MatchDetailsPage />
      </Suspense>
    ),
  },
  {
    path: '/match/:matchId',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <MatchDetailsPage />
      </Suspense>
    ),
  },
  {
    path: '/demo-engine',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <EngineDemoPage />
      </Suspense>
    ),
  },
  {
    path: '/login',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <ForgotPasswordPage />
      </Suspense>
    ),
  },
  {
    path: '/registro',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <RegisterPage />
      </Suspense>
    ),
  },
  {
    path: '/registrar',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <RegisterPage />
      </Suspense>
    ),
  },
  {
    path: '/desportos-ao-vivo',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <LiveSportsPage />
      </Suspense>
    ),
  },
  {
    path: '/promocoes',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <PromotionsPage />
      </Suspense>
    ),
  },
  {
    path: '/deposito',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <DepositPage />
      </Suspense>
    ),
  },
  {
    path: '/confirmacao-pagamento',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <PaymentConfirmationPage />
      </Suspense>
    ),
  },
  {
    path: '/carteira',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-900"></div>}>
        <WalletPage />
      </Suspense>
    ),
  },
  {
    path: '/levantamento',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <WithdrawalPage />
      </Suspense>
    ),
  },
  {
    path: '/perfil',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <ProfilePage />
      </Suspense>
    ),
  },
  {
    path: '/verificacao',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <VerificationPage />
      </Suspense>
    ),
  },
  // Rota de verificação de email removida a pedido do cliente
  {
    path: '/minhas-apostas',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <MyBetsPage />
      </Suspense>
    ),
  },
  {
    path: '/estatisticas',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <StatisticsPage />
      </Suspense>
    ),
  },
  {
    path: '/admin',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <AdminPage />
      </Suspense>
    ),
  },
  {
    path: '/admin/configuracoes-pagamento',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <PaymentSettingsPage />
      </Suspense>
    ),
  },
  {
    path: '/termos-e-condicoes',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <TermsPage />
      </Suspense>
    ),
  },
  {
    path: '/politica-de-privacidade',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <PrivacyPage />
      </Suspense>
    ),
  },
  {
    path: '/jogo-responsavel',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <ResponsibleGamingPage />
      </Suspense>
    ),
  },
  {
    path: '/faq',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <FAQPage />
      </Suspense>
    ),
  },
  {
    path: '/transacoes',
    element: (
      <Suspense fallback={<div className="min-h-screen bg-gray-950"></div>}>
        <TransactionsPage />
      </Suspense>
    ),
  },
  {
    path: '*',
    element: <NotFound />,
  },
];

export default routes;
