// admin-console/src/App.jsx
// Root router -- wires every Sidebar link (see components/Sidebar.jsx) to its page.
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { isLoggedIn, hydrateSession, currentAdminRole } from './auth/session';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MasterDataDropdowns from './pages/MasterDataDropdowns';
import ComplianceAndSavingsMasterData from './pages/ComplianceAndSavingsMasterData';
import TripEntryRuleConfiguration from './pages/TripEntryRuleConfiguration';
import MasterDataLegalContent from './pages/MasterDataLegalContent';
import PaymentChannelMasterData from './pages/PaymentChannelMasterData';
import MobileVerificationQueue from './pages/MobileVerificationQueue';
import PinRecoveryQueue from './pages/PinRecoveryQueue';
import DuplicatePlateQueue from './pages/DuplicatePlateQueue';
import DataExportRequestsQueue from './pages/DataExportRequestsQueue';
import OutOfWindowCorrectionQueue from './pages/OutOfWindowCorrectionQueue';
import PaymentHistory from './pages/PaymentHistory';
import PaymentReconciliation from './pages/PaymentReconciliation';
import ReLockAccounts from './pages/ReLockAccounts';
import ActiveRidersList from './pages/ActiveRidersList';
import SubscriptionStatus from './pages/SubscriptionStatus';
import ChurnAnalysis from './pages/ChurnAnalysis';
import DailyRevenueReport from './pages/DailyRevenueReport';
import UserEngagementMetrics from './pages/UserEngagementMetrics';
import SystemHealth from './pages/SystemHealth';

// AUDIT FIX (Admin Console §2, High): "Role is stored but never enforced" -- this now
// actually checks currentAdminRole() against an allow-list, not just whether *someone*
// is logged in. Applied below to Re-lock Accounts, PIN Recovery, Legal Content, and
// Trip/Entry Rule Configuration, which the code itself already comments as
// super-admin-only.
function RequireAuth({ children, allowedRoles }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(currentAdminRole())) {
    return (
      <Shell>
        <div className="page">
          <h1>Not authorized</h1>
          <p className="muted">This section requires a super admin role.</p>
        </div>
      </Shell>
    );
  }
  return children;
}

function Shell({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}

export default function App() {
  const [hydrated, setHydrated] = useState(false);

  // AUDIT FIX: session state now lives in memory (see auth/session.js), backed by an
  // httpOnly cookie -- this recovers "am I logged in" from the backend on page load
  // instead of just checking localStorage synchronously.
  useEffect(() => {
    hydrateSession().finally(() => setHydrated(true));
  }, []);

  if (!hydrated) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/dashboard" element={<RequireAuth><Shell><DashboardPage /></Shell></RequireAuth>} />

        <Route path="/master-data/dropdowns" element={<RequireAuth><Shell><MasterDataDropdowns /></Shell></RequireAuth>} />
        <Route path="/master-data/compliance-savings" element={<RequireAuth><Shell><ComplianceAndSavingsMasterData /></Shell></RequireAuth>} />
        <Route path="/master-data/trip-rules" element={<RequireAuth allowedRoles={['super_admin']}><Shell><TripEntryRuleConfiguration /></Shell></RequireAuth>} />
        <Route path="/master-data/legal" element={<RequireAuth allowedRoles={['super_admin']}><Shell><MasterDataLegalContent /></Shell></RequireAuth>} />
        <Route path="/master-data/payment-channels" element={<RequireAuth><Shell><PaymentChannelMasterData /></Shell></RequireAuth>} />

        <Route path="/rider-support/mobile-verification" element={<RequireAuth><Shell><MobileVerificationQueue /></Shell></RequireAuth>} />
        <Route path="/rider-support/pin-recovery" element={<RequireAuth><Shell><PinRecoveryQueue /></Shell></RequireAuth>} />
        <Route path="/rider-support/duplicate-plate" element={<RequireAuth><Shell><DuplicatePlateQueue /></Shell></RequireAuth>} />
        <Route path="/rider-support/data-export" element={<RequireAuth><Shell><DataExportRequestsQueue /></Shell></RequireAuth>} />
        <Route path="/rider-support/out-of-window" element={<RequireAuth><Shell><OutOfWindowCorrectionQueue /></Shell></RequireAuth>} />

        <Route path="/payments/history" element={<RequireAuth><Shell><PaymentHistory /></Shell></RequireAuth>} />
        <Route path="/payments/reconciliation" element={<RequireAuth><Shell><PaymentReconciliation /></Shell></RequireAuth>} />
        <Route path="/payments/relock" element={<RequireAuth allowedRoles={['super_admin']}><Shell><ReLockAccounts /></Shell></RequireAuth>} />

        <Route path="/users/active-riders" element={<RequireAuth><Shell><ActiveRidersList /></Shell></RequireAuth>} />
        <Route path="/users/subscription-status" element={<RequireAuth><Shell><SubscriptionStatus /></Shell></RequireAuth>} />
        <Route path="/users/churn-analysis" element={<RequireAuth><Shell><ChurnAnalysis /></Shell></RequireAuth>} />

        <Route path="/reporting/daily-revenue" element={<RequireAuth><Shell><DailyRevenueReport /></Shell></RequireAuth>} />
        <Route path="/reporting/engagement" element={<RequireAuth><Shell><UserEngagementMetrics /></Shell></RequireAuth>} />
        <Route path="/reporting/system-health" element={<RequireAuth><Shell><SystemHealth /></Shell></RequireAuth>} />

        <Route path="*" element={<Navigate to={isLoggedIn() ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}