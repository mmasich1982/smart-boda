import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import compression from 'compression';
import helmet from 'helmet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// STARTUP BANNER & DIAGNOSTICS
// ============================================================================
console.log('\n');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     Smart Boda Admin Console - Server Initialization       ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('\n');

console.log('📋 ENVIRONMENT CONFIGURATION:');
console.log(`   ├─ NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`   ├─ PORT: ${PORT}`);
console.log(`   ├─ PID: ${process.pid}`);
console.log(`   ├─ Working Directory: ${process.cwd()}`);
console.log(`   └─ Node Version: ${process.version}`);
console.log('\n');

// ============================================================================
// BUILD ARTIFACT VERIFICATION
// ============================================================================
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

console.log('📦 BUILD ARTIFACT VERIFICATION:');
console.log(`   Checking for: ${distPath}`);

if (!fs.existsSync(distPath)) {
  console.error('\n❌ FATAL ERROR: dist/ directory does not exist!\n');
  console.error('   The React application has not been built yet.');
  console.error('   Run: npm run build\n');
  console.error('   Current directory contents:');
  try {
    const files = fs.readdirSync(__dirname);
    files.forEach(f => console.error(`      • ${f}`));
  } catch (e) {
    console.error(`      Could not list files: ${e.message}`);
  }
  console.error('\n');
  process.exit(1);
}

console.log(`   ✓ dist/ directory exists at: ${distPath}`);

const distFiles = fs.readdirSync(distPath);
console.log(`   ✓ dist/ contains (${distFiles.length} items): ${distFiles.join(', ')}`);

if (!fs.existsSync(indexPath)) {
  console.error('\n❌ FATAL ERROR: index.html not found in dist/!\n');
  console.error(`   Expected: ${indexPath}`);
  console.error(`   dist/ contains: ${distFiles.join(', ')}\n`);
  console.error('   The build may be incomplete. Run: npm run build\n');
  process.exit(1);
}

const indexStats = fs.statSync(indexPath);
console.log(`   ✓ index.html found (${(indexStats.size / 1024).toFixed(2)} KB)`);
console.log('\n');

// ============================================================================
// SECURITY HEADERS
// ============================================================================
console.log('🔒 SECURITY CONFIGURATION:');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
console.log('   ✓ Security headers (Helmet) enabled');

// ============================================================================
// COMPRESSION
// ============================================================================
app.use(compression());
console.log('   ✓ Gzip compression enabled');
console.log('\n');

// ============================================================================
// REQUEST LOGGING MIDDLEWARE
// ============================================================================
console.log('📊 REQUEST LOGGING:');
console.log('   Logging all incoming requests...\n');

app.use((req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;

  res.send = function(data) {
    const duration = Date.now() - start;
    const size = typeof data === 'string' ? data.length : JSON.stringify(data).length;
    const timestamp = new Date().toISOString();
    
    console.log(`[${timestamp}] ${req.method.padEnd(6)} ${req.path.padEnd(30)} ${res.statusCode} (${duration}ms, ${size}b)`);
    
    return originalSend.call(this, data);
  };

  next();
});

// ============================================================================
// STATIC FILES MIDDLEWARE - SERVE dist/
// ============================================================================
console.log('📁 STATIC FILE SERVING CONFIGURATION:');
console.log(`   Serving static files from: ${distPath}`);
console.log('   Cache strategy:');
console.log('      • Assets (*.js, *.css): 1 year (immutable)');
console.log('      • HTML files: no-cache (always revalidate)');
console.log('      • Other files: 1 hour');
console.log('\n');

app.use(express.static(distPath, {
  etag: false,
  setHeaders: (res, filePath) => {
    const fileName = path.basename(filePath);
    
    // Long cache for versioned assets (contain hash in filename)
    if (filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // Never cache HTML files
    else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    // Moderate cache for other files
    else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================
console.log('🏥 HEALTH CHECK ENDPOINT:');
console.log('   GET /health - Returns server status and diagnostics\n');

app.get('/health', (req, res) => {
  const health = {
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'Smart Boda Admin Console',
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    uptime: Math.floor(process.uptime()),
    buildArtifacts: {
      distPath: distPath,
      indexPath: indexPath,
      distExists: fs.existsSync(distPath),
      indexExists: fs.existsSync(indexPath),
      distFiles: fs.existsSync(distPath) ? fs.readdirSync(distPath) : []
    }
  };
  
  res.status(200).json(health);
});

// ============================================================================
// CRITICAL: SPA FALLBACK ROUTE
// ============================================================================
// THIS IS THE FIX FOR THE 404 /login ERROR
//
// When a user navigates to /login, /dashboard, or any other SPA route:
// 1. Express tries to find it as a static file (fails)
// 2. This middleware catches it and serves index.html
// 3. React Router receives the HTML and handles the routing client-side
//
// IMPORTANT NOTES:
// - Must use app.use() not app.get() to catch all HTTP methods
// - Must be AFTER express.static() so static files are served first
// - Must be BEFORE error handlers so it catches all non-static routes

console.log('🛣️  SPA ROUTING CONFIGURATION (CRITICAL):');
console.log('   This server will serve index.html for all non-static routes.');
console.log('   React Router will handle routing on the client side.');
console.log('\n   Example routing flows:');
console.log('   • Request: GET /login');
console.log('     → No static file found');
console.log('     → Serves: index.html');
console.log('     → React Router: Displays LoginPage\n');
console.log('   • Request: GET /dashboard');
console.log('     → No static file found');
console.log('     → Serves: index.html');
console.log('     → React Router: Displays DashboardPage\n');
console.log('   • Request: GET /assets/index.xyz.js');
console.log('     → Static file found');
console.log('     → Serves: /dist/assets/index.xyz.js (cached)\n');

app.use('*', (req, res, next) => {
  // Don't serve index.html for obvious file requests with common extensions
  if (req.path.includes('.') && 
      !req.path.endsWith('.html') && 
      !req.path.endsWith('/')) {
    console.log(`⚠️  [404] Static file not found: ${req.path}`);
    return res.status(404).json({
      error: 'Not Found',
      type: 'static-file',
      path: req.path,
      message: 'Static file not found on server'
    });
  }

  // Verify index.html exists before trying to serve it
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ CRITICAL: index.html is missing at runtime!`);
    console.error(`   Expected: ${indexPath}`);
    return res.status(500).json({
      error: 'Application Error',
      message: 'index.html not found',
      type: 'build-error'
    });
  }

  // Log that we're serving index.html for this SPA route
  const logPath = req.path.length > 40 ? req.path.substring(0, 40) + '...' : req.path;
  console.log(`📄 [SPA] Serving index.html for route: ${req.method} ${logPath}`);

  // Set response headers
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('X-SPA-Router', 'enabled');

  // Send index.html file
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`❌ Error sending index.html: ${err.message}`);
      
      // Only send error response if headers haven't been sent
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
console.log('⚠️  ERROR HANDLING:');
console.log('   Global error handler configured\n');

app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`\n❌ [ERROR] ${timestamp}`);
  console.error(`   Route: ${req.method} ${req.path}`);
  console.error(`   Message: ${err.message}`);
  if (err.stack) {
    console.error(`   Stack: ${err.stack}`);
  }
  console.error('');

  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Server error occurred',
      timestamp: timestamp
    });
  }
});

// ============================================================================
// START SERVER
// ============================================================================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              ✅ SERVER STARTED SUCCESSFULLY               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('🚀 DEPLOYMENT INFORMATION:');
  console.log(`   🌍 Application URL: http://localhost:${PORT}`);
  console.log(`   🏥 Health Check:    http://localhost:${PORT}/health`);
  console.log(`   📦 Serving from:    ${distPath}`);
  console.log(`   🔧 Environment:     ${process.env.NODE_ENV || 'development'}`);
  console.log(`   🎯 Binding to:      0.0.0.0:${PORT}`);
  console.log('');
  console.log('✨ Server is ready to accept connections!');
  console.log('');
});

// ============================================================================
// GRACEFUL SHUTDOWN HANDLERS
// ============================================================================
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM signal received - initiating graceful shutdown...');
  
  server.close(() => {
    console.log('✓ HTTP server closed');
    console.log('✓ Process exiting gracefully\n');
    process.exit(0);
  });
  
  // Force exit after timeout
  setTimeout(() => {
    console.error('❌ Graceful shutdown timeout - forcing exit');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT signal received - initiating graceful shutdown...');
  
  server.close(() => {
    console.log('✓ HTTP server closed');
    console.log('✓ Process exiting gracefully\n');
    process.exit(0);
  });
  
  // Force exit after timeout
  setTimeout(() => {
    console.error('❌ Graceful shutdown timeout - forcing exit');
    process.exit(1);
  }, 10000);
});

// ============================================================================
// UNHANDLED ERROR HANDLERS
// ============================================================================
process.on('uncaughtException', (err) => {
  console.error('\n');
  console.error('╔════════════════════════════════════════════════════════════╗');
  console.error('║           ❌ UNCAUGHT EXCEPTION - FATAL ERROR             ║');
  console.error('╚════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error(`Message: ${err.message}`);
  console.error(`Stack: ${err.stack}`);
  console.error('');
  console.error('The server cannot continue safely. Exiting now.');
  console.error('');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n');
  console.error('╔════════════════════════════════════════════════════════════╗');
  console.error('║        ❌ UNHANDLED PROMISE REJECTION - FATAL ERROR       ║');
  console.error('╚════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error(`Promise: ${promise}`);
  console.error(`Reason: ${reason}`);
  console.error('');
  console.error('The server cannot continue safely. Exiting now.');
  console.error('');
  process.exit(1);
});

// ============================================================================
// END OF SERVER.JS
// ============================================================================