// admin-console/src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { setSession } from '../auth/session';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false); // AUDIT FIX §4: double-submit guard
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      // AUDIT FIX (Admin Console §2): the backend now sets an httpOnly session cookie
      // directly on this response -- the frontend never sees or stores a token.
      const { data } = await api.post('/admin/auth/login', { email, password });
      setSession({ name: data.name, role: data.role, email: data.email });
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto' }} className="card">
      <h2>Smart Boda Admin</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="login-email" style={{ display: 'block', marginBottom: 4 }}>Email</label>
        <input id="login-email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', marginBottom: 10, padding: 8 }} />
        <label htmlFor="login-password" style={{ display: 'block', marginBottom: 4 }}>Password</label>
        <input id="login-password" placeholder="Password" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', marginBottom: 10, padding: 8 }} />
        {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Submit'}
        </button>
      </form>
    </div>
  );
}
