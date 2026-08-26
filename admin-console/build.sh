#!/bin/bash
set -e

echo "🚀 Starting build process..."
echo "📁 Current directory: $(pwd)"
echo "📍 Node version: $(node --version)"
echo "📍 NPM version: $(npm --version)"

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building application..."
npm run build

echo "✅ Build completed successfully"
echo "📁 Build output directory: $(pwd)/dist"
ls -la dist/ || echo "⚠️  dist folder not found"
