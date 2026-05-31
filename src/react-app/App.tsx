import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, memo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bet62Intro } from './components/Bet62Intro';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
    },
  },
});

import { AuthProvider } from '@/react-app/contexts/AuthContext';
import { AppProvider, useApp } from '@/react-app/contexts/AppContext';
import { Header } from './components/Header';
import { ToastContainer } from './components/Toast';
import { Footer } from './components/Footer';
import { BackLink } from './components/BackLink';
import { SWUpdateBar } from './components/SWUpdateBar';
import { InstallBar } from './components/InstallBar';
import HomePage from './pages/Home';
import PaymentsPage from "./pages/PaymentsPage";
import WithdrawPage from "./pages/WithdrawPage";
import KycPage from "./pages/KycPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import WalletPage from "./pages/WalletPage";
import EventDetails from "./pages/EventDetails";
import EventStatsPage from "./pages/EventStatsPage";
import Promotions from "./pages/Promotions";
import WorldCupPage from "./pages/WorldCupPage";
import ProfilePage from "./pages/ProfilePage";
import MyBetsPage from "./pages/MyBetsPage";
import { AdminRoute } from './routes/AdminRoute';
import AdminKycPage from "./pages/AdminKycPage";
import AdminWithdrawalsPage from "./pages/AdminWithdrawalsPage";
import AdminPayoutsPage from "./pages/AdminPayoutsPage";
import MetricsPage from "./pages/Metrics";
import TradingPanelPage from "./pages/TradingPanelPage";
import AdminPanel from "./components/AdminPanel";
import AdminRisk from "./pages/AdminRisk";
import { AuthModal } from './components/AuthModal';
import { CookieBanner } from './components/CookieBanner';
import { MobileBetSlip } from './components/MobileBetSlip';
import { DashboardSidebar } from './components/DashboardSidebar';
import { ErrorBoundary } from './components/ErrorBoundary';

// Fade-only — near-instant, no blocking wait
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
};

const pageTrans = {
  duration: 0.18,
  ease: [0.25, 0.1, 0.25, 1.0] as const,
};

const eventVariants = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0 },
};

const eventTrans = {
  duration: 0.1,
  ease: [0.25, 0.1, 0.25, 1.0] as const,
};

export default function App() {
  const [showIntro, setShowIntro] = useState(() => {
    try { return !sessionStorage.getItem('bet62_intro_shown'); } catch { return true; }
  });

  useEffect(() => {
    if (showIntro) {
      try { sessionStorage.setItem('bet62_intro_shown', '1'); } catch { /* empty */ }
      const t = setTimeout(() => setShowIntro(false), 3200);
      return () => clearTimeout(t);
    }
  }, [showIntro]);

  useEffect(() => {
    try {
      const keys = Object.keys(localStorage || {});
      keys.forEach((k) => {
        if (
          k.startsWith('event_') ||
          k.startsWith('events_cache_') ||
          k.startsWith('odds_cache_') ||
          k.startsWith('upcoming_cache_')
        ) {
          try { localStorage.removeItem(k); } catch { /* empty */ }
        }
      });
      try { localStorage.removeItem('home:pregame:v2'); } catch { /* empty */ }
      try { if ((window as any).caches) (window as any).caches.delete('betarena-static-v1'); } catch { /* empty */ }
    } catch { /* empty */ }
  }, []);
  return (
    <ErrorBoundary>
      {showIntro && <Bet62Intro />}
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppProvider>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <InnerApp />
            </Router>
          </AppProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const InnerApp = memo(function InnerApp() {
  return (
    <>
      <Header />
      <AppContent />
      <Footer />
    </>
  );
});

function AppContent() {
  const { showAdminPanel, authModalOpen, authModalMode, authModalUserId, closeAuthModal, openAuthModal } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === '/login') {
      openAuthModal('login');
    } else if (location.pathname === '/register') {
      openAuthModal('register');
    }
  }, [location.pathname]);

  const handleCloseAuth = () => {
    closeAuthModal();
    if (location.pathname === '/login' || location.pathname === '/register') {
      try {
        if (window.history.length > 2) navigate(-1);
        else navigate('/');
      } catch {
        navigate('/');
      }
    }
  };

  if (showAdminPanel) {
    return <AdminPanel />;
  }

  const isEventPage = location.pathname.startsWith('/event/');
  const vars = isEventPage ? eventVariants : pageVariants;
  const trans = isEventPage ? eventTrans : pageTrans;

  return (
    <>
      <SWUpdateBar />
      <InstallBar />
      <CookieBanner />
      <BackLink />
      {authModalOpen && (
        <AuthModal
          mode={authModalMode}
          tempUserId={authModalUserId}
          onClose={handleCloseAuth}
          onLoginSuccess={() => {
            closeAuthModal();
            if (location.pathname === '/login' || location.pathname === '/register') {
              navigate('/');
            }
          }}
          onRequire2FA={(userId) => openAuthModal('2fa', userId)}
          onSwitchMode={(mode) => openAuthModal(mode)}
        />
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          variants={vars}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={trans}
          style={{ willChange: 'opacity, transform' }}
        >
          <Routes location={location}>
            <Route path="/" element={<HomePage mode="home" />} />
            <Route path="/live" element={<HomePage mode="live" />} />
            <Route path="/event/:id/stats" element={<EventStatsPage />} />
            <Route path="/event/:id" element={<EventDetails />} />
            <Route path="/deposit" element={<PaymentsPage />} />
            <Route path="/withdraw" element={<WithdrawPage />} />
            <Route path="/kyc" element={<KycPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/my-bets" element={<MyBetsPage />} />
            <Route path="/register" element={<HomePage mode="home" />} />
            <Route path="/login" element={<HomePage mode="home" />} />
            <Route path="/deposit-success" element={<DepositSuccess />} />
            <Route path="/promotions" element={<Promotions />} />
            <Route path="/copa-do-mundo" element={<WorldCupPage />} />
            <Route path="/admin/payouts" element={
              <AdminRoute><AdminPayoutsPage /></AdminRoute>
            } />
            <Route path="/metrics" element={
              <AdminRoute><MetricsPage /></AdminRoute>
            } />
            <Route path="/trading-panel" element={
              <AdminRoute><TradingPanelPage /></AdminRoute>
            } />
            <Route path="/admin/risk" element={
              <AdminRoute><AdminRisk /></AdminRoute>
            } />
            <Route path="/admin/kyc" element={
              <AdminRoute><AdminKycPage /></AdminRoute>
            } />
            <Route path="/admin/withdrawals" element={
              <AdminRoute><AdminWithdrawalsPage /></AdminRoute>
            } />
          </Routes>
        </motion.div>
      </AnimatePresence>

      <MobileBetSlip />
      <DashboardSidebar />
      <ToastContainer />
    </>
  );
}

function DepositSuccess() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-green-600">Depósito efetuado com sucesso!</h2>
      </div>
    </div>
  );
}
