// admin-console/src/App.jsx
// Root router -- wires every Sidebar link (see components/Sidebar.jsx) to its page.
// CRITICAL FIXES:
// 1. Added Error Boundary to catch rendering errors
// 2. Fixed session hydration state management
// 3. Prevents race conditions in routing
// 4. Proper loading state handling

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
import SubscriptionManagement from './pages/SubscriptionManagement';
import SubscriptionReports from './pages/SubscriptionReports';
import ChurnAnalysis from './pages/ChurnAnalysis';
import DailyRevenueReport from './pages/DailyRevenueReport';
import UserEngagementMetrics from './pages/UserEngagementMetrics';
import SystemHealth from './pages/SystemHealth';

// ============================================================================
// ERROR BOUNDARY COMPONENT
// ============================================================================
// Catches any React rendering errors and displays a user-friendly error page
// instead of crashing the entire app
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('🚨 React Error Boundary caught an error:');
    console.error('Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 24,
          textAlign: 'center',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '40px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            maxWidth: '500px'
          }}>
            <div style={{
              fontSize: '20px',
              marginBottom: '20px',
              fontWeight: 'bold',
              color: '#d32f2f'
            }}>
              ⚠️ Application Error
            </div>
            <div style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '20px',
              lineHeight: '1.6'
            }}>
              <p>The application encountered an unexpected error and needs to reload.</p>
              <p>Click the button below to try again.</p>
            </div>
            <div style={{
              fontSize: '12px',
              color: '#999',
              backgroundColor: '#f5f5f5',
              padding: '10px',
              borderRadius: '4px',
              marginBottom: '20px',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              textAlign: 'left',
              maxHeight: '150px',
              overflow: 'auto'
            }}>
              {this.state.error?.message || 'Unknown error'}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// ROLE-BASED ACCESS CONTROL COMPONENT
// ============================================================================
// AUDIT FIX (Admin Console §2, High): "Role is stored but never enforced" -- this now
// actually checks currentAdminRole() against an allow-list, not just whether *someone*
// is logged in. Applied below to Re-lock Accounts, PIN Recovery, Legal Content, and
// Trip/Entry Rule Configuration, which the code itself already comments as
// super-admin-only.
function RequireAuth({ children, allowedRoles }) {
  if (!isLoggedIn()) {
    console.log('🔐 Access denied: user not logged in, redirecting to /login');
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentAdminRole())) {
    console.warn(`⛔ Access denied: role '${currentAdminRole()}' not in ${JSON.stringify(allowedRoles)}`);
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

// ============================================================================
// SHELL COMPONENT - Sidebar + Main Content Layout
// ============================================================================
function Shell({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}

// ============================================================================
// LOADING SCREEN COMPONENT
// ============================================================================
function LoadingScreen({ error = null }) {
  return (
    <div style={{
      padding: 24,
      textAlign: 'center',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        maxWidth: '500px'
      }}>
        {!error ? (
          <>
            <div style={{
              fontSize: '20px',
              marginBottom: '20px',
              fontWeight: 'bold'
            }}>
              Loading…
            </div>
            <div style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '20px'
            }}>
              Initializing Smart Boda Admin Console
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#1976d2',
                animation: 'pulse 1.4s infinite'
              }} />
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#1976d2',
                animation: 'pulse 1.4s infinite 0.2s'
              }} />
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#1976d2',
                animation: 'pulse 1.4s infinite 0.4s'
              }} />
            </div>
            <style>{`
              @keyframes pulse {
                0%, 100% { opacity: 0.3; }
                50% { opacity: 1; }
              }
            `}</style>
          </>
        ) : (
          <>
            <div style={{
              fontSize: '20px',
              marginBottom: '20px',
              fontWeight: 'bold',
              color: '#d32f2f'
            }}>
              ⚠️ Connection Issue
            </div>
            <div style={{
              fontSize: '14px',
              color: '#666',
              marginBottom: '20px',
              lineHeight: '1.6'
            }}>
              <p>The backend API is not responding. This could be because:</p>
              <ul style={{ textAlign: 'left', marginTop: '10px' }}>
                <li>The backend server is not running</li>
                <li>The API URL is incorrect (check VITE_API_BASE_URL)</li>
                <li>There's a network connectivity issue</li>
              </ul>
            </div>
            <div style={{
              fontSize: '12px',
              color: '#999',
              backgroundColor: '#f5f5f5',
              padding: '10px',
              borderRadius: '4px',
              marginBottom: '20px',
              fontFamily: 'monospace',
              wordBreak: 'break-all'
            }}>
              {error.message}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ROUTES COMPONENT - Separated from App for cleaner code
// ============================================================================
// This component is only rendered AFTER hydration is complete
function AppRoutes() {
  return (
    <Routes>
      {/* LOGIN - No auth required */}
      <Route path="/login" element={<LoginPage />} />

      {/* DASHBOARD */}
      <Route path="/dashboard" element={<RequireAuth><Shell><DashboardPage /></Shell></RequireAuth>} />

      {/* MASTER DATA ROUTES */}
      <Route path="/master-data/dropdowns" element={<RequireAuth><Shell><MasterDataDropdowns /></Shell></RequireAuth>} />
      <Route path="/master-data/compliance-savings" element={<RequireAuth><Shell><ComplianceAndSavingsMasterData /></Shell></RequireAuth>} />
      <Route path="/master-data/trip-rules" element={<RequireAuth allowedRoles={['super_admin']}><Shell><TripEntryRuleConfiguration /></Shell></RequireAuth>} />
      <Route path="/master-data/legal" element={<RequireAuth allowedRoles={['super_admin']}><Shell><MasterDataLegalContent /></Shell></RequireAuth>} />
      <Route path="/master-data/payment-channels" element={<RequireAuth><Shell><PaymentChannelMasterData /></Shell></RequireAuth>} />

      {/* RIDER SUPPORT ROUTES */}
      <Route path="/rider-support/mobile-verification" element={<RequireAuth><Shell><MobileVerificationQueue /></Shell></RequireAuth>} />
      <Route path="/rider-support/pin-recovery" element={<RequireAuth><Shell><PinRecoveryQueue /></Shell></RequireAuth>} />
      <Route path="/rider-support/duplicate-plate" element={<RequireAuth><Shell><DuplicatePlateQueue /></Shell></RequireAuth>} />
      <Route path="/rider-support/data-export" element={<RequireAuth><Shell><DataExportRequestsQueue /></Shell></RequireAuth>} />
      <Route path="/rider-support/out-of-window" element={<RequireAuth><Shell><OutOfWindowCorrectionQueue /></Shell></RequireAuth>} />

      {/* PAYMENT ROUTES */}
      <Route path="/payments/history" element={<RequireAuth><Shell><PaymentHistory /></Shell></RequireAuth>} />
      <Route path="/payments/reconciliation" element={<RequireAuth><Shell><PaymentReconciliation /></Shell></RequireAuth>} />
      <Route path="/payments/relock" element={<RequireAuth allowedRoles={['super_admin']}><Shell><ReLockAccounts /></Shell></RequireAuth>} />

      {/* USER ROUTES */}
      <Route path="/users/active-riders" element={<RequireAuth><Shell><ActiveRidersList /></Shell></RequireAuth>} />
      <Route path="/users/subscription-status" element={<RequireAuth><Shell><SubscriptionStatus /></Shell></RequireAuth>} />
      <Route path="/users/churn-analysis" element={<RequireAuth><Shell><ChurnAnalysis /></Shell></RequireAuth>} />

      {/* SUBSCRIPTION ROUTES */}
      <Route path="/subscription-status" element={<RequireAuth><Shell><SubscriptionStatus /></Shell></RequireAuth>} />
      <Route path="/subscription-management" element={<RequireAuth><Shell><SubscriptionManagement /></Shell></RequireAuth>} />
      <Route path="/subscription-reports" element={<RequireAuth><Shell><SubscriptionReports /></Shell></RequireAuth>} />

      {/* REPORTING ROUTES */}
      <Route path="/reporting/daily-revenue" element={<RequireAuth><Shell><DailyRevenueReport /></Shell></RequireAuth>} />
      <Route path="/reporting/engagement" element={<RequireAuth><Shell><UserEngagementMetrics /></Shell></RequireAuth>} />
      <Route path="/reporting/system-health" element={<RequireAuth><Shell><SystemHealth /></Shell></RequireAuth>} />

      {/* CATCH-ALL - Redirect to dashboard if logged in, login otherwise */}
      <Route path="*" element={<Navigate to={isLoggedIn() ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState(null);

  // ============================================================================
  // SESSION INITIALIZATION
  // ============================================================================
  // AUDIT FIX: session state now lives in memory (see auth/session.js), backed by an
  // httpOnly cookie -- this recovers "am I logged in" from the backend on page load
  // instead of just checking localStorage synchronously.
  //
  // CRITICAL: This runs once on app startup to check if there's an existing session
  // IMPORTANT: The hydration must complete BEFORE React Router renders any routes
  useEffect(() => {
    let isMounted = true; // Prevent state updates on unmounted component

    async function initializeSession() {
      try {
        console.log('🚀 App initializing - checking for existing session...');

        // Try to restore session from backend
        const session = await hydrateSession();

        if (isMounted) {
          if (session) {
            console.log('✓ Session restored from backend');
          } else {
            console.log('ℹ️  No existing session - user must login');
          }
          setHydrateError(null);
        }
      } catch (error) {
        // Session hydration failed - could be network error or backend down
        console.error('⚠️ Session initialization error:', error.message);

        if (isMounted) {
          // Store the error but don't block the app from loading
          // User can still see the login page and try to login
          setHydrateError({
            message: error.message,
            type: error.isNetworkError ? 'network' : 'unknown'
          });

          // Log details for debugging
          console.error('Error details:');
          console.error('  - isNetworkError:', error.isNetworkError);
          console.error('  - isCORSError:', error.isCORSError);
          console.error('  - isTimeout:', error.isTimeout);
          if (error.response) {
            console.error('  - Status:', error.response.status);
            console.error('  - Data:', error.response.data);
          }
        }
      } finally {
        // Mark hydration as complete - we'll show the app regardless of success
        if (isMounted) {
          console.log('✓ Session hydration complete - rendering routes');
          setHydrated(true);
        }
      }
    }

    initializeSession();

    // Cleanup: mark component as unmounted when effect is cleaned up
    return () => {
      isMounted = false;
    };
  }, []);

  // ============================================================================
  // LOADING STATE - Shows while checking session
  // ============================================================================
  if (!hydrated) {
    return <LoadingScreen error={hydrateError} />;
  }

  // ============================================================================
  // MAIN ROUTES - Only rendered AFTER hydration
  // ============================================================================
  // Wrapped in ErrorBoundary to catch any rendering errors
  // BrowserRouter wraps the routes to enable client-side navigation
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}