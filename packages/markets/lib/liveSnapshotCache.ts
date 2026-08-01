import Redis from 'ioredis'
import type { PublicMarketLiveSnapshot } from './getMarketLiveSnapshot'

const LIVE_CHANNEL = 'slimefish:live:updates'
const SNAPSHOT_TTL_SECONDS = 60 * 60
const HISTORY_TTL_SECONDS = 30
const memorySnapshots = new Map<string, { snapshot: PublicMarketLiveSnapshot; expiresAt: number }>()
const memoryAccountSnapshots = new Map<string, { snapshot: UserAccountLiveSnapshot; expiresAt: number }>()
const memoryHistory = new Map<string, { value: string; expiresAt: number }>()
let subscriberStarted = false

declare global {
  // eslint-disable-next-line no-var
  var slimefishBackendRedis: Redis | undefined
}

function snapshotKey(marketId: string) {
  return `slimefish:live:market:${marketId}`
}

function snapshotVersionKey(marketId: string) {
  return `slimefish:live:market:${marketId}:version`
}

function accountSnapshotKey(userId: string) {
  return `slimefish:live:account:${userId}:snapshot`
}

function historyKey(signature: string) {
  return `slimefish:live:history:${signature}`
}

function optionHistoryKey(optionId: string) {
  return `slimefish:live:option:${optionId}:history`
}

export interface UserAccountLiveSnapshot {
  userId: string
  version: number
  balance: number
  positions: Array<{
    marketId: string
    optionId: string
    optionName?: string
    outcomeIndex?: number
    cost: number
    quantity: number
    value: number
  }>
}

function getRedis() {
  const url = process.env.REDIS_URL?.trim()
  if (!url) return null

  if (!global.slimefishBackendRedis) {
    global.slimefishBackendRedis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 1500,
      commandTimeout: 1000,
      retryStrategy: times => times <= 1 ? 100 : null,
    })
    global.slimefishBackendRedis.on('error', () => {
      // Redis is an acceleration and fan-out layer; Neon remains durable authority.
    })
  }

  startSubscriber(global.slimefishBackendRedis)

  return global.slimefishBackendRedis
}

function remember(snapshot: PublicMarketLiveSnapshot) {
  const current = memorySnapshots.get(snapshot.marketId)?.snapshot
  if (!current || snapshot.version >= current.version) {
    memorySnapshots.set(snapshot.marketId, {
      snapshot,
      expiresAt: Date.now() + SNAPSHOT_TTL_SECONDS * 1000,
    })
  }
}

function startSubscriber(redis: Redis) {
  if (subscriberStarted) return
  subscriberStarted = true
  const subscriber = redis.duplicate({
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    connectTimeout: 1500,
    commandTimeout: 1000,
    retryStrategy: times => times <= 1 ? 100 : null,
  })
  subscriber.on('error', () => {
    // A reconnecting subscriber must never affect financial writes.
  })
  subscriber.on('message', (_channel, value) => {
    try {
      const payload = JSON.parse(value) as { snapshots?: PublicMarketLiveSnapshot[] }
      for (const snapshot of payload.snapshots ?? []) remember(snapshot)
    } catch {
      // Ignore malformed fan-out messages.
    }
  })
  void subscriber.connect()
    .then(() => subscriber.subscribe(LIVE_CHANNEL))
    .catch(() => {
      subscriberStarted = false
    })
}

async function ensureConnected(redis: Redis) {
  if (redis.status === 'wait') await redis.connect()
}

export async function readCachedPublicSnapshots(marketIds: string[]) {
  const now = Date.now()
  const snapshots = new Map<string, PublicMarketLiveSnapshot>()
  const misses: string[] = []
  for (const marketId of marketIds) {
    const cached = memorySnapshots.get(marketId)
    if (cached && cached.expiresAt > now) snapshots.set(marketId, cached.snapshot)
    else {
      memorySnapshots.delete(marketId)
      misses.push(marketId)
    }
  }
  if (misses.length === 0) return snapshots

  const redis = getRedis()
  if (!redis) return snapshots

  try {
    await ensureConnected(redis)
    const values = await redis.mget(misses.map(snapshotKey))
    values.forEach((value, index) => {
      if (!value) return
      try {
        const snapshot = JSON.parse(value) as PublicMarketLiveSnapshot
        if (snapshot.marketId === misses[index]) {
          remember(snapshot)
          snapshots.set(snapshot.marketId, snapshot)
        }
      } catch {
        // A malformed cache entry is treated as a miss and repaired from Neon.
      }
    })
    return snapshots
  } catch {
    return new Map<string, PublicMarketLiveSnapshot>()
  }
}

export async function publishPublicSnapshots(snapshots: PublicMarketLiveSnapshot[]) {
  const redis = getRedis()
  if (snapshots.length === 0) return snapshots

  let orderedSnapshots = snapshots
  if (redis) {
    try {
      await ensureConnected(redis)
      const candidates = await Promise.all(snapshots.map(async (snapshot) => {
        const accepted = Number(await redis.eval(
          `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
           local proposed = tonumber(ARGV[1])
           if proposed <= current then return 0 end
           redis.call('SET', KEYS[1], proposed, 'EX', ARGV[2])
           return 1`,
          1,
          snapshotVersionKey(snapshot.marketId),
          snapshot.version,
          SNAPSHOT_TTL_SECONDS,
        ))
        return accepted === 1 ? snapshot : null
      }))
      orderedSnapshots = candidates.filter((snapshot): snapshot is PublicMarketLiveSnapshot => snapshot !== null)
    }
    catch {
      // Fall through to process-local ordering when Redis is temporarily unavailable.
    }
  }

  orderedSnapshots = orderedSnapshots.filter((snapshot) => {
    const current = memorySnapshots.get(snapshot.marketId)?.snapshot.version ?? 0
    return snapshot.version > current
  })
  for (const snapshot of orderedSnapshots) remember(snapshot)
  if (!redis) return orderedSnapshots

  try {
    const pipeline = redis.pipeline()
    for (const snapshot of orderedSnapshots) {
      pipeline.set(snapshotKey(snapshot.marketId), JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL_SECONDS)
      for (const option of snapshot.options) {
        const timestamp = Math.floor(snapshot.version / 1000)
        const key = optionHistoryKey(option.id)
        pipeline.zadd(key, timestamp, JSON.stringify({ t: timestamp, p: option.probability, v: snapshot.version }))
        pipeline.zremrangebyrank(key, 0, -5001)
        pipeline.expire(key, 60 * 60 * 24 * 365)
      }
    }
    pipeline.publish(LIVE_CHANNEL, JSON.stringify({ snapshots: orderedSnapshots }))
    await pipeline.exec()
  } catch {
    // A confirmed ledger operation must not fail because live fan-out is unavailable.
  }
  return orderedSnapshots
}

export async function readLiveOptionHistories(
  optionIds: string[],
  startTs?: number,
  endTs?: number,
) {
  const redis = getRedis()
  if (!redis || optionIds.length === 0) return new Map<string, Array<{ t: number; p: number }>>()
  try {
    await ensureConnected(redis)
    const minimum = startTs ?? '-inf'
    const maximum = endTs ?? '+inf'
    const pipeline = redis.pipeline()
    for (const optionId of optionIds) {
      pipeline.zrangebyscore(optionHistoryKey(optionId), minimum, maximum)
    }
    const results = await pipeline.exec()
    return new Map(optionIds.map((optionId, index) => {
      const rows = results?.[index]?.[1]
      const points = Array.isArray(rows)
        ? rows.flatMap((row) => {
            try {
              const parsed = JSON.parse(String(row)) as { t?: number; p?: number }
              return Number.isFinite(parsed.t) && Number.isFinite(parsed.p)
                ? [{ t: parsed.t!, p: parsed.p! }]
                : []
            }
            catch { return [] }
          })
        : []
      return [optionId, points] as const
    }))
  }
  catch {
    return new Map<string, Array<{ t: number; p: number }>>()
  }
}

export async function readCachedAccountSnapshot(userId: string) {
  const now = Date.now()
  const memory = memoryAccountSnapshots.get(userId)
  if (memory && memory.expiresAt > now) return memory.snapshot
  memoryAccountSnapshots.delete(userId)
  const redis = getRedis()
  if (!redis) return null
  try {
    await ensureConnected(redis)
    const value = await redis.get(accountSnapshotKey(userId))
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<UserAccountLiveSnapshot>
    if (
      (parsed.userId && parsed.userId !== userId) ||
      !Number.isFinite(parsed.version) ||
      !Number.isFinite(parsed.balance) ||
      !Array.isArray(parsed.positions)
    ) return null
    const snapshot: UserAccountLiveSnapshot = {
      userId,
      version: parsed.version!,
      balance: parsed.balance!,
      positions: parsed.positions,
    }
    memoryAccountSnapshots.set(userId, { snapshot, expiresAt: now + SNAPSHOT_TTL_SECONDS * 1000 })
    return snapshot
  }
  catch {
    return null
  }
}

export async function publishAccountSnapshot(
  snapshot: UserAccountLiveSnapshot,
  options: { mergePositions?: boolean } = {},
) {
  const current = options.mergePositions ? await readCachedAccountSnapshot(snapshot.userId) : null
  if (current && snapshot.version < current.version) return current
  const positions = new Map((current?.positions ?? []).map(position => [
    `${position.marketId}:${position.optionId}`,
    position,
  ]))
  for (const position of snapshot.positions) {
    positions.set(`${position.marketId}:${position.optionId}`, position)
  }
  const merged: UserAccountLiveSnapshot = {
    ...snapshot,
    version: Math.max(current?.version ?? 0, snapshot.version),
    positions: options.mergePositions ? Array.from(positions.values()) : snapshot.positions,
  }
  memoryAccountSnapshots.set(snapshot.userId, {
    snapshot: merged,
    expiresAt: Date.now() + SNAPSHOT_TTL_SECONDS * 1000,
  })
  const redis = getRedis()
  if (!redis) return merged
  try {
    await ensureConnected(redis)
    const serialized = JSON.stringify(merged)
    const pipeline = redis.pipeline()
    pipeline.set(accountSnapshotKey(snapshot.userId), serialized, 'EX', SNAPSHOT_TTL_SECONDS)
    pipeline.publish(`slimefish:live:account:${snapshot.userId}`, serialized)
    await pipeline.exec()
  }
  catch {
    // Redis is the read model; a cache failure cannot roll back a confirmed ledger write.
  }
  return merged
}

export function toPublicMarketSnapshot(snapshot: PublicMarketLiveSnapshot & { user?: unknown }) {
  const { user: _user, ...publicSnapshot } = snapshot
  return publicSnapshot
}

export async function readCachedMarketHistory(signature: string) {
  const now = Date.now()
  const memory = memoryHistory.get(signature)
  if (memory && memory.expiresAt > now) return memory.value
  memoryHistory.delete(signature)

  const redis = getRedis()
  if (!redis) return null
  try {
    await ensureConnected(redis)
    const value = await redis.get(historyKey(signature))
    if (value) {
      memoryHistory.set(signature, { value, expiresAt: now + HISTORY_TTL_SECONDS * 1000 })
    }
    return value
  }
  catch {
    return null
  }
}

export async function cacheMarketHistory(signature: string, value: string) {
  memoryHistory.set(signature, {
    value,
    expiresAt: Date.now() + HISTORY_TTL_SECONDS * 1000,
  })
  const redis = getRedis()
  if (!redis) return
  try {
    await ensureConnected(redis)
    await redis.set(historyKey(signature), value, 'EX', HISTORY_TTL_SECONDS)
  }
  catch {
    // History can be rebuilt from the durable ledger.
  }
}
