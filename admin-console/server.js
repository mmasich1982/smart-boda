import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// STARTUP DIAGNOSTICS
// ============================================================================
console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          Smart Boda Admin Console - Server Init             ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
console.log('🔧 Environment Variables:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`   PORT: ${PORT}`);
console.log(`   VITE_API_BASE_URL: ${process.env.VITE_API_BASE_URL || 'NOT SET'}`);
console.log('');

// ============================================================================
// VERIFY BUILD ARTIFACTS
// ============================================================================
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

console.log('📦 Checking Build Artifacts:');
console.log(`   Looking for: ${distPath}`);

if (!fs.existsSync(distPath)) {
  console.error('');
  console.error('❌ FATAL ERROR: dist folder not found!');
  console.error('');
  console.error('   This means the React app has not been built yet.');
  console.error('   Run this command in the admin-console directory:');
  console.error('');
  console.error('      npm run build');
  console.error('');
  console.error('   Current directory contents:');
  try {
    const files = fs.readdirSync(__dirname);
    files.forEach(f => console.error(`      - ${f}`));
  } catch (e) {
    console.error(`      Could not list directory: ${e.message}`);
  }
  console.error('');
  process.exit(1);
}

console.log('   ✓ dist folder exists');

const distContents = fs.readdirSync(distPath);
console.log(`   ✓ dist contains: ${distContents.join(', ')}`);

if (!fs.existsSync(indexPath)) {
  console.error('');
  console.error('❌ FATAL ERROR: index.html not found in dist folder!');
  console.error(`   Expected at: ${indexPath}`);
  console.error('');
  console.error('   dist folder contents:');
  distContents.forEach(f => console.error(`      - ${f}`));
  console.error('');
  process.exit(1);
}

console.log('   ✓ index.html exists');

const indexStats = fs.statSync(indexPath);
console.log(`   ✓ index.html size: ${(indexStats.size / 1024).toFixed(2)} KB`);
console.log('');

// ============================================================================
// REQUEST LOGGING MIDDLEWARE
// ============================================================================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method.padEnd(6)} ${req.path}`);
  
  // Call next handler
  next();
});

// ============================================================================
// STATIC FILES MIDDLEWARE
// ============================================================================
// Serve static files from dist folder with intelligent caching headers
console.log('📁 Configuring Static File Serving:');
console.log(`   Serving from: ${distPath}`);

app.use(express.static(distPath, {
  // Don't use ETags - rely on Cache-Control headers
  etag: false,
  // Custom headers based on file type
  setHeaders: (res, filePath) => {
    const fileName = path.basename(filePath);
    
    // Cache versioned assets (bundled files with hashes) for 1 year
    if (filePath.includes('/assets/') && (fileName.endsWith('.js') || fileName.endsWith('.css'))) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Cache-Control', 'versioned-asset');
    }
    // Never cache HTML files - always revalidate
    else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.setHeader('X-Cache-Control', 'no-cache-html');
    }
    // Cache SVG and other assets for 1 hour
    else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Cache-Control', 'short-term');
    }
  }
}));

console.log('   ✓ Static file serving configured');
console.log('');

// ============================================================================
// API HEALTH CHECK ENDPOINT
// ============================================================================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Smart Boda Admin Console',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

console.log('🏥 Health Check Endpoint:');
console.log('   GET /health - returns server status');
console.log('');

// ============================================================================
// SPA CATCH-ALL ROUTE - CRITICAL FOR REACT ROUTER
// ============================================================================
// This is the MOST IMPORTANT middleware for a React SPA.
// Any route that doesn't match a static file must serve index.html
// so that React Router can handle the routing on the client side.
//
// WHY THIS IS NEEDED:
// When a user navigates to /login, /dashboard, etc., the browser makes
// a request to that path. Without this middleware, the server returns 404.
// With this middleware, the server serves index.html, which contains the
// React app. React Router then handles the routing and displays the correct page.
//
// BUG FIX: Using app.use() instead of app.get() to catch POST, PUT, DELETE etc.

console.log('🛣️  Configuring SPA Routing:');
console.log('   All non-file routes will serve index.html');
console.log('   This allows React Router to handle client-side routing');
console.log('');

app.use('*', (req, res) => {
  // Skip if this is a request for a file (has extension)
  if (req.path.includes('.') && !req.path.endsWith('.html')) {
    // File with extension that wasn't served by static middleware
    // This should rarely happen - likely a missing static file
    console.warn(`   ⚠️  Static file not found: ${req.path}`);
    return res.status(404).json({
      error: 'Not found',
      path: req.path,
      type: 'static-file'
    });
  }

  // Make sure index.html still exists (defensive check)
  if (!fs.existsSync(indexPath)) {
    console.error(`   ❌ CRITICAL: index.html disappeared during runtime!`);
    console.error(`      Expected at: ${indexPath}`);
    return res.status(500).json({
      error: 'Application failed to load',
      message: 'index.html not found',
      type: 'build-error'
    });
  }

  // Log that we're serving index.html for this route
  const logPath = req.path.length > 50 ? req.path.substring(0, 50) + '...' : req.path;
  console.log(`   📄 Serving index.html for SPA route: ${req.method} ${logPath}`);

  // Set headers to tell browser not to cache the HTML
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('X-SPA-Route', 'true');

  // Send the index.html file
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`   ❌ Error serving index.html: ${err.message}`);
      
      // Only send error response if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to load application',
          message: err.message,
          type: 'file-error'
        });
      }
    }
  });
});

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================
// Catch any errors that occur during request processing

app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error('');
  console.error(`❌ ERROR [${timestamp}]:`);
  console.error(`   Route: ${req.method} ${req.path}`);
  console.error(`   Message: ${err.message}`);
  console.error(`   Stack: ${err.stack}`);
  console.error('');

  // Only send error response if headers haven't been sent
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Server error',
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================================
// START SERVER
// ============================================================================

const server = app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ✅ SERVER STARTED SUCCESSFULLY                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`   🌍 URL: http://localhost:${PORT}`);
  console.log(`   🏥 Health: http://localhost:${PORT}/health`);
  console.log(`   📦 Serving from: ${distPath}`);
  console.log(`   🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  console.log('   Ready to accept connections!');
  console.log('');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGTERM', () => {
  console.log('');
  console.log('⚠️  SIGTERM signal received: shutting down gracefully...');
  server.close(() => {
    console.log('   ✓ HTTP server closed');
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('   ❌ Forced exit - shutdown took too long');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('');
  console.log('⚠️  SIGINT signal received: shutting down gracefully...');
  server.close(() => {
    console.log('   ✓ HTTP server closed');
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('   ❌ Forced exit - shutdown took too long');
    process.exit(1);
  }, 10000);
});

// ============================================================================
// UNHANDLED ERROR HANDLERS
// ============================================================================

process.on('uncaughtException', (err) => {
  console.error('');
  console.error('❌ UNCAUGHT EXCEPTION:');
  console.error(`   Message: ${err.message}`);
  console.error(`   Stack: ${err.stack}`);
  console.error('');
  console.error('   The server must exit to prevent undefined behavior.');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('');
  console.error('❌ UNHANDLED PROMISE REJECTION:');
  console.error(`   Promise: ${promise}`);
  console.error(`   Reason: ${reason}`);
  console.error('');
  console.error('   The server will continue running but this should be investigated.');
  console.error('');
  process.exit(1);
});