// admin-console/src/components/Sidebar.jsx
// Matches the exact Super Admin Console menu structure you specified.
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { currentAdminName, currentAdminRole, logout } from '../auth/session';

const SECTIONS = [
  { label: '📊 Dashboard', items: [{ to: '/dashboard', label: 'Main Stats Dashboard' }] },
  {
    label: '🏗️ Master Data & Configuration',
    items: [
      { to: '/master-data/dropdowns', label: 'Dropdowns (6 tabs)' },
      { to: '/master-data/compliance-savings', label: 'Compliance & Savings Master Data' },
      { to: '/master-data/trip-rules', label: 'Trip & Entry Rules' },
      { to: '/master-data/legal', label: 'Legal Content' },
      // AUDIT FIX: this page existed, fully coded, with no route or sidebar entry at all.
      { to: '/master-data/payment-channels', label: 'Payment Channels & Correction Reasons' },
    ],
  },
  {
    label: '🚲 Rider Account Support',
    items: [
      { to: '/rider-support/mobile-verification', label: 'Mobile Verification Queue' },
      { to: '/rider-support/pin-recovery', label: 'PIN Recovery Queue' },
      { to: '/rider-support/duplicate-plate', label: 'Duplicate Plate Queue' },
      { to: '/rider-support/data-export', label: 'Data Export Requests Queue' },
      // AUDIT FIX: same as above -- fully coded, unreachable until now.
      { to: '/rider-support/out-of-window', label: 'Out-of-Window Correction Requests' },
    ],
  },
  {
    label: '💳 Payments & Reconciliation',
    items: [
      { to: '/payments/history', label: 'Payment History' },
      { to: '/payments/reconciliation', label: 'Reconciliation Queue' },
      { to: '/payments/relock', label: 'Re-lock Accounts' },
    ],
  },
  {
    label: '📱 User & Subscription Management',
    items: [
      { to: '/users/active-riders', label: 'Active Riders List' },
      { to: '/users/subscription-status', label: 'Subscription Status' },
      { to: '/users/churn-analysis', label: 'Churn Analysis' },
    ],
  },
  {
    label: '📈 Reporting',
    items: [
      { to: '/reporting/daily-revenue', label: 'Daily Revenue Report' },
      { to: '/reporting/engagement', label: 'User Engagement Metrics' },
      { to: '/reporting/system-health', label: 'System Health' },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <nav style={{ width: 260, background: '#fff', borderRight: '1px solid var(--line)', padding: 16, display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontWeight: 700 }}>{currentAdminName()}</div>
        <div className="muted" style={{ fontSize: 12, textTransform: 'capitalize' }}>{(currentAdminRole() || '').replace('_', ' ')}</div>
      </div>
      <div style={{ flex: 1 }}>
        {SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: 18 }}>
            <div className="sidebar-title" style={{ fontWeight: 700, marginBottom: 6 }}>{section.label}</div>
            {section.items.map((item) => (
              <NavLink key={item.to} to={item.to}
                style={({ isActive }) => ({
                  display: 'block', padding: '6px 10px', borderRadius: 6, textDecoration: 'none',
                  color: isActive ? '#fff' : 'var(--ink-soft)',
                  background: isActive ? 'var(--boda-orange)' : 'transparent',
                })}>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <button onClick={handleLogout} className="secondary" style={{ marginTop: 12 }}>Log out</button>
    </nav>
  );
}