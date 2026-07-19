import { NextResponse, type NextRequest } from 'next/server'

type RateBucket = { count: number; resetAt: number }

const buckets = new Map<string, RateBucket>()
const WINDOW_MS = 60_000
const READ_LIMIT = 300
const WRITE_LIMIT = 90
const MAX_BODY_BYTES = 64 * 1024

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

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip') || 'unknown'
}

function consumeRateLimit(request: NextRequest) {
  const now = Date.now()
  const key = `${clientKey(request)}:${request.method === 'GET' ? 'read' : 'write'}`
  const limit = request.method === 'GET' ? READ_LIMIT : WRITE_LIMIT
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
  const configuredKey = process.env.PLAY_MONEY_SERVICE_API_KEY?.trim()
    || process.env.TELLWISE_SERVICE_SECRET?.trim()
    || process.env.TELLWISE_SECRET?.trim()
  const suppliedKey = request.headers.get('x-play-money-api-key')?.trim()

  if (!configuredKey || !suppliedKey || !await secureEqual(configuredKey, suppliedKey)) {
    return NextResponse.json(
      { error: 'Unauthorized service request', requestId },
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
