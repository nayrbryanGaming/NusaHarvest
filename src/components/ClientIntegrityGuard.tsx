'use client'

import { useEffect } from 'react'
import toast from 'react-hot-toast'

const BUILD_TAG = '2026-04-14-devnet-sync-1'
const BUILD_TAG_KEY = 'nusa_harvest_build_tag'
const BUILD_RELOAD_GUARD_KEY = 'nusa_harvest_build_reload_guard'

export default function ClientIntegrityGuard() {
  useEffect(() => {
    toast.dismiss()

    const clearBrowserCaches = async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
          .catch(() => undefined)
      }

      if ('caches' in window) {
        await caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => undefined)
      }
    }

    const maybeForceOneTimeRefresh = async () => {
      try {
        const currentTag = localStorage.getItem(BUILD_TAG_KEY)
        const reloadGuard = sessionStorage.getItem(BUILD_RELOAD_GUARD_KEY)

        if (currentTag !== BUILD_TAG && reloadGuard !== BUILD_TAG) {
          localStorage.setItem(BUILD_TAG_KEY, BUILD_TAG)
          sessionStorage.setItem(BUILD_RELOAD_GUARD_KEY, BUILD_TAG)
          await clearBrowserCaches()
          window.location.reload()
          return
        }

        sessionStorage.removeItem(BUILD_RELOAD_GUARD_KEY)
      } catch {
        // Ignore storage-access errors and keep app usable.
      }
    }

    void maybeForceOneTimeRefresh()
  }, [])

  return null
}
