#!/bin/bash

# admin-console/build.sh
# Build script for Smart Boda Admin Console
# This script builds the Vite React application with proper error handling

set -e  # Exit on first error

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🔨 Building Smart Boda Admin Console"
echo "════════════════════════════════════════════════════════════"
echo ""

# ============================================================================
# 1. Clean cache and install dependencies
# ============================================================================
echo "📦 Cleaning npm cache and installing dependencies..."
npm cache clean --force
npm install
if [ $? -ne 0 ]; then
  echo "❌ Failed to install dependencies"
  exit 1
fi
echo "✓ Dependencies installed"
echo ""

# ============================================================================
# 2. Run Vite build
# ============================================================================
echo "🏗️  Building with Vite..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Vite build failed"
  exit 1
fi
echo "✓ Vite build completed"
echo ""

# ============================================================================
# 3. Verify build output
# ============================================================================
echo "🔍 Verifying build output..."
if [ ! -d "dist" ]; then
  echo "❌ dist folder not created"
  exit 1
fi
echo "✓ dist folder exists"

if [ ! -f "dist/index.html" ]; then
  echo "❌ dist/index.html not found"
  ls -la dist/
  exit 1
fi
echo "✓ dist/index.html exists"

if [ ! -d "dist/assets" ]; then
  echo "❌ dist/assets folder not found"
  exit 1
fi
echo "✓ dist/assets folder exists"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ Build completed successfully!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Build artifacts:"
find dist -type f | head -20
echo ""