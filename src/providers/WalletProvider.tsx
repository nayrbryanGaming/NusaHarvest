'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
  signAndSendTransaction: (transaction: unknown) => Promise<{ signature?: string }>
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
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
  signAndSendTransaction?: (transaction: unknown) => Promise<{ signature?: string }>
  signMessage?: (message: Uint8Array, display?: 'utf8' | 'hex') => Promise<Uint8Array | { signature?: Uint8Array }>
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
const LOCAL_POLICY_KEY_PREFIX = 'nusa_harvest_policy_'
const LOCAL_STAKE_KEY_PREFIX = 'nusa_harvest_latest_stake_'

const WalletContext = createContext<WalletContextType>({
  publicKey: null,
  connected: false,
  connecting: false,
  balance: null,
  usdcBalance: null,
  connect: async () => {},
  disconnect: async () => {},
  switchWallet: async () => {},
  signAndSendTransaction: async () => ({}),
  signMessage: async () => new Uint8Array(),
  selectWallet: () => {},
  refreshBalance: async () => {},
  wipeAllState: () => {},
})

function normalizeProviderName(providerName?: string): WalletProviderName {
  if (providerName === 'solflare' || providerName === 'backpack') return providerName
  return 'phantom'
}

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

function getMobileBrowseDeepLink(provider: WalletProviderName, currentUrl: string): string | null {
  const encodedUrl = encodeURIComponent(currentUrl)
  const encodedRef = encodeURIComponent(currentUrl.split('/').slice(0, 3).join('/'))

  if (provider === 'phantom') {
    return `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedRef}`
  }
  if (provider === 'solflare') {
    return `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodedRef}`
  }
  return null
}

function tryOpenMobileWallet(provider: WalletProviderName): boolean {
  if (typeof window === 'undefined' || !isMobileDevice()) return false
  const deepLink = getMobileBrowseDeepLink(provider, window.location.href)
  if (!deepLink) return false
  window.location.href = deepLink
  return true
}

function detectProviderName(provider: BrowserWalletProvider): WalletProviderName | null {
  if (provider.isPhantom) return 'phantom'
  if (provider.isSolflare) return 'solflare'
  if (provider.isBackpack) return 'backpack'
  return null
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
  const [portalMounted, setPortalMounted] = useState(false)
  const activeProviderRef = useRef<BrowserWalletProvider | null>(null)
  const activeProviderNameRef = useRef<WalletProviderName | null>(null)
  const isSwitchingRef = useRef(false)

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

  const resolveActiveProvider = useCallback((): BrowserWalletProvider | null => {
    if (activeProviderNameRef.current) {
      const preferredProvider = getProvider(activeProviderNameRef.current)
      if (preferredProvider) {
        activeProviderRef.current = preferredProvider
        return preferredProvider
      }
    }

    if (activeProviderRef.current) {
      return activeProviderRef.current
    }

    const providers = listWalletProviders(window as any)

    if (publicKey) {
      const providerByAddress = providers.find((provider) => {
        const providerAddress = readPublicKey(provider.publicKey) || readPublicKey(provider.address)
        return provider.isConnected && providerAddress === publicKey
      })

      if (providerByAddress) {
        activeProviderRef.current = providerByAddress
        const providerName = detectProviderName(providerByAddress)
        if (providerName) {
          activeProviderNameRef.current = providerName
          localStorage.setItem(LAST_PROVIDER_KEY, providerName)
        }
        return providerByAddress
      }
    }

    const anyConnectedProvider = providers.find((provider) => provider.isConnected)
    if (anyConnectedProvider) {
      activeProviderRef.current = anyConnectedProvider
      const providerName = detectProviderName(anyConnectedProvider)
      if (providerName) {
        activeProviderNameRef.current = providerName
        localStorage.setItem(LAST_PROVIDER_KEY, providerName)
      }
      return anyConnectedProvider
    }

    return null
  }, [getProvider, publicKey])

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

  const signAndSendTransaction = useCallback(
    async (transaction: unknown): Promise<{ signature?: string }> => {
      const provider = resolveActiveProvider()
      if (!provider?.isConnected || typeof provider.signAndSendTransaction !== 'function') {
        throw new Error('Wallet aktif tidak siap untuk menandatangani transaksi. Hubungkan ulang wallet Anda.')
      }

      const result = await provider.signAndSendTransaction(transaction)
      if (!result || typeof result !== 'object') {
        throw new Error('Wallet tidak mengembalikan hasil transaksi yang valid.')
      }

      return result
    },
    [resolveActiveProvider]
  )

  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      const provider = resolveActiveProvider()
      if (!provider?.isConnected || typeof provider.signMessage !== 'function') {
        throw new Error('Wallet aktif tidak mendukung signMessage. Gunakan Phantom atau Solflare terbaru.')
      }

      const result = await provider.signMessage(message, 'utf8')
      if (result instanceof Uint8Array) return result
      if (result && typeof result === 'object' && 'signature' in result && result.signature instanceof Uint8Array) {
        return result.signature
      }

      throw new Error('Wallet tidak mengembalikan signature pesan yang valid.')
    },
    [resolveActiveProvider]
  )

  const handleProviderDisconnected = useCallback(() => {
    if (isSwitchingRef.current) return

    localStorage.setItem(MANUAL_DISCONNECT_KEY, 'true')
    localStorage.removeItem(LAST_PROVIDER_KEY)
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
          if (tryOpenMobileWallet(normalizedProviderName)) {
            toast('Extension tidak terdeteksi. Membuka aplikasi wallet...')
          } else {
            toast.error(`${normalizedProviderName} extension is not available`)
          }
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
    isSwitchingRef.current = false
    localStorage.setItem(MANUAL_DISCONNECT_KEY, 'true')
    localStorage.removeItem(LAST_PROVIDER_KEY)

    const keysToClear: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (key.startsWith(LOCAL_POLICY_KEY_PREFIX) || key.startsWith(LOCAL_STAKE_KEY_PREFIX)) {
        keysToClear.push(key)
      }
    }
    keysToClear.forEach((key) => localStorage.removeItem(key))

    const providers = listWalletProviders(window as any)
    for (const provider of providers) {
      try {
        if (provider.disconnect) {
          await provider.disconnect().catch(() => {})
        }
      } catch (err) {
        console.warn('[WALLET] Provider disconnect error:', err)
      }
    }

    localStorage.setItem(MANUAL_DISCONNECT_KEY, 'true')
    activeProviderRef.current = null
    activeProviderNameRef.current = null
    clearWalletState()
    setShowModal(false)

    toast.success('Wallet disconnected and sessions cleared')
  }, [clearWalletState])

  const switchWallet = useCallback(
    async (providerName: string) => {
      const normalizedProviderName = normalizeProviderName(providerName)
      setConnecting(true)
      isSwitchingRef.current = true
      localStorage.setItem(MANUAL_DISCONNECT_KEY, 'true')

      try {
        const activeProvider = activeProviderRef.current
        const targetProvider = getProvider(normalizedProviderName)

        if (!targetProvider?.connect) {
          if (tryOpenMobileWallet(normalizedProviderName)) {
            toast('Extension tidak terdeteksi. Membuka aplikasi wallet...')
          } else {
            toast.error(`${normalizedProviderName} extension is not available`)
          }
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
        const fallbackProvider = resolveActiveProvider()
        const fallbackAddress =
          fallbackProvider && (readPublicKey(fallbackProvider.publicKey) || readPublicKey(fallbackProvider.address))

        if (fallbackAddress) {
          localStorage.removeItem(MANUAL_DISCONNECT_KEY)
          applyConnectedAddress(fallbackAddress)
        }
        toast.error(error?.message || 'Failed to switch wallet')
      } finally {
        isSwitchingRef.current = false
        setConnecting(false)
      }
    },
    [getProvider, applyConnectedAddress, resolveActiveProvider]
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

    const handleProviderConnected = (provider: BrowserWalletProvider) => (nextPublicKey: unknown) => {
      if (localStorage.getItem(MANUAL_DISCONNECT_KEY) === 'true') return
      if (isSwitchingRef.current) return

      if (activeProviderRef.current && provider !== activeProviderRef.current) {
        return
      }

      const nextAddress = readPublicKey(nextPublicKey)
      if (!nextAddress) return

      activeProviderRef.current = provider
      const providerName = detectProviderName(provider)
      if (providerName) {
        activeProviderNameRef.current = providerName
        localStorage.setItem(LAST_PROVIDER_KEY, providerName)
      }

      applyConnectedAddress(nextAddress)
    }

    const handleProviderAccountChanged = (provider: BrowserWalletProvider) => (nextPublicKey: unknown) => {
      if (isSwitchingRef.current) return
      if (activeProviderRef.current && provider !== activeProviderRef.current) return
      handleAccountChanged(nextPublicKey)
    }

    const handleProviderDisconnect = (provider: BrowserWalletProvider) => () => {
      if (isSwitchingRef.current) return
      if (activeProviderRef.current && provider !== activeProviderRef.current) return
      handleProviderDisconnected()
    }

    const registeredHandlers = providers.map((provider) => {
      const accountChangedHandler = handleProviderAccountChanged(provider)
      const disconnectHandler = handleProviderDisconnect(provider)
      const connectHandler = handleProviderConnected(provider)

      provider.on?.('accountChanged', accountChangedHandler)
      provider.on?.('accountsChanged', accountChangedHandler)
      provider.on?.('onAccountChange', accountChangedHandler)
      provider.on?.('disconnect', disconnectHandler)
      provider.on?.('connect', connectHandler)

      return {
        provider,
        accountChangedHandler,
        disconnectHandler,
        connectHandler,
      }
    })

    return () => {
      for (const handler of registeredHandlers) {
        handler.provider.off?.('accountChanged', handler.accountChangedHandler)
        handler.provider.off?.('accountsChanged', handler.accountChangedHandler)
        handler.provider.off?.('onAccountChange', handler.accountChangedHandler)
        handler.provider.off?.('disconnect', handler.disconnectHandler)
        handler.provider.off?.('connect', handler.connectHandler)
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
          localStorage.setItem(LAST_PROVIDER_KEY, name)
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
            localStorage.setItem(LAST_PROVIDER_KEY, name)
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

  useEffect(() => { setPortalMounted(true) }, [])

  const modalNode = portalMounted ? createPortal(
    <AnimatePresence>
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            backgroundColor: 'rgba(0, 0, 0, 0.97)',
          }}
        >
          <motion.div
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              backgroundColor: '#0d1a27',
              border: '1px solid rgba(16,185,129,0.30)',
              borderRadius: '20px',
              padding: '28px',
              width: '100%',
              maxWidth: '380px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 80px rgba(0,0,0,0.9)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: 0, lineHeight: 1.3 }}>
                  {connected ? 'Ganti' : 'Hubungkan'}{' '}
                  <span style={{ color: '#34d399' }}>Wallet</span>
                </h3>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                  Pilih wallet untuk {connected ? 'berpindah' : 'terhubung'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                title="Close"
                aria-label="Close wallet selector"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px', lineHeight: 1 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Wallet options */}
            <div style={{ display: 'grid', gap: '10px' }}>
              {WALLET_OPTIONS.map((wallet) => (
                <button
                  type="button"
                  key={wallet.id}
                  onClick={() => (connected ? switchWallet(wallet.id) : connect(wallet.id))}
                  disabled={connecting}
                  style={{
                    backgroundColor: '#1e2d3d',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '14px',
                    padding: '14px 16px',
                    textAlign: 'left',
                    cursor: connecting ? 'not-allowed' : 'pointer',
                    opacity: connecting ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'background-color 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(16,185,129,0.15)'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(52,211,153,0.40)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = '#1e2d3d'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.10)'
                  }}
                >
                  <Wallet size={16} style={{ color: '#34d399', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff' }}>{wallet.label}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>Solana wallet extension</div>
                  </div>
                </button>
              ))}

              {connected && (
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={connecting}
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: '14px',
                    padding: '14px 16px',
                    textAlign: 'left',
                    cursor: connecting ? 'not-allowed' : 'pointer',
                    opacity: connecting ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'opacity 0.15s',
                  }}
                >
                  <LogOut size={16} style={{ color: '#fca5a5', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#fecaca' }}>Putuskan Wallet</div>
                    <div style={{ fontSize: '10px', color: 'rgba(252,165,165,0.65)', fontWeight: 400 }}>Hapus sesi aktif</div>
                  </div>
                </button>
              )}
            </div>

            <p style={{ fontSize: '10px', color: '#475569', textAlign: 'center', margin: 0 }}>
              Alamat wallet dibaca langsung dari extension browser Anda.
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  ) : null

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
        signAndSendTransaction,
        signMessage,
        selectWallet: () => setShowModal(true),
        refreshBalance,
        wipeAllState,
      }}
    >
      {children}
      {modalNode}
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
        <button onClick={selectWallet} title="Ganti wallet" className={buttonClassName}>
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
          title="Putuskan wallet"
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-red-400 hover:bg-red-500/10 transition-all"
          aria-label="Putuskan wallet"
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
