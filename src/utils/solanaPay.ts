const MAX_LABEL_LENGTH = 64
const MAX_MESSAGE_LENGTH = 128

function sanitizeParam(value: string | undefined, maxLen: number): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLen)
}

export type SolanaPayInvoiceInput = {
  recipient: string
  amountUsdc: number
  reference: string
  splTokenMint: string
  label?: string
  message?: string
  memo?: string
}

export function buildSolanaPayUrl(input: SolanaPayInvoiceInput): string {
  if (!input.recipient?.trim()) {
    throw new Error('Recipient wallet is required')
  }
  if (!input.reference?.trim()) {
    throw new Error('Reference is required')
  }
  if (!Number.isFinite(input.amountUsdc) || input.amountUsdc <= 0) {
    throw new Error('Amount must be greater than zero')
  }
  if (!input.splTokenMint?.trim()) {
    throw new Error('SPL token mint is required')
  }

  const params = new URLSearchParams()
  params.set('amount', input.amountUsdc.toFixed(6))
  params.set('reference', input.reference)
  params.set('spl-token', input.splTokenMint)

  const label = sanitizeParam(input.label, MAX_LABEL_LENGTH)
  const message = sanitizeParam(input.message, MAX_MESSAGE_LENGTH)
  const memo = sanitizeParam(input.memo, MAX_MESSAGE_LENGTH)

  if (label) params.set('label', label)
  if (message) params.set('message', message)
  if (memo) params.set('memo', memo)

  return `solana:${input.recipient}?${params.toString()}`
}
