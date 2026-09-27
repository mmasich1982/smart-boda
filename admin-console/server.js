import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

console.log('\n🚀 Smart Boda Admin Console - Server Starting\n');

// Get the dist folder path
const distFolder = path.join(__dirname, 'dist');
const indexFile = path.join(distFolder, 'index.html');

// Verify build exists
if (!fs.existsSync(distFolder)) {
  console.error('❌ ERROR: dist folder not found!');
  console.error(`   Expected: ${distFolder}`);
  console.error('   Run: npm run build');
  process.exit(1);
}

if (!fs.existsSync(indexFile)) {
  console.error('❌ ERROR: index.html not found!');
  console.error(`   Expected: ${indexFile}`);
  console.error('   Run: npm run build');
  process.exit(1);
}

console.log(`✓ Build verified at: ${distFolder}`);
console.log(`✓ index.html found\n`);

// Serve static files
app.use(express.static(distFolder, {
  maxAge: '1d',
  etag: false
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// CRITICAL: Serve index.html for all non-file requests
// This allows React Router to handle routing
app.get('*', (req, res) => {
  // If request is for a file (has extension), return 404
  if (path.extname(req.path)) {
    return res.status(404).send('Not found');
  }
  
  // Otherwise serve index.html for SPA routing
  res.sendFile(indexFile);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('════════════════════════════════════════════════');
  console.log(`✅ Server started on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`📦 Serving: ${distFolder}`);
  console.log('════════════════════════════════════════════════\n');
});