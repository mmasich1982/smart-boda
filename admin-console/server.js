import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║     Smart Boda Admin Console - Server Initialization       ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ============================================================================
// BUILD VERIFICATION
// ============================================================================
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

console.log('📦 Verifying build artifacts...');
console.log(`   Checking: ${distPath}`);

if (!fs.existsSync(distPath)) {
  console.error('\n❌ FATAL: dist folder not found!');
  console.error('   Run: npm run build\n');
  process.exit(1);
}

console.log('   ✓ dist folder exists');

if (!fs.existsSync(indexPath)) {
  console.error('\n❌ FATAL: index.html not found!');
  console.error('   Run: npm run build\n');
  process.exit(1);
}

console.log('   ✓ index.html found\n');

// ============================================================================
// REQUEST LOGGING MIDDLEWARE
// ============================================================================
// CRITICAL FIX: Enhanced logging to debug routing issues
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '⚠️' : '✓';
    console.log(
      `${statusColor} [${new Date().toISOString()}] ${req.method.padEnd(6)} ` +
      `${req.path.padEnd(40)} → ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});

// ============================================================================
// STATIC FILES - Serve dist folder with proper cache headers
// ============================================================================
console.log('📁 Static file serving enabled');
app.use(express.static(distPath, {
  maxAge: '1h',
  etag: false,
  setHeaders: (res, filePath) => {
    // Assets (JS, CSS) with content hash - cache forever
    if (filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // HTML files - always revalidate
    else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    // Other files (SVG, etc) - short cache
    else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================
console.log('🏥 Health endpoint: GET /health\n');
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============================================================================
// SPA ROUTING - CRITICAL FIX FOR "NOT FOUND" ERROR
// ============================================================================
// IMPORTANT: This MUST come AFTER the static file serving middleware
// 
// For Single Page Applications (SPA), ALL route requests that don't match
// a static file should serve index.html. React Router then handles the
// routing on the client side.
//
// CRITICAL BUG THAT WAS FIXED:
// - The original server was checking for file extensions and returning 404
//   for routes like /login that don't have extensions
// - This prevented React Router from receiving the index.html to handle SPA routing
// - Solution: Serve index.html for ALL requests (except static files)
//
// This is why the LoginPage briefly appeared then showed "Not Found":
// 1. User navigates to /login
// 2. Server was returning 404 for /login (no extension)
// 3. Browser displayed the 404 error instead of index.html
// 4. React Router never got a chance to render the LoginPage
//
console.log('🛣️  SPA routing configuration:');
console.log('   • Static files → served as-is (express.static middleware above)');
console.log('   • /login → serves index.html (React Router handles)');
console.log('   • /dashboard → serves index.html (React Router handles)');
console.log('   • /any-route → serves index.html (React Router handles)');
console.log('   • React Router handles ALL routing on client\n');

app.all('*', (req, res) => {
  // Get file extension if it exists
  const ext = path.extname(req.path);

  // If request has a file extension and wasn't caught by express.static,
  // it's probably a missing asset file - return 404
  if (ext) {
    console.log(`   ✗ ${req.method} ${req.path} - file not found (${ext})`);
    return res.status(404).send('Not found');
  }

  // No file extension = likely an SPA route
  // Serve index.html so React Router can handle the routing
  console.log(`   ✓ ${req.method} ${req.path} → serving index.html for React Router`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`   ❌ Error sending index.html: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).send('Error loading application');
      }
    }
  });
});

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================
// CRITICAL FIX: Proper error handling for uncaught exceptions
app.use((err, req, res, next) => {
  console.error(`\n❌ Error [${req.method} ${req.path}]: ${err.message}`);
  console.error(err.stack);

  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
    });
  }
});

// ============================================================================
// START SERVER
// ============================================================================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('════════════════════════════════════════════════════════════');
  console.log('✅ SERVER STARTED SUCCESSFULLY');
  console.log('════════════════════════════════════════════════════════════\n');
  console.log(`🌍 URL:     http://localhost:${PORT}`);
  console.log(`📦 Serving: ${distPath}`);
  console.log(`🔧 Env:     ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 Node:    ${process.version}\n`);
  console.log('The SPA is now ready to serve.');
  console.log('React Router will handle all client-side navigation.\n');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM - shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT - shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});

// ============================================================================
// UNHANDLED ERRORS - Exit process to allow restart
// ============================================================================
process.on('uncaughtException', (err) => {
  console.error(`\n❌ Uncaught Exception: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(`\n❌ Unhandled Rejection: ${reason}`);
  if (reason && reason.stack) {
    console.error(reason.stack);
  }
  process.exit(1);
});