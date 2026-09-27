// admin-console/src/pages/LoginPage.jsx
// CORRECTED: Login page with proper error handling and session management

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { login } from '../auth/session';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    
    // AUDIT FIX §4: double-submit guard
    if (submitting) return;
    setSubmitting(true);
    setError('');
    
    try {
      // Validate inputs
      if (!email.trim() || !password.trim()) {
        setError('Please enter both email and password.');
        setSubmitting(false);
        return;
      }
      
      // AUDIT FIX (Admin Console §2): the backend now sets an httpOnly session cookie
      // directly on this response -- the frontend never sees or stores a token.
      console.log('🔐 Attempting login...');
      
      // Use the session.login() function which handles:
      // 1. Making the API request
      // 2. Validating the response
      // 3. Setting session state
      // 4. Error handling with proper messages
      await login(email.trim(), password.trim());
      
      console.log('✓ Login successful, navigating to dashboard...');
      navigate('/dashboard');

    } catch (err) {
      // ============================================================================
      // ERROR HANDLING - IMPROVED
      // ============================================================================
      // The login() function in session.js handles and re-throws errors with messages
      // Here we just display them to the user
      
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      
      console.error(`❌ Login failed (${status}):`, detail || err.message);
      
      if (status === 401) {
        // Invalid credentials or account disabled
        setError(detail || 'Invalid email or password.');
      } else if (status === 403) {
        // Account disabled
        setError(detail || 'Your account has been disabled. Contact an administrator.');
      } else if (status === 422) {
        // Validation error
        setError('Please check your email and password format.');
      } else if (err.message === 'Network Error') {
        // Network/CORS error
        setError(
          'Cannot connect to the server. Check that:\n' +
          '1. Backend API is running\n' +
          '2. VITE_API_BASE_URL is correct in .env'
        );
        console.error('CORS Error - See browser Network tab for details');
      } else if (err.isNetworkError) {
        console.error('❌ Network Error - Cannot reach backend');
        console.error(`   API Base URL: ${api.defaults.baseURL}`);
        console.error(`   Error: ${err.message}`);
        setError('Network error - backend is not responding');
      } else if (err.isCORSError) {
        console.error('❌ CORS Error - Browser blocked the request');
        console.error('   This usually means:');
        console.error('   1. Backend CORS is not configured correctly');
        console.error('   2. withCredentials is true but CORS origin is not specific');
        console.error('   3. Check browser Network tab for details');
        setError('CORS configuration error - check browser console');
      } else {
        setError(detail || err.message || 'An error occurred. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto' }} className="card">
      <h2>Smart Boda Admin</h2>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>
        Please sign in to access the admin console
      </p>
      
      <form onSubmit={handleSubmit}>
        <label htmlFor="login-email" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          Email
        </label>
        <input 
          id="login-email" 
          placeholder="admin@smartboda.com" 
          type="email"
          value={email} 
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          style={{ 
            width: '100%', 
            marginBottom: 10, 
            padding: 8,
            opacity: submitting ? 0.6 : 1
          }} 
        />
        
        <label htmlFor="login-password" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          Password
        </label>
        <input 
          id="login-password" 
          placeholder="Enter your password" 
          type="password" 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          style={{ 
            width: '100%', 
            marginBottom: 10, 
            padding: 8,
            opacity: submitting ? 0.6 : 1
          }} 
        />
        
        {error && (
          <div 
            role="alert" 
            style={{ 
              color: '#d32f2f', 
              backgroundColor: '#ffebee',
              padding: '8px 12px',
              borderRadius: 4,
              marginBottom: 10,
              fontSize: 14,
              whiteSpace: 'pre-wrap',
              borderLeft: '3px solid #d32f2f'
            }}
          >
            {error}
          </div>
        )}
        
        <button 
          className="primary" 
          type="submit" 
          disabled={submitting}
          style={{
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1
          }}
        >
          {submitting ? '⏳ Signing in…' : '✓ Sign In'}
        </button>
      </form>
      
      <div style={{ marginTop: 20, fontSize: 12, color: '#999', textAlign: 'center' }}>
        <p>For support, contact your administrator</p>
        <p style={{ fontFamily: 'monospace', fontSize: 11, marginTop: 8 }}>
          API: {import.meta.env.VITE_API_BASE_URL || '(not configured)'}
        </p>
      </div>
    </div>
  );
}