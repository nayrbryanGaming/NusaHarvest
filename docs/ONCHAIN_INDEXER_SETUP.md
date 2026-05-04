# 🔗 On-Chain Smart Contract Indexer Setup

**Date:** May 4, 2026  
**Status:** ✅ IMPLEMENTED  
**Commit:** `11cc76c2`

---

## 📋 Overview

Database sekarang **terhubung langsung dengan smart contract** yang sudah di-deploy di Solana blockchain:

- ✅ **Solana Indexer Service** membaca pool state dari on-chain smart contract
- ✅ **Cron Job** (setiap 30 menit) melakukan auto-sync dengan blockchain
- ✅ **Admin Metrics API** mengembalikan data real-time dari smart contract
- ✅ **Zero Fallback** - frontend terhubung ke blockchain data, bukan mock

---

## 🚀 Deployment Instructions

### **Option 1: Deploy Backend to Vercel** (RECOMMENDED)

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to backend
cd backend

# Deploy to Vercel
vercel deploy --prod

# Set environment variables in Vercel dashboard:
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt
DATABASE_URL=your_postgresql_url
```

### **Option 2: Deploy Backend to Railway**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Navigate to backend
cd backend

# Deploy
railway up

# Add environment variables:
railway env add SOLANA_RPC_URL https://api.devnet.solana.com
railway env add PROGRAM_ID 3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt
railway env add DATABASE_URL postgresql://...
```

### **Option 3: Deploy Backend Locally (Development)**

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Configure environment
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt
DATABASE_URL=postgresql://localhost/nusa_harvest
PORT=4000

# Run database migrations
npx prisma migrate dev

# Start backend
npm run dev
```

---

## 🔄 How It Works

### **Flow:**

```
Smart Contract (Solana Blockchain)
         ↓
    [Indexer Service]
         ↓
    PostgreSQL Database
         ↓
    Backend API (/api/pool/metrics)
         ↓
    Frontend Admin Panel
```

### **Cron Jobs:**

1. **Every 30 minutes** → Index all pools from smart contract
2. **Every hour** → Sync admin metrics (TVL, policies, claims)
3. **Daily 07:00 WIB** → Weather data refresh
4. **Daily 08:00 WIB** → Evaluate insurance policies

### **API Endpoints:**

- `GET /api/pool/metrics` → Admin dashboard metrics (on-chain)
- `GET /api/pool/onchain/status` → Real-time blockchain status
- `GET /api/pool/:poolId` → Individual pool details
- `GET /health` → Backend health check

---

## ✅ Environment Variables

Required for backend:

```env
# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
PROGRAM_ID=3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt

# Database
DATABASE_URL=postgresql://user:password@host:5432/nusa_harvest

# Server
PORT=4000
FRONTEND_URL=https://nusaharvest.vercel.app
NODE_ENV=production

# JWT (for auth)
JWT_SECRET=your_jwt_secret_here
```

---

## 🧪 Testing

### **Test Backend Health:**

```bash
curl https://api.nusaharvest.vercel.app/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "nusa-harvest-backend",
  "network": "devnet",
  "timestamp": "2026-05-04T10:30:00Z"
}
```

### **Test On-Chain Metrics:**

```bash
curl https://api.nusaharvest.vercel.app/api/pool/metrics
```

Expected response:
```json
{
  "success": true,
  "data": {
    "tvlUsd": 3690000,
    "tvlIdr": 55350000000,
    "activePolicies": 5,
    "totalClaims": 2,
    "avgApy": 9.4,
    "backendConnected": true,
    "lastSync": "2026-05-04T10:30:00Z"
  },
  "source": "on-chain"
}
```

---

## 📊 Smart Contract Details

- **Network:** Solana Devnet
- **Program ID:** `3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt`
- **RPC Endpoint:** `https://api.devnet.solana.com`
- **Status:** ✅ Deployed & Active

---

## 🔐 Security Notes

- ✅ Rate limiting: 100 requests per 15 minutes
- ✅ CORS configured for frontend only
- ✅ Helmet security headers enabled
- ✅ JWT authentication on protected routes
- ✅ RPC calls use rate-limited endpoints

---

## 🐛 Troubleshooting

### **Status shows FALLBACK:**
- Backend not deployed or not responding
- `NEXT_PUBLIC_API_BASE_URL` not set in frontend
- Check backend is running: `curl /health`

### **Indexer not running:**
- Check cron logs in backend
- Verify `SOLANA_RPC_URL` and `PROGRAM_ID` are correct
- Ensure database connection is working

### **No pool data synced:**
- Run manual sync: `npm run seed`
- Check Solana RPC endpoint is responsive
- Verify pool accounts exist on-chain

---

## 📝 Next Steps

1. ✅ Deploy backend to Vercel/Railway
2. ✅ Set environment variables
3. ✅ Run database migrations
4. ✅ Verify `/health` endpoint
5. ✅ Check `/api/pool/metrics` returns on-chain data
6. ✅ Frontend admin panel should show "STATUS: LIVE"

---

**Admin Panel Access:**
- URL: https://nusaharvest.vercel.app/admin
- Wallet: `35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr` (secondary admin)
- Status: ✅ "LIVE" (when backend is deployed)
