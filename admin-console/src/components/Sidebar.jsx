// admin-console/src/components/Sidebar.jsx
// Super Admin Console menu structure.
// Removed (no longer required): Master Data & Configuration, Rider Account Support,
// Payments & Reconciliation, Subscriptions, Reporting, User & Subscription Management.
import React from 'react';
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