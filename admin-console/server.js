import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// LOGGING MIDDLEWARE
// ============================================================================
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// ============================================================================
// VERIFY DIST FOLDER EXISTS
// ============================================================================
const distPath = path.join(__dirname, 'dist');

console.log('🔍 Checking for dist folder...');
console.log(`   Expected path: ${distPath}`);

if (!fs.existsSync(distPath)) {
  console.error('❌ ERROR: dist folder not found!');
  console.error(`   Build may have failed. Current directory contents:`);
  try {
    const files = fs.readdirSync(__dirname);
    files.forEach(f => console.error(`     - ${f}`));
  } catch (e) {
    console.error(`   Could not list directory: ${e.message}`);
  }
  process.exit(1);
}

console.log('✓ dist folder found');
const distFiles = fs.readdirSync(distPath);
console.log(`✓ dist contains: ${distFiles.join(', ')}`);

// Verify index.html exists
const indexPath = path.join(distPath, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('❌ ERROR: index.html not found in dist folder!');
  console.error(`   Expected path: ${indexPath}`);
  process.exit(1);
}
console.log('✓ index.html found');

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Serve static files from dist folder with caching headers
app.use(express.static(distPath, {
  maxAge: '1h',
  etag: false,
  setHeaders: (res, filePath) => {
    // Cache assets for 1 year (they have hash in filename)
    if (filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // Don't cache HTML files
    else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));

// ============================================================================
// API PROXY & ROUTES
// ============================================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================================================
// SPA ROUTING - CRITICAL FOR REACT ROUTER
// ============================================================================
// All non-file requests (that don't match static files) go to index.html
// This allows React Router to handle client-side routing
//
// IMPORTANT: This must use app.use() not app.get() to catch all HTTP methods
// and handle all routes including those with parameters (/login, /dashboard, etc.)

app.use('*', (req, res) => {
  // Don't serve index.html for files with extensions (css, js, etc.)
  // These should have been caught by express.static() above
  if (req.path.includes('.')) {
    return res.status(404).json({ error: 'Not found' });
  }

  console.log(`📄 Serving index.html for route: ${req.method} ${req.path}`);
  
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ index.html disappeared! Path: ${indexPath}`);
    return res.status(500).json({ error: 'Application failed to load' });
  }
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`❌ Error serving index.html for ${req.path}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to load application' });
      }
    }
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error(`❌ Server error on ${req.method} ${req.path}:`, err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
  });
});

// ============================================================================
// START SERVER
// ============================================================================

const server = app.listen(PORT, () => {
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('✅ Smart Boda Admin Console - Server Started');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Access at: http://localhost:${PORT}`);
  console.log(`📦 Serving from: ${distPath}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});