'use client'

import { useEffect } from 'react'

const BLOCKED_SNIPPET_CODES: ReadonlyArray<ReadonlyArray<number>> = [
  [74, 85, 68, 73, 67, 73, 65, 76, 32, 86, 69, 82, 73, 70, 73, 67, 65, 84, 73, 79, 78, 32, 65, 67, 84, 73, 86, 69],
  [86, 49, 46, 57, 46, 48, 45, 83, 84, 65, 66, 76, 69, 45, 74, 85, 68, 73, 67, 73, 65, 76, 45, 83, 89, 78, 67],
  [80, 82, 79, 84, 67, 65, 76, 32, 82, 69, 83, 69, 84],
  [77, 65, 83, 84, 69, 82, 32, 80, 82, 79, 84, 79, 67, 79, 76, 32, 83, 89, 78, 67],
  [73, 75, 72, 84, 73, 83, 65, 82, 32, 76, 65, 72, 65, 78, 32, 72, 65, 75, 73, 77],
  [80, 82, 79, 84, 79, 67, 79, 76, 32, 83, 89, 78, 67, 32, 83, 84, 65, 84, 85, 83],
  [83, 69, 76, 69, 67, 84, 69, 68, 32, 87, 65, 76, 76, 69, 84, 58],
  [82, 69, 65, 76, 45, 84, 73, 77, 69, 32, 72, 65, 78, 68, 83, 72, 65, 75, 69],
  [80, 73, 76, 73, 72, 32, 87, 65, 76, 76, 69, 84, 32, 86, 50],
  [76, 73, 86, 69, 32, 66, 85, 73, 76, 68, 32, 50, 48, 50, 54, 45, 48, 52, 45, 48, 52],
]

const BLOCKED_SNIPPETS = BLOCKED_SNIPPET_CODES.map((codes) => String.fromCharCode(...codes))

function shouldStripText(text: string): boolean {
  const upper = text.toUpperCase()
  return BLOCKED_SNIPPETS.some((snippet) => upper.includes(snippet))
}

function stripInjectedNodes(root: ParentNode): void {
  const nodes = root.querySelectorAll('div, section, article, aside, p, span, button, h1, h2, h3, h4, h5, h6')
  for (const node of nodes) {
    const text = node.textContent || ''
    if (!text) continue
    if (!shouldStripText(text)) continue

    ;(node as HTMLElement).style.display = 'none'
    node.textContent = ''
  }
}

export default function ClientIntegrityGuard() {
  useEffect(() => {
    // Defensive client cleanup in case stale service workers or cache entries exist from older builds.
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

    stripInjectedNodes(document.body)

    let queued = false
    const observer = new MutationObserver(() => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        stripInjectedNodes(document.body)
        queued = false
      })
    })

    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    return () => {
      observer.disconnect()
    }
  }, [])

  return null
}
