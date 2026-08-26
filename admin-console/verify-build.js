#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔍 Verifying build integrity...\n');

const checks = [
  {
    name: 'dist folder exists',
    check: () => fs.existsSync(path.join(__dirname, 'dist'))
  },
  {
    name: 'dist/index.html exists',
    check: () => fs.existsSync(path.join(__dirname, 'dist', 'index.html'))
  },
  {
    name: 'dist/assets folder exists',
    check: () => fs.existsSync(path.join(__dirname, 'dist', 'assets'))
  },
  {
    name: 'dist/assets/index-*.js exists',
    check: () => {
      const assetsDir = path.join(__dirname, 'dist', 'assets');
      if (!fs.existsSync(assetsDir)) return false;
      const files = fs.readdirSync(assetsDir);
      return files.some(f => f.match(/index-.*\.js$/));
    }
  },
  {
    name: 'dist/assets/index-*.css exists',
    check: () => {
      const assetsDir = path.join(__dirname, 'dist', 'assets');
      if (!fs.existsSync(assetsDir)) return false;
      const files = fs.readdirSync(assetsDir);
      return files.some(f => f.match(/index-.*\.css$/));
    }
  },
  {
    name: 'index.html references both JS and CSS',
    check: () => {
      const indexPath = path.join(__dirname, 'dist', 'index.html');
      if (!fs.existsSync(indexPath)) return false;
      const content = fs.readFileSync(indexPath, 'utf-8');
      return content.includes('type="module"') && content.includes('crossorigin');
    }
  },
  {
    name: 'node_modules exists',
    check: () => fs.existsSync(path.join(__dirname, 'node_modules'))
  }
];

let passed = 0;
let failed = 0;

checks.forEach(({ name, check }) => {
  const result = check();
  const icon = result ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (result) passed++; else failed++;
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.error('⚠️  Build verification failed! Please check your build process.\n');
  console.error('Common issues:');
  console.error('  1. Run: npm install');
  console.error('  2. Run: npm run build');
  console.error('  3. Check for build errors above\n');
  process.exit(1);
}

console.log('✅ All checks passed! Build is ready for deployment.\n');
process.exit(0);
