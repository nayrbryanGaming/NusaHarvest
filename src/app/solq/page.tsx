'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { QrCode, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import Navbar from '../../components/Navbar'
import { ConnectWalletButton, useWallet } from '../../providers/WalletProvider'
import { convertIdrToUsdc, getUsdcIdrPrice } from '../../utils/pricing'
import { parseQrisPayload, type ParsedQrisPayload } from '../../utils/qris'
import { buildSolanaPayUrl } from '../../utils/solanaPay'
import { USDC_MINT_STR } from '../../utils/constants'

type BarcodeDetectorResult = { rawValue?: string }
type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResult[]>
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options: { formats: string[] }): BarcodeDetectorLike
    }
  }
}

type PaymentIntent = {
  amountIdr: number
  referenceId: string
  timestamp: string
  merchantId: string | null
  userPublicKey: string | null
}

const FRAME_FREEZE_MS = 7_000

function createReferenceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default function SolqPage() {
  const { connected, publicKey } = useWallet()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scannerLoopRef = useRef<number | null>(null)
  const watchdogRef = useRef<number | null>(null)
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)
  const lastVideoFrameRef = useRef(0)
  const lastFrameAdvanceAtRef = useRef(0)
  const bootingScannerRef = useRef(false)
  const scanningRef = useRef(false)

  const [scanning, setScanning] = useState(false)
  const [scannerError, setScannerError] = useState<string | null>(null)
  const [restartCount, setRestartCount] = useState(0)
  const [rawPayload, setRawPayload] = useState('')
  const [parsedPayload, setParsedPayload] = useState<ParsedQrisPayload | null>(null)
  const [manualAmountIdr, setManualAmountIdr] = useState('')
  const [usdcIdrRate, setUsdcIdrRate] = useState<number | null>(null)
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [referenceId, setReferenceId] = useState(createReferenceId)

  const settlementWallet = (process.env.NEXT_PUBLIC_SOLQ_SETTLEMENT_WALLET || '').trim()

  const stopScanner = useCallback(() => {
    if (scannerLoopRef.current !== null) {
      window.clearInterval(scannerLoopRef.current)
      scannerLoopRef.current = null
    }

    if (watchdogRef.current !== null) {
      window.clearInterval(watchdogRef.current)
      watchdogRef.current = null
    }

    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    const video = videoRef.current
    if (video) {
      video.srcObject = null
    }

    setScanning(false)
    scanningRef.current = false
    bootingScannerRef.current = false
  }, [])

  const applyDecodedPayload = useCallback(
    (payload: string) => {
      const normalized = payload.trim()
      if (!normalized) return

      setRawPayload(normalized)
      try {
        const parsed = parseQrisPayload(normalized)
        setParsedPayload(parsed)
        setScannerError(null)
        setReferenceId(createReferenceId())
        toast.success('QRIS berhasil terbaca dan diparse')
        stopScanner()
      } catch (error: any) {
        setParsedPayload(null)
        setScannerError(error?.message || 'Payload QR tidak valid')
      }
    },
    [stopScanner]
  )

  const startScanner = useCallback(async () => {
    if (bootingScannerRef.current) return
    bootingScannerRef.current = true
    setScannerError(null)

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Browser tidak mendukung akses kamera')
      }

      const BarcodeDetectorCtor = window.BarcodeDetector
      if (!BarcodeDetectorCtor) {
        throw new Error('BarcodeDetector tidak tersedia di browser ini')
      }

      detectorRef.current = new BarcodeDetectorCtor({ formats: ['qr_code'] })
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      const video = videoRef.current
      if (!video) {
        throw new Error('Elemen video tidak tersedia')
      }

      streamRef.current = stream
      video.srcObject = stream
      await video.play()

      setScanning(true)
      scanningRef.current = true
      const now = Date.now()
      lastFrameAdvanceAtRef.current = now
      lastVideoFrameRef.current = video.currentTime

      scannerLoopRef.current = window.setInterval(async () => {
        if (!detectorRef.current || !videoRef.current) return
        if (videoRef.current.readyState < 2) return

        const currentVideoTime = videoRef.current.currentTime
        if (currentVideoTime !== lastVideoFrameRef.current) {
          lastVideoFrameRef.current = currentVideoTime
          lastFrameAdvanceAtRef.current = Date.now()
        }

        try {
          const codes = await detectorRef.current.detect(videoRef.current)
          if (!codes || codes.length === 0) return
          const text = codes[0]?.rawValue?.trim()
          if (text) {
            applyDecodedPayload(text)
          }
        } catch {
          // ignore detector frame errors; watchdog handles frozen state.
        }
      }, 350)

      watchdogRef.current = window.setInterval(() => {
        if (!scanningRef.current) return
        const elapsed = Date.now() - lastFrameAdvanceAtRef.current
        if (elapsed <= FRAME_FREEZE_MS) return

        setRestartCount((prev) => prev + 1)
        toast('Scanner freeze terdeteksi, kamera direstart otomatis...')
        void (async () => {
          stopScanner()
          await startScanner()
        })()
      }, 1500)
    } catch (error: any) {
      setScannerError(error?.message || 'Gagal menyalakan scanner kamera')
      stopScanner()
    } finally {
      bootingScannerRef.current = false
    }
  }, [applyDecodedPayload, stopScanner])

  useEffect(() => {
    return () => stopScanner()
  }, [stopScanner])

  const effectiveAmountIdr = useMemo(() => {
    if (parsedPayload?.isDynamic) {
      return parsedPayload.amountIdr
    }

    const manual = Number.parseFloat(manualAmountIdr.replace(',', '.'))
    if (!Number.isFinite(manual) || manual <= 0) return null
    return manual
  }, [manualAmountIdr, parsedPayload])

  useEffect(() => {
    if (!effectiveAmountIdr) {
      setUsdcIdrRate(null)
      setPricingError(null)
      return
    }

    let cancelled = false

    const loadRate = async () => {
      setPricingLoading(true)
      setPricingError(null)
      try {
        const rate = await getUsdcIdrPrice()
        if (!cancelled) setUsdcIdrRate(rate)
      } catch (error: any) {
        if (!cancelled) {
          setUsdcIdrRate(null)
          setPricingError(error?.message || 'Gagal mengambil kurs USDC/IDR')
        }
      } finally {
        if (!cancelled) setPricingLoading(false)
      }
    }

    void loadRate()

    return () => {
      cancelled = true
    }
  }, [effectiveAmountIdr])

  const amountUsdc = useMemo(() => {
    if (!effectiveAmountIdr || !usdcIdrRate) return null
    try {
      return convertIdrToUsdc(effectiveAmountIdr, usdcIdrRate)
    } catch {
      return null
    }
  }, [effectiveAmountIdr, usdcIdrRate])

  const paymentIntent: PaymentIntent | null = useMemo(() => {
    if (!effectiveAmountIdr) return null
    return {
      amountIdr: effectiveAmountIdr,
      referenceId,
      timestamp: new Date().toISOString(),
      merchantId: parsedPayload?.primaryMerchantId || null,
      userPublicKey: publicKey,
    }
  }, [effectiveAmountIdr, parsedPayload, publicKey, referenceId])

  const invoiceUrl = useMemo(() => {
    if (!settlementWallet || !amountUsdc || !paymentIntent) return null
    try {
      return buildSolanaPayUrl({
        recipient: settlementWallet,
        amountUsdc,
        reference: paymentIntent.referenceId,
        splTokenMint: USDC_MINT_STR,
        label: parsedPayload?.merchantName || 'SOLQ Payment',
        message: `QRIS ${paymentIntent.merchantId || 'UNKNOWN'} IDR ${paymentIntent.amountIdr.toLocaleString('id-ID')}`,
        memo: paymentIntent.referenceId,
      })
    } catch {
      return null
    }
  }, [amountUsdc, parsedPayload?.merchantName, paymentIntent, settlementWallet])

  return (
    <main className="min-h-screen bg-[#02050a]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 pt-28 pb-14 space-y-6">
        <section className="glass-panel rounded-3xl p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">SOLQ QRIS Scanner</h1>
              <p className="text-slate-400 text-sm mt-2">
                Scan QRIS fisik, parse EMVCo, konversi IDR ke USDC real-time, dan hasilkan invoice Solana Pay.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {connected ? (
                <div className="px-3 py-2 rounded-xl border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                  <Wallet size={14} className="inline mr-1" />
                  {publicKey?.slice(0, 6)}...{publicKey?.slice(-4)}
                </div>
              ) : (
                <ConnectWalletButton className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all" />
              )}
            </div>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-6">
          <div className="glass-panel rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <QrCode size={18} className="text-emerald-400" />
                Camera Scanner
              </h2>
              <div className="text-xs text-slate-400">Auto-restart freeze: {restartCount}x</div>
            </div>

            <div className="bg-black/60 rounded-2xl border border-white/10 overflow-hidden aspect-video mb-4 relative">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
              {!scanning && (
                <div className="absolute inset-0 grid place-items-center text-slate-400 text-sm">
                  Kamera belum aktif
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void startScanner()}
                disabled={scanning}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-60"
              >
                {scanning ? 'Scanner Aktif' : 'Mulai Scan QRIS'}
              </button>
              <button
                onClick={stopScanner}
                disabled={!scanning}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold disabled:opacity-60"
              >
                Stop Kamera
              </button>
              <button
                onClick={() => {
                  setRawPayload('')
                  setParsedPayload(null)
                  setManualAmountIdr('')
                  setReferenceId(createReferenceId())
                  setPricingError(null)
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold inline-flex items-center gap-1"
              >
                <RefreshCw size={14} />
                Reset Data
              </button>
            </div>

            {scannerError && (
              <p className="text-xs text-amber-300 mt-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                {scannerError}
              </p>
            )}

            <div className="mt-5">
              <label className="text-xs uppercase tracking-widest text-slate-500 font-bold">
                Payload QRIS (manual paste fallback)
              </label>
              <textarea
                value={rawPayload}
                onChange={(event) => {
                  const value = event.target.value
                  setRawPayload(value)
                  if (value.trim()) {
                    try {
                      setParsedPayload(parseQrisPayload(value.trim()))
                      setReferenceId(createReferenceId())
                      setScannerError(null)
                    } catch (error: any) {
                      setParsedPayload(null)
                      setScannerError(error?.message || 'Payload QR tidak valid')
                    }
                  } else {
                    setParsedPayload(null)
                    setScannerError(null)
                  }
                }}
                className="w-full h-28 mt-2 rounded-xl bg-[#050b14] border border-slate-700 p-3 text-xs text-slate-200 font-mono"
                placeholder="Tempel payload QRIS di sini jika kamera belum support BarcodeDetector"
              />
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-400" />
              Parsed Intent
            </h2>

            {parsedPayload ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-[#050b14] border border-slate-800 rounded-xl p-3">
                    <div className="text-slate-500 text-xs">Merchant</div>
                    <div className="text-white font-semibold">{parsedPayload.merchantName || '-'}</div>
                  </div>
                  <div className="bg-[#050b14] border border-slate-800 rounded-xl p-3">
                    <div className="text-slate-500 text-xs">Merchant ID</div>
                    <div className="text-white font-mono text-xs break-all">{parsedPayload.primaryMerchantId || '-'}</div>
                  </div>
                  <div className="bg-[#050b14] border border-slate-800 rounded-xl p-3">
                    <div className="text-slate-500 text-xs">Kota</div>
                    <div className="text-white font-semibold">{parsedPayload.merchantCity || '-'}</div>
                  </div>
                  <div className="bg-[#050b14] border border-slate-800 rounded-xl p-3">
                    <div className="text-slate-500 text-xs">CRC</div>
                    <div className={`font-semibold ${parsedPayload.crcValid === false ? 'text-red-300' : 'text-emerald-300'}`}>
                      {parsedPayload.crcValid === null ? 'N/A' : parsedPayload.crcValid ? 'VALID' : 'INVALID'}
                    </div>
                  </div>
                </div>

                {!parsedPayload.isDynamic && (
                  <div className="bg-[#050b14] border border-slate-800 rounded-xl p-3">
                    <label className="text-xs text-slate-500">QRIS static terdeteksi, isi nominal IDR</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={manualAmountIdr}
                      onChange={(event) => setManualAmountIdr(event.target.value)}
                      className="mt-2 w-full rounded-lg bg-black/30 border border-slate-700 px-3 py-2 text-sm text-white"
                      placeholder="contoh: 25000"
                    />
                  </div>
                )}

                <div className="bg-[#050b14] border border-slate-800 rounded-xl p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nominal IDR</span>
                    <span className="text-white font-bold">
                      {effectiveAmountIdr ? `Rp ${effectiveAmountIdr.toLocaleString('id-ID')}` : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-slate-500">Kurs USDC/IDR</span>
                    <span className="text-white font-mono">
                      {pricingLoading ? 'Memuat...' : usdcIdrRate ? usdcIdrRate.toLocaleString('id-ID') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-slate-500">USDC Invoice</span>
                    <span className="text-emerald-300 font-bold">{amountUsdc ? amountUsdc.toFixed(6) : '-'}</span>
                  </div>
                  {pricingError && <p className="text-xs text-amber-300 mt-2">{pricingError}</p>}
                </div>

                <div className="bg-[#050b14] border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300 break-all">
                  <div className="text-slate-500 mb-1">Payment Intent</div>
                  <pre className="whitespace-pre-wrap">{JSON.stringify(paymentIntent, null, 2)}</pre>
                </div>

                {!settlementWallet && (
                  <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    Blocker: `NEXT_PUBLIC_SOLQ_SETTLEMENT_WALLET` belum diset, jadi invoice Solana Pay belum bisa dibuat.
                  </p>
                )}

                {invoiceUrl && (
                  <div className="space-y-2">
                    <a
                      href={invoiceUrl}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"
                    >
                      Buka Invoice Solana Pay
                    </a>
                    <p className="text-[11px] font-mono text-slate-400 break-all">{invoiceUrl}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">Belum ada payload QRIS yang valid.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
