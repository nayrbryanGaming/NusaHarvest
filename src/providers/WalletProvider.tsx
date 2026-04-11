'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, RefreshCw, Wallet, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { RPC_URL } from '../utils/constants'

interface WalletContextType {
  publicKey: string | null
  connected: boolean
  connecting: boolean
  balance: number | null
  usdcBalance: number | null
  connect: (providerName?: string) => Promise<void>
  disconnect: () => Promise<void>
  switchWallet: (providerName: string) => Promise<void>
  selectWallet: () => void
  refreshBalance: () => Promise<void>
  wipeAllState: () => void
}

type WalletProviderName = 'phantom' | 'solflare' | 'backpack'

type BrowserWalletProvider = {
  isConnected?: boolean
  isPhantom?: boolean
  isSolflare?: boolean
  isBackpack?: boolean
  publicKey?: PublicKey
  address?: PublicKey | string
  providers?: BrowserWalletProvider[]
  connect?: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: PublicKey } | void>
  disconnect?: () => Promise<void>
  on?: (event: string, handler: (...args: any[]) => void) => void
  off?: (event: string, handler: (...args: any[]) => void) => void
}

const WALLET_OPTIONS: Array<{ id: WalletProviderName; label: string }> = [
  { id: 'phantom', label: 'Phantom' },
  { id: 'solflare', label: 'Solflare' },
  { id: 'backpack', label: 'Backpack' },
]

const MANUAL_DISCONNECT_KEY = 'nusa_harvest_disconnected'
const LAST_PROVIDER_KEY = 'nusa_harvest_last_wallet'

const WalletContext = createContext<WalletContextType>({
  publicKey: null,
  connected: false,
  connecting: false,
  balance: null,
  usdcBalance: null,
  connect: async () => {},
  disconnect: async () => {},
  switchWallet: async () => {},
  selectWallet: () => {},
  refreshBalance: async () => {},
  wipeAllState: () => {},
})

function normalizeProviderName(providerName?: string): WalletProviderName {
  if (providerName === 'solflare' || providerName === 'backpack') return providerName
  return 'phantom'
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function readPublicKey(value: unknown): string | null {
  if (!value) return null
  if (Array.isArray(value)) return readPublicKey(value[0])
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'publicKey' in (value as Record<string, unknown>)) {
    return readPublicKey((value as { publicKey?: unknown }).publicKey)
  }
  if (typeof (value as any).toString === 'function') return (value as any).toString()
  return null
}

function listWalletProviders(win: any): BrowserWalletProvider[] {
  const baseProviders: BrowserWalletProvider[] = []

  const injected = win?.solana as BrowserWalletProvider | undefined
  if (injected?.providers && Array.isArray(injected.providers)) {
    baseProviders.push(...injected.providers)
  }

  if (win?.phantom?.solana) baseProviders.push(win.phantom.solana)
  if (win?.solflare) baseProviders.push(win.solflare)
  if (win?.backpack?.solana) baseProviders.push(win.backpack.solana)
  if (injected) baseProviders.push(injected)

  const seen = new Set<BrowserWalletProvider>()
  const unique: BrowserWalletProvider[] = []
  for (const provider of baseProviders) {
    if (!provider || seen.has(provider)) continue
    seen.add(provider)
    unique.push(provider)
  }

  return unique
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const activeProviderRef = useRef<BrowserWalletProvider | null>(null)
  const activeProviderNameRef = useRef<WalletProviderName | null>(null)

  const getProvider = useCallback((name: WalletProviderName): BrowserWalletProvider | null => {
    const providers = listWalletProviders(window as any)

    if (name === 'phantom') {
      return providers.find((provider) => provider.isPhantom) || null
    }

    if (name === 'solflare') {
      return providers.find((provider) => provider.isSolflare) || null
    }

    if (name === 'backpack') {
      return providers.find((provider) => provider.isBackpack) || null
    }

    return null
  }, [])

  const clearWalletState = useCallback(() => {
    setPublicKey(null)
    setConnected(false)
    setBalance(null)
    setUsdcBalance(null)
  }, [])

  const fetchBalance = useCallback(async (address: string) => {
    if (!address) return

    try {
      const connection = new Connection(RPC_URL, { commitment: 'confirmed' })
      const owner = new PublicKey(address)
      const lamports = await connection.getBalance(owner, 'confirmed')
      setBalance(lamports / LAMPORTS_PER_SOL)

      try {
        const { USDC_MINT_STR } = await import('../utils/constants')
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
          mint: new PublicKey(USDC_MINT_STR),
        })
        const uiAmount = tokenAccounts.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0
        setUsdcBalance(uiAmount)
      } catch {
        setUsdcBalance(0)
      }
    } catch (error) {
      console.error('[WALLET] Failed to fetch balances:', error)
      setBalance(null)
      setUsdcBalance(null)
    }
  }, [])

  const applyConnectedAddress = useCallback(
    (address: string) => {
      setPublicKey(address)
      setConnected(true)
      localStorage.removeItem(MANUAL_DISCONNECT_KEY)
      void fetchBalance(address)
    },
    [fetchBalance]
  )

  const refreshBalance = useCallback(async () => {
    if (!publicKey) return
    await fetchBalance(publicKey)
    toast.success('Wallet balance updated')
  }, [publicKey, fetchBalance])

  const handleProviderDisconnected = useCallback(() => {
    localStorage.setItem(MANUAL_DISCONNECT_KEY, 'true')
    activeProviderRef.current = null
    activeProviderNameRef.current = null
    clearWalletState()
  }, [clearWalletState])

  const handleAccountChanged = useCallback(
    (nextPublicKey: unknown) => {
      if (localStorage.getItem(MANUAL_DISCONNECT_KEY) === 'true') return

      const nextAddress = readPublicKey(nextPublicKey)
      if (!nextAddress) {
        handleProviderDisconnected()
        return
      }

      applyConnectedAddress(nextAddress)
      toast.success(`Active wallet: ${shortAddress(nextAddress)}`)
    },
    [applyConnectedAddress, handleProviderDisconnected]
  )

  const connect = useCallback(
    async (providerName?: string) => {
      const normalizedProviderName = normalizeProviderName(providerName)
      setConnecting(true)

      try {
        const provider = getProvider(normalizedProviderName)
        if (!provider?.connect) {
          toast.error(`${normalizedProviderName} extension is not available`)
          return
        }

        const response = await provider.connect()
        const responsePublicKey =
          response && typeof response === 'object' && 'publicKey' in response
            ? readPublicKey((response as { publicKey?: unknown }).publicKey)
            : null

        const address = responsePublicKey || readPublicKey(provider.publicKey) || readPublicKey(provider.address)
        if (!address) {
          toast.error('Unable to read wallet address')
          return
        }

        activeProviderRef.current = provider
        activeProviderNameRef.current = normalizedProviderName
        localStorage.setItem(LAST_PROVIDER_KEY, normalizedProviderName)
        localStorage.removeItem(MANUAL_DISCONNECT_KEY)
        setShowModal(false)
        applyConnectedAddress(address)

        toast.success(`Wallet connected: ${shortAddress(address)}`)
      } catch (error: any) {
        console.error('[WALLET] Connect failed:', error)
        toast.error(error?.message || 'Wallet connection failed')
      } finally {
        setConnecting(false)
      }
    },
    [getProvider, applyConnectedAddress]
  )

  const disconnect = useCallback(async () => {
    localStorage.setItem(MANUAL_DISCONNECT_KEY, 'true')

    const installedProviders = WALLET_OPTIONS.map((wallet) => getProvider(wallet.id)).filter(Boolean) as BrowserWalletProvider[]
    const candidates = [activeProviderRef.current, ...installedProviders].filter(Boolean) as BrowserWalletProvider[]
    const seen = new Set<BrowserWalletProvider>()

    for (const provider of candidates) {
      if (seen.has(provider)) continue
      seen.add(provider)

      try {
        if (provider.disconnect) {
          await provider.disconnect()
        }
      } catch (error) {
        console.warn('[WALLET] Disconnect warning:', error)
      }
    }

    localStorage.removeItem(LAST_PROVIDER_KEY)
    activeProviderRef.current = null
  activeProviderNameRef.current = null
    clearWalletState()
    setShowModal(false)
    toast.success('Wallet disconnected')
  }, [clearWalletState, getProvider])

  const switchWallet = useCallback(
    async (providerName: string) => {
      const normalizedProviderName = normalizeProviderName(providerName)
      setConnecting(true)
      localStorage.setItem(MANUAL_DISCONNECT_KEY, 'true')

      try {
        const activeProvider = activeProviderRef.current
        const targetProvider = getProvider(normalizedProviderName)

        if (!targetProvider?.connect) {
          toast.error(`${normalizedProviderName} extension is not available`)
          return
        }

        const sameProvider = activeProvider === targetProvider && activeProviderNameRef.current === normalizedProviderName

        if (sameProvider && targetProvider.disconnect) {
          await targetProvider.disconnect().catch(() => {})
        }

        // Disconnect old provider only when switching to a different extension.
        if (activeProvider && activeProvider !== targetProvider && activeProvider.disconnect) {
          await activeProvider.disconnect().catch(() => {})
        }

        const response = await targetProvider.connect({ onlyIfTrusted: false })
        const responsePublicKey =
          response && typeof response === 'object' && 'publicKey' in response
            ? readPublicKey((response as { publicKey?: unknown }).publicKey)
            : null

        const address = responsePublicKey || readPublicKey(targetProvider.publicKey) || readPublicKey(targetProvider.address)
        if (!address) {
          toast.error('Unable to read wallet address')
          return
        }

        activeProviderRef.current = targetProvider
  activeProviderNameRef.current = normalizedProviderName
        localStorage.setItem(LAST_PROVIDER_KEY, normalizedProviderName)
        localStorage.removeItem(MANUAL_DISCONNECT_KEY)
        setShowModal(false)
        applyConnectedAddress(address)

        toast.success(`Wallet switched: ${shortAddress(address)}`)
      } catch (error: any) {
        console.error('[WALLET] Switch failed:', error)
        toast.error(error?.message || 'Failed to switch wallet')
      } finally {
        setConnecting(false)
      }
    },
    [getProvider, applyConnectedAddress]
  )

  const wipeAllState = useCallback(() => {
    localStorage.removeItem(MANUAL_DISCONNECT_KEY)
    localStorage.removeItem(LAST_PROVIDER_KEY)
    activeProviderRef.current = null
    activeProviderNameRef.current = null
    clearWalletState()
    setShowModal(false)
    toast.success('Wallet state cleared')
  }, [clearWalletState])

  useEffect(() => {
    const providers = listWalletProviders(window as any)

    const handleProviderConnected = (nextPublicKey: unknown) => {
      if (localStorage.getItem(MANUAL_DISCONNECT_KEY) === 'true') return
      const nextAddress = readPublicKey(nextPublicKey)
      if (!nextAddress) return
      applyConnectedAddress(nextAddress)
    }

    for (const provider of providers) {
      provider.on?.('accountChanged', handleAccountChanged)
      provider.on?.('accountsChanged', handleAccountChanged)
      provider.on?.('onAccountChange', handleAccountChanged)
      provider.on?.('disconnect', handleProviderDisconnected)
      provider.on?.('connect', handleProviderConnected)
    }

    return () => {
      for (const provider of providers) {
        provider.off?.('accountChanged', handleAccountChanged)
        provider.off?.('accountsChanged', handleAccountChanged)
        provider.off?.('onAccountChange', handleAccountChanged)
        provider.off?.('disconnect', handleProviderDisconnected)
        provider.off?.('connect', handleProviderConnected)
      }
    }
  }, [applyConnectedAddress, handleAccountChanged, handleProviderDisconnected])

  useEffect(() => {
    let cancelled = false

    const restoreConnection = async () => {
      if (localStorage.getItem(MANUAL_DISCONNECT_KEY) === 'true') return

      const preferred = localStorage.getItem(LAST_PROVIDER_KEY)
      const preferredProvider = preferred ? normalizeProviderName(preferred) : null
      const orderedProviders = preferredProvider
        ? [preferredProvider, ...WALLET_OPTIONS.map((wallet) => wallet.id).filter((id) => id !== preferredProvider)]
        : WALLET_OPTIONS.map((wallet) => wallet.id)

      for (const name of orderedProviders) {
        const provider = getProvider(name)
        if (!provider) continue

        const existingAddress = readPublicKey(provider.publicKey) || readPublicKey(provider.address)
        if (provider.isConnected && existingAddress) {
          activeProviderRef.current = provider
          activeProviderNameRef.current = name
          if (!cancelled) {
            applyConnectedAddress(existingAddress)
          }
          return
        }

        if (name !== preferredProvider || !provider.connect) continue

        try {
          const response = await provider.connect({ onlyIfTrusted: true })
          const responsePublicKey =
            response && typeof response === 'object' && 'publicKey' in response
              ? readPublicKey((response as { publicKey?: unknown }).publicKey)
              : null
          const trustedAddress = responsePublicKey || readPublicKey(provider.publicKey) || readPublicKey(provider.address)

          if (trustedAddress && !cancelled) {
            activeProviderRef.current = provider
            activeProviderNameRef.current = name
            applyConnectedAddress(trustedAddress)
            return
          }
        } catch {
          // Silent fail for trusted reconnect.
        }
      }
    }

    void restoreConnection()

    return () => {
      cancelled = true
    }
  }, [getProvider, applyConnectedAddress])

  useEffect(() => {
    if (!publicKey || !connected) return

    const intervalId = window.setInterval(() => {
      void fetchBalance(publicKey)
    }, 15000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [publicKey, connected, fetchBalance])

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        connected,
        connecting,
        balance,
        usdcBalance,
        connect,
        disconnect,
        switchWallet,
        selectWallet: () => setShowModal(true),
        refreshBalance,
        wipeAllState,
      }}
    >
      {children}

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-[#0d1520] border border-emerald-500/20 rounded-[32px] p-8 flex flex-col gap-5 shadow-[0_0_60px_rgba(16,185,129,0.15)]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-white">
                    {connected ? 'Ganti' : 'Hubungkan'} <span className="text-emerald-400">Wallet</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Pilih wallet untuk {connected ? 'berpindah' : 'terhubung'}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-500 hover:text-white transition-colors"
                  title="Close wallet selector"
                  aria-label="Close wallet selector"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid gap-3">
                {WALLET_OPTIONS.map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() => (connected ? switchWallet(wallet.id) : connect(wallet.id))}
                    disabled={connecting}
                    className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl text-left hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all font-bold flex items-center gap-3 group disabled:opacity-50"
                  >
                    <Wallet size={16} className="text-emerald-400" />
                    <div>
                      <div className="text-sm text-white font-black">{wallet.label}</div>
                      <div className="text-[10px] text-slate-500 font-normal">Solana wallet extension</div>
                    </div>
                  </button>
                ))}

                {connected && (
                  <button
                    onClick={disconnect}
                    disabled={connecting}
                    className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-left hover:bg-red-500/20 transition-all font-bold flex items-center gap-3 group disabled:opacity-50"
                  >
                    <LogOut size={16} className="text-red-300" />
                    <div>
                      <div className="text-sm text-red-200 font-black">Putuskan Wallet</div>
                      <div className="text-[10px] text-red-200/70 font-normal">Hapus sesi aktif</div>
                    </div>
                  </button>
                )}
              </div>

              <p className="text-[10px] text-slate-500 text-center">Alamat wallet dibaca langsung dari extension browser Anda.</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </WalletContext.Provider>
  )
}

export const useWallet = () => useContext(WalletContext)

export function ConnectWalletButton({ className }: { className?: string }) {
  const { publicKey, connected, selectWallet, disconnect, balance, refreshBalance, connecting } = useWallet()

  const buttonClassName =
    className ||
    'px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]'

  if (connecting) {
    return (
      <button disabled className={buttonClassName}>
        Menghubungkan...
      </button>
    )
  }

  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-300">
        <button onClick={selectWallet} title="Switch wallet" className={buttonClassName}>
          <span className="hidden md:inline">Wallet Aktif</span>
          <span className="md:hidden">Aktif</span>
          <span className="ml-2 font-mono">{shortAddress(publicKey)}</span>
        </button>

        <button
          onClick={refreshBalance}
          title={balance === null ? 'Refresh balance' : `Balance: ${balance.toFixed(4)} SOL`}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
          aria-label="Refresh wallet balance"
        >
          <RefreshCw size={14} />
        </button>

        <button
          onClick={disconnect}
          title="Disconnect wallet"
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-red-400 hover:bg-red-500/10 transition-all"
          aria-label="Disconnect wallet"
        >
          <LogOut size={14} />
        </button>
      </div>
    )
  }

  return (
    <button onClick={selectWallet} className={buttonClassName}>
      Hubungkan Wallet
    </button>
  )
}
