import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Verify dist folder exists
const distPath = path.join(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
  console.error('❌ ERROR: dist folder not found at', distPath);
  console.error('Available files:', fs.readdirSync(__dirname));
  process.exit(1);
}

console.log('✓ dist folder found at:', distPath);
console.log('✓ dist contents:', fs.readdirSync(distPath));

// Serve static files from dist folder with caching headers
app.use(express.static(distPath, {
  maxAge: '1h',
  etag: false
}));

// Cache busting for assets
app.use('/assets', express.static(path.join(distPath, 'assets'), {
  maxAge: '1y',
  etag: false
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// SPA routing: redirect all non-file requests to index.html
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    console.error('❌ index.html not found at:', indexPath);
    return res.status(500).json({ error: 'Application failed to load' });
  }
  
  res.sendFile(indexPath);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('✅ Server running on port', PORT);
  console.log('✅ Environment:', process.env.NODE_ENV);
  console.log('✅ Access app at: http://localhost:' + PORT);
});
