import { NextResponse, type NextRequest } from 'next/server'

type RateBucket = { count: number; resetAt: number }

const buckets = new Map<string, RateBucket>()
const WINDOW_MS = 60_000
const READ_LIMIT = 3_000
const WRITE_LIMIT = 180
const MAX_BODY_BYTES = 64 * 1024
const MAX_CLOCK_SKEW_SECONDS = 300

const DEFAULT_ALLOWED_SERVICE_ORIGINS = [
  'https://slimefish.com',
  'https://www.slimefish.com',
  'https://api.slimefish.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const leftBytes = new Uint8Array(leftHash)
  const rightBytes = new Uint8Array(rightHash)
  let difference = leftBytes.length ^ rightBytes.length
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ (rightBytes[index] ?? 0)
  }
  return difference === 0
}

function isDevelopmentLocal(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') return false
  const host = request.headers.get('host') || ''
  const origin = request.headers.get('origin') || request.headers.get('referer') || request.headers.get('x-slimefish-source-url') || ''
  return /(^|\.)localhost(:\d+)?$/i.test(host)
    || /^127\.0\.0\.1(:\d+)?$/i.test(host)
    || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(origin)
}

function allowedServiceOrigins() {
  const configured = process.env.SLIMEFISH_ALLOWED_SERVICE_ORIGINS
    || process.env.TELLWISE_ALLOWED_SERVICE_ORIGINS
    || DEFAULT_ALLOWED_SERVICE_ORIGINS.join(',')
  return configured.split(',').map(value => value.trim()).filter(Boolean)
}

function originOf(value: string | null) {
  if (!value) return null
  try { return new URL(value).origin }
  catch { return null }
}

function isAllowedSource(request: NextRequest) {
  if (isDevelopmentLocal(request)) return true
  const allowed = new Set(allowedServiceOrigins())
  const candidates = [
    originOf(request.headers.get('origin')),
    originOf(request.headers.get('referer')),
    originOf(request.headers.get('x-slimefish-source-url')),
  ].filter((value): value is string => Boolean(value))
  return candidates.some(candidate => allowed.has(candidate))
}

async function sha256Hex(value: string) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function verifySignedServiceRequest(request: NextRequest) {
  const signingSecret = process.env.SLIMEFISH_BACKEND_REQUEST_PRIVATE_KEY?.trim()
    || process.env.SLIMEFISH_BACKEND_REQUEST_SIGNING_SECRET?.trim()
    || process.env.TELLWISE_SERVICE_PRIVATE_KEY?.trim()
    || ''
  if (!signingSecret) return isDevelopmentLocal(request)
  const timestamp = request.headers.get('x-slimefish-request-timestamp')?.trim() || ''
  const suppliedBodyHash = request.headers.get('x-slimefish-body-sha256')?.trim() || ''
  const suppliedSignature = request.headers.get('x-slimefish-request-signature')?.trim() || ''
  const sourceUrl = request.headers.get('x-slimefish-source-url')?.trim() || ''
  const timestampNumber = Number(timestamp)
  if (!Number.isFinite(timestampNumber) || Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > MAX_CLOCK_SKEW_SECONDS) return false
  if (!/^[a-f0-9]{64}$/i.test(suppliedBodyHash) || !/^[a-f0-9]{64}$/i.test(suppliedSignature) || !sourceUrl) return false
  const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.clone().text()
  const actualBodyHash = await sha256Hex(body)
  if (!await secureEqual(actualBodyHash, suppliedBodyHash)) return false
  const payload = [request.method.toUpperCase(), `${request.nextUrl.pathname}${request.nextUrl.search}`, timestamp, suppliedBodyHash, sourceUrl].join('\n')
  const expectedSignature = await hmacSha256Hex(signingSecret, payload)
  return secureEqual(expectedSignature, suppliedSignature)
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip') || 'unknown'
}

function consumeRateLimit(request: NextRequest) {
  const now = Date.now()
  const isRead = request.method === 'GET' || request.method === 'HEAD'
  const isQuote = request.nextUrl.pathname.endsWith('/quote')
  const routeClass = request.nextUrl.pathname.includes('/live/') ? 'live' : isRead || isQuote ? 'read' : 'write'
  const key = `${clientKey(request)}:${routeClass}`
  // SSE connections are long lived and already authenticated by the service key.
  // Give them a separate budget so reconnects cannot starve ordinary API reads.
  const limit = routeClass === 'live' ? 6_000 : routeClass === 'read' ? READ_LIMIT : WRITE_LIMIT
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: limit - 1, resetAt: now + WINDOW_MS }
  }
  current.count += 1
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt }
}

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
  const configuredKey = process.env.SLIMEFISH_BACKEND_SERVICE_API_KEY?.trim()
    || process.env.TELLWISE_SERVICE_SECRET?.trim()
    || process.env.TELLWISE_SECRET?.trim()
  const suppliedKey = request.headers.get('x-slimefish-backend-api-key')?.trim()

  if (!configuredKey || !suppliedKey || !await secureEqual(configuredKey, suppliedKey)) {
    return NextResponse.json(
      { error: 'Unauthorized service request', requestId },
      { status: 401, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } },
    )
  }

  if (!isAllowedSource(request)) {
    return NextResponse.json(
      { error: 'Unauthorized service origin', requestId },
      { status: 403, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } },
    )
  }

  if (!await verifySignedServiceRequest(request)) {
    return NextResponse.json(
      { error: 'Unauthorized signed service request', requestId },
      { status: 401, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } },
    )
  }

  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: 'Request body is too large', requestId },
      { status: 413, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } },
    )
  }

  const rate = consumeRateLimit(request)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', requestId },
      {
        status: 429,
        headers: {
          'cache-control': 'no-store',
          'retry-after': String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
          'x-request-id': requestId,
        },
      },
    )
  }

  const headers = new Headers(request.headers)
  headers.set('x-request-id', requestId)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set('cache-control', 'no-store')
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('x-request-id', requestId)
  response.headers.set('x-ratelimit-remaining', String(rate.remaining))
  return response
}

export const config = { matcher: ['/api/v1/:path*'] }
