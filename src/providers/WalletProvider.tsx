'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface WalletContextType {
  publicKey: string | null
  connected: boolean
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

const WalletContext = createContext<WalletContextType>({
  publicKey: null,
  connected: false,
  connecting: false,
  connect: async () => {},
  disconnect: () => {}
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const connect = useCallback(async () => {
    try {
      setConnecting(true)
      const { solana } = window as any
      if (!solana?.isPhantom) {
        window.open('https://phantom.app/', '_blank')
        return
      }
      const resp = await solana.connect()
      setPublicKey(resp.publicKey.toString())
      setConnected(true)
    } catch (err) {
      console.error('Wallet connect error:', err)
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    const { solana } = window as any
    solana?.disconnect()
    setPublicKey(null)
    setConnected(false)
  }, [])

  return (
    <WalletContext.Provider value={{ publicKey, connected, connecting, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  )
}

export const useWallet = () => useContext(WalletContext)

export function ConnectWalletButton({ className }: { className?: string }) {
  const { publicKey, connected, connecting, connect, disconnect } = useWallet()

  if (connected && publicKey) {
    return (
      <button
        onClick={disconnect}
        className={className || 'px-4 py-2 bg-emerald-800/60 border border-emerald-500/40 text-emerald-400 rounded-lg text-sm font-mono hover:bg-red-900/30 hover:border-red-500/40 hover:text-red-400 transition-all'}
      >
        {publicKey.slice(0, 6)}...{publicKey.slice(-4)} ✓
      </button>
    )
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className={className || 'px-4 py-2 bg-gradient-to-r from-emerald-700 to-teal-700 text-white rounded-lg text-sm font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50'}
    >
      {connecting ? 'Menghubungkan...' : '🔗 Connect Phantom'}
    </button>
  )
}
