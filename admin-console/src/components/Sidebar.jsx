// admin-console/src/components/Sidebar.jsx
// Super Admin Console menu structure.
// Removed (no longer required): Master Data & Configuration, Rider Account Support,
// Payments & Reconciliation, Subscriptions, Reporting, User & Subscription Management.
import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { currentAdminName, currentAdminRole, logout } from '../auth/session';

const SECTIONS = [
  { label: '📊 Dashboard', items: [{ to: '/dashboard', label: 'Main Stats Dashboard' }] },
  {
    // Moved here from "User & Subscription Management".
    label: '🏍️ Manage Riders',
    items: [
      { to: '/riders/active', label: 'Active Riders List' },
      { to: '/riders/individual', label: 'Individual Riders' },
    ],
  },
  {
    label: '👥 Manage Groups',
    items: [
      { to: '/groups/manage', label: 'Manage Groups and Members' },
      { to: '/groups/incoming-additions', label: 'Incoming Group Member Additions' },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  // Ends the session on the server (clears the httpOnly cookie), clears it locally, then
  // returns to the login screen. logout() clears the local session even if the request fails.
  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      navigate('/login', { replace: true });
    }
  }

  return (
    // The sidebar is pinned to the viewport height: the menu list scrolls on its own and the
    // Log out button stays visible at the bottom, however long the page beside it is.
    <nav style={{ width: 260, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', boxSizing: 'border-box', overflow: 'hidden',
      background: '#fff', borderRight: '1px solid var(--line)', padding: 16, display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontWeight: 700 }}>{currentAdminName()}</div>
        <div className="muted" style={{ fontSize: 12, textTransform: 'capitalize' }}>{(currentAdminRole() || '').replace('_', ' ')}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
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
      <button onClick={handleLogout} disabled={loggingOut} className="secondary" style={{ marginTop: 12, flexShrink: 0, width: '100%' }}>
        {loggingOut ? 'Logging out…' : '🚪 Log out'}
      </button>
    </nav>
  );
}