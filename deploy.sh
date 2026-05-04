#!/bin/bash
# NUSA HARVEST — Automated Deployment Script
# Deploys MVP to Vercel with full integration

set -e

echo "🚀 NUSA HARVEST MVP DEPLOYMENT"
echo "================================"

# Step 1: Backend Setup
echo ""
echo "📦 Step 1: Backend Setup..."
cd backend
npm install
npx prisma generate
echo "✅ Backend dependencies installed"

# Step 2: Frontend Setup
echo ""
echo "📦 Step 2: Frontend Setup..."
cd ../frontend
npm install
echo "✅ Frontend dependencies installed"

# Step 3: Build Frontend
echo ""
echo "🔨 Step 3: Building Frontend..."
npm run build
echo "✅ Frontend built successfully"

# Step 4: Environment Check
echo ""
echo "📋 Step 4: Environment Configuration..."
if [ ! -f ../.env.production ]; then
    echo "⚠️  Warning: Create .env.production with:"
    echo "   - DATABASE_URL"
    echo "   - SOLANA_RPC_URL"
    echo "   - ANCHOR_PROVIDER_URL"
fi
echo "✅ Environment check complete"

echo ""
echo "================================"
echo "✨ DEPLOYMENT READY FOR VERCEL"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Push code to GitHub"
echo "2. Connect repository to Vercel"
echo "3. Configure environment variables"
echo "4. Deploy!"
echo ""
