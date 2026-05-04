type TlvMap = Map<string, string>

export interface MerchantAccountInfo {
  tag: string
  gui?: string
  merchantId?: string
  merchantName?: string
  raw: string
}

export interface ParsedQrisPayload {
  raw: string
  normalized: string
  fields: Record<string, string>
  merchantName: string | null
  merchantCity: string | null
  merchantCategoryCode: string | null
  merchantCriteria: string | null
  countryCode: string | null
  currencyCode: string | null
  amountIdr: number | null
  isDynamic: boolean
  merchantAccounts: MerchantAccountInfo[]
  primaryMerchantId: string | null
  crcValid: boolean | null
}

function toRecord(map: TlvMap): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Array.from(map.entries())) {
    result[key] = value
  }
  return result
}

function parseTlv(payload: string): TlvMap {
  const map = new Map<string, string>()
  let cursor = 0

  while (cursor + 4 <= payload.length) {
    const tag = payload.slice(cursor, cursor + 2)
    const lengthRaw = payload.slice(cursor + 2, cursor + 4)
    const length = Number.parseInt(lengthRaw, 10)

    if (!Number.isFinite(length) || length < 0) {
      throw new Error(`Invalid TLV length at position ${cursor}: "${lengthRaw}"`)
    }

    const valueStart = cursor + 4
    const valueEnd = valueStart + length
    if (valueEnd > payload.length) {
      throw new Error(`TLV value exceeds payload length for tag ${tag}`)
    }

    const value = payload.slice(valueStart, valueEnd)
    map.set(tag, value)
    cursor = valueEnd
  }

  if (cursor !== payload.length) {
    throw new Error('Trailing bytes detected in QR payload')
  }

  return map
}

function parseMerchantAccount(tag: string, value: string): MerchantAccountInfo {
  let nested: TlvMap = new Map()
  try {
    nested = parseTlv(value)
  } catch {
    return { tag, raw: value }
  }

  const gui = nested.get('00') || undefined
  const merchantId = nested.get('01') || nested.get('03') || nested.get('25') || undefined
  const merchantName = nested.get('02') || nested.get('26') || undefined

  return {
    tag,
    gui,
    merchantId,
    merchantName,
    raw: value,
  }
}

function readAdditionalMerchantId(value: string | undefined): string | null {
  if (!value) return null
  try {
    const nested = parseTlv(value)
    return nested.get('01') || nested.get('02') || nested.get('05') || null
  } catch {
    return null
  }
}

function parseAmount(value: string | undefined): number | null {
  if (!value) return null
  const normalized = value.replace(',', '.').trim()
  const amount = Number.parseFloat(normalized)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return amount
}

function crc16Ccitt(input: string): string {
  let crc = 0xffff

  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff
      } else {
        crc = (crc << 1) & 0xffff
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function verifyCrc(payload: string, parsed: TlvMap): boolean | null {
  const crcValue = parsed.get('63')
  if (!crcValue) return null
  if (crcValue.length !== 4) return false

  const crcTagIndex = payload.lastIndexOf('6304')
  if (crcTagIndex < 0) return false

  const payloadForCrc = `${payload.slice(0, crcTagIndex)}6304`
  const calculated = crc16Ccitt(payloadForCrc)
  return calculated === crcValue.toUpperCase()
}

export function parseQrisPayload(rawPayload: string): ParsedQrisPayload {
  const normalized = rawPayload.replace(/\s+/g, '')
  if (!normalized) {
    throw new Error('QR payload is empty')
  }

  const parsed = parseTlv(normalized)
  const merchantAccounts: MerchantAccountInfo[] = []

  for (let tag = 26; tag <= 51; tag++) {
    const tagStr = String(tag).padStart(2, '0')
    const value = parsed.get(tagStr)
    if (!value) continue
    merchantAccounts.push(parseMerchantAccount(tagStr, value))
  }

  const amountIdr = parseAmount(parsed.get('54'))
  const primaryMerchantId =
    merchantAccounts.find((item) => item.merchantId)?.merchantId ||
    readAdditionalMerchantId(parsed.get('62')) ||
    null

  return {
    raw: rawPayload,
    normalized,
    fields: toRecord(parsed),
    merchantName: parsed.get('59') || null,
    merchantCity: parsed.get('60') || null,
    merchantCategoryCode: parsed.get('52') || null,
    merchantCriteria: parsed.get('01') || null,
    countryCode: parsed.get('58') || null,
    currencyCode: parsed.get('53') || null,
    amountIdr,
    isDynamic: amountIdr !== null,
    merchantAccounts,
    primaryMerchantId,
    crcValid: verifyCrc(normalized, parsed),
  }
}
