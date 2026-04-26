#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Nusa Harvest — Solana Devnet Auto-Deploy Script
# Program : D1zZDFSbwLzVswWk3TnqMpFqSSJeu7CGARjju6qQoZYq
# Wallet  : 35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr
# Requires: ≥ 1.70 SOL in wallet
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

export PATH="/c/Users/arche/.local/share/solana/install/active_release/bin:$PATH"

WALLET="35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr"
KEYPAIR="/c/Users/arche/.config/solana/deploy-wallet.json"
PROGRAM_KP="/c/Users/arche/.config/solana/nusa_harvest-keypair.json"
SO_FILE="/e/000VSCODE PROJECT MULAI DARI DESEMBER 2025/NUSA HARVEST STARTUP VILLAGE 3/contracts/target/deploy/nusa_harvest.so"
RPC="https://api.devnet.solana.com"
MIN_SOL="1.70"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║       NUSA HARVEST — SOLANA DEVNET DEPLOY                ║"
echo "║  Program: D1zZDFSbwLzVswWk3TnqMpFqSSJeu7CGARjju6qQoZYq ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Verify files exist
if [[ ! -f "$KEYPAIR" ]]; then
  echo "[ERROR] Keypair not found: $KEYPAIR"
  exit 1
fi

if [[ ! -f "$SO_FILE" ]]; then
  echo "[ERROR] Program binary not found: $SO_FILE"
  echo "  Run: cd contracts && cargo-build-sbf -- --features no-idl,no-log-ix-name"
  exit 1
fi

SO_SIZE=$(stat -c%s "$SO_FILE")
echo "[info] Program binary: $SO_SIZE bytes ($(echo "scale=1; $SO_SIZE/1024" | bc)KB)"
echo "[info] SOL needed: $(node -e "console.log((($SO_SIZE+128)*3480*2/1e9).toFixed(4))" 2>/dev/null || echo "~1.64") SOL"
echo ""

# Poll balance until funded
echo "[info] Monitoring wallet balance (need ≥ $MIN_SOL SOL)..."
echo "[info] Fund at: https://faucet.solana.com"
echo ""

while true; do
  BALANCE=$(solana balance "$WALLET" --url "$RPC" 2>/dev/null | awk '{print $1}' || echo "0")
  echo "[$(date '+%H:%M:%S')] Balance: $BALANCE SOL"

  # Compare using awk for float comparison
  ENOUGH=$(awk "BEGIN { print ($BALANCE >= $MIN_SOL) ? 1 : 0 }")

  if [[ "$ENOUGH" == "1" ]]; then
    echo ""
    echo "[✓] Balance sufficient ($BALANCE SOL). Starting deployment..."
    break
  fi

  sleep 15
done

# Deploy
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Deploying nusa_harvest.so to Solana Devnet..."
echo "═══════════════════════════════════════════════════════════"

solana program deploy \
  "$SO_FILE" \
  --keypair "$KEYPAIR" \
  --program-id "$PROGRAM_KP" \
  --url "$RPC" \
  --with-compute-unit-price 1000 \
  2>&1

EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  ✓ DEPLOYMENT SUCCESSFUL                                 ║"
  echo "║  Program ID: D1zZDFSbwLzVswWk3TnqMpFqSSJeu7CGARjju6qQoZYq ║"
  echo "║  Explorer : https://explorer.solana.com/address/         ║"
  echo "║             D1zZDFSbwLzVswWk3TnqMpFqSSJeu7CGARjju6qQoZYq║"
  echo "║             ?cluster=devnet                              ║"
  echo "╚══════════════════════════════════════════════════════════╝"

  # Check final balance
  echo ""
  echo "Final wallet balance:"
  solana balance "$WALLET" --url "$RPC" 2>&1
else
  echo ""
  echo "[ERROR] Deployment failed with exit code $EXIT_CODE"
  echo "Check balance and try again."
  exit 1
fi
