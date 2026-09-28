// admin-console/src/main.jsx
// Application entry point with improved error handling

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css';

// ============================================================================
// ERROR HANDLING FOR ROOT ELEMENT
// ============================================================================
const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('❌ FATAL: Root element not found in index.html');
  console.error('   Make sure index.html contains: <div id="root"></div>');
  document.body.innerHTML = `
    <div style="padding: 20px; text-align: center; color: #d32f2f;">
      <h1>⚠️ Application Error</h1>
      <p>Root element not found. Please check your index.html configuration.</p>
    </div>
  `;
  process.exit(1);
}

// ============================================================================
// REACT ROOT INITIALIZATION
// ============================================================================
// Render the App component into the root element
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ============================================================================
// GLOBAL ERROR HANDLING
// ============================================================================
// Catch any errors that aren't caught by React Error Boundary
window.addEventListener('error', (event) => {
  console.error('🚨 Uncaught JavaScript Error:', event.error);
  console.error('   Stack:', event.error?.stack);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🚨 Unhandled Promise Rejection:', event.reason);
});