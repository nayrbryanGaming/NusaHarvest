#!/usr/bin/env bash
# Auto-deploy nusa_harvest program to Solana devnet the moment the wallet is funded.
# Usage: bash scripts/deploy-solana-when-funded.sh
# Requires: SOL in G4gqqErtZt249JjZ3H7GQkMoYP6X7xkDqFC7HLBHAAGK on devnet (>= 3 SOL).

set -euo pipefail

export PATH="/c/Users/arche/.local/share/solana/install/active_release/bin:$PATH"

WALLET="G4gqqErtZt249JjZ3H7GQkMoYP6X7xkDqFC7HLBHAAGK"
PROGRAM_ID="D1zZDFSbwLzVswWk3TnqMpFqSSJeu7CGARjju6qQoZYq"
SO_PATH="/tmp/nusa_harvest_final.so"
PROGRAM_KP="/tmp/nusa_harvest-keypair.json"
KEYPAIR="/c/Users/arche/.config/solana/id.json"
RPC="https://api.devnet.solana.com"

if [[ ! -f "$SO_PATH" ]]; then
  echo "[fatal] missing $SO_PATH - rebuild the Anchor program first"
  exit 1
fi

if [[ ! -f "$PROGRAM_KP" ]]; then
  echo "[fatal] missing $PROGRAM_KP - cannot deploy to fixed program id"
  exit 1
fi

echo "[info] waiting for devnet funding on $WALLET"
until [[ "$(solana balance $WALLET --url $RPC 2>&1 | awk '{print $1}')" != "0" ]]; do
  sleep 30
  echo "[info] still 0 SOL; polling..."
done

BALANCE=$(solana balance $WALLET --url $RPC | awk '{print $1}')
echo "[info] funded: $BALANCE SOL"

echo "[deploy] running solana program deploy"
solana program deploy "$SO_PATH" \
  --keypair "$KEYPAIR" \
  --url "$RPC" \
  --program-id "$PROGRAM_KP"

echo "[verify] checking program account"
solana program show "$PROGRAM_ID" --url "$RPC"

echo "[done] explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
