import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import MultiChart from './pages/MultiChart';
import Backtest from './pages/Backtest';
import TradingDashboard from './pages/TradingDashboard';
import LiveTrading from './pages/LiveTrading.jsx';
import ApiSettings from './pages/ApiSettings.jsx';
import Pricing from './pages/Pricing.jsx';
import AdminSubscriptions from './pages/AdminSubscriptions.jsx';
import AlertSettings from './pages/AlertSettings.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Allow landing & auth pages without authentication
  const publicPaths = ['/', '/landing', '/login', '/register', '/forgot-password', '/reset-password'];
  const isLandingPage = publicPaths.includes(window.location.pathname);

  // Show loading spinner while checking app public settings or auth (skip for public pages)
  if (!isLandingPage && (isLoadingPublicSettings || isLoadingAuth)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors (skip for landing page)
  if (!isLandingPage && authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/MultiChart" element={<LayoutWrapper currentPageName="MultiChart"><MultiChart /></LayoutWrapper>} />
      <Route path="/TradingDashboard" element={<LayoutWrapper currentPageName="TradingDashboard"><TradingDashboard /></LayoutWrapper>} />
      <Route path="/Backtest" element={<LayoutWrapper currentPageName="Backtest"><Backtest /></LayoutWrapper>} />
      <Route path="/LiveTrading" element={<LayoutWrapper currentPageName="LiveTrading"><LiveTrading /></LayoutWrapper>} />
      <Route path="/ApiSettings" element={<LayoutWrapper currentPageName="ApiSettings"><ApiSettings /></LayoutWrapper>} />
      <Route path="/Pricing" element={<LayoutWrapper currentPageName="Pricing"><Pricing /></LayoutWrapper>} />
      <Route path="/AdminSubscriptions" element={<LayoutWrapper currentPageName="AdminSubscriptions"><AdminSubscriptions /></LayoutWrapper>} />
      <Route path="/AlertSettings" element={<LayoutWrapper currentPageName="AlertSettings"><AlertSettings /></LayoutWrapper>} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/Dashboard" element={<LayoutWrapper currentPageName="Dashboard"><MainPage /></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App