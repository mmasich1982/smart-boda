import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

console.log('🚀 Admin Console Server Starting');
console.log(`📁 __dirname: ${__dirname}`);
console.log(`📁 distPath: ${distPath}`);
console.log(`📁 indexPath: ${indexPath}`);
console.log(`✓ dist folder exists: ${fs.existsSync(distPath)}`);
console.log(`✓ index.html exists: ${fs.existsSync(indexPath)}`);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from dist folder with caching headers
app.use(express.static(distPath, {
  maxAge: '1d',
  etag: false
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes (if needed in future)
app.get('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// SPA routing: ALL other requests redirect to index.html
// This must be LAST to catch everything that wasn't matched above
app.get('*', (req, res) => {
  console.log(`📍 Routing ${req.method} ${req.path} -> /index.html`);
  
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ ERROR: index.html not found at ${indexPath}`);
    return res.status(500).send('index.html not found - build may have failed');
  }
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`❌ Error sending index.html:`, err);
      res.status(500).send('Error loading application');
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`✅ Port: ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📍 SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});