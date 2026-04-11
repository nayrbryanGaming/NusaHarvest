'use client'

import { useEffect } from 'react'

export default function ClientIntegrityGuard() {
  useEffect(() => {
    // Keep cleanup minimal and deterministic to avoid altering legitimate UI content.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          void reg.unregister()
        }
      }).catch(() => {})
    }

    if ('caches' in window) {
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => {})
    }
  }, [])

  return null
}
