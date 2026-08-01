import db from '@slimefish/database'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import { publishAccountSnapshot, publishPublicSnapshots } from './liveSnapshotCache'

let lastIssuedLiveVersion = 0

function issueLiveVersion(floor: number) {
  lastIssuedLiveVersion = Math.max(Date.now(), floor, lastIssuedLiveVersion + 1)
  return lastIssuedLiveVersion
}

export interface PublicMarketLiveSnapshot {
  marketId: string
  eventId: string
  status: 'active' | 'closed' | 'resolved' | 'canceled'
  version: number
  volume: number
  volume24h: number
  liquidity: number
  options: Array<{
    id: string
    name: string
    color: string | null
    probability: number
  }>
}

function publicLiveMarketSelect() {
  return {
  id: true,
  question: true,
  eventId: true,
  closeDate: true,
  resolvedAt: true,
  canceledAt: true,
  liquidityCount: true,
  volume: true,
  updatedAt: true,
  volumeBuckets: {
    where: { bucketStart: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    select: { volume: true, updatedAt: true },
  },
  event: { select: { marketMode: true, title: true } },
  options: {
    orderBy: { createdAt: 'asc' as const },
    select: { id: true, name: true, color: true, probability: true, updatedAt: true },
  },
  } as const
}

function normalizeProbability(value: unknown) {
  const probability = Number(value)
  if (!Number.isFinite(probability)) return 0
  return Math.max(0, Math.min(1, probability > 1 ? probability / 100 : probability))
}

export async function getMarketLiveSnapshot({ marketId, userId }: { marketId: string; userId?: string }) {
  const account = userId ? await getUserPrimaryAccount({ userId }) : null

  const [market, balance, positions] = await Promise.all([
    db.market.findUniqueOrThrow({
      where: { id: marketId },
      select: {
        id: true,
        eventId: true,
        closeDate: true,
        resolvedAt: true,
        canceledAt: true,
        liquidityCount: true,
        volume: true,
        updatedAt: true,
        volumeBuckets: {
          where: { bucketStart: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          select: { volume: true, updatedAt: true },
        },
        options: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, color: true, probability: true, updatedAt: true },
        },
      },
    }),
    account
      ? db.balance.findFirst({
          where: { accountId: account.id, assetType: 'CURRENCY', assetId: 'PRIMARY', marketId: null },
          select: { total: true, updatedAt: true },
        })
      : null,
    account
      ? db.marketOptionPosition.findMany({
          where: { accountId: account.id, marketId },
          select: { optionId: true, cost: true, quantity: true, value: true, updatedAt: true },
        })
      : [],
  ])

  const timestamps = [
    market.updatedAt,
    ...market.volumeBuckets.map((bucket) => bucket.updatedAt),
    balance?.updatedAt,
    ...market.options.map((option) => option.updatedAt),
    ...positions.map((position) => position.updatedAt),
  ].filter((value): value is Date => Boolean(value))

  const status: 'active' | 'closed' | 'resolved' | 'canceled' = market.resolvedAt
    ? 'resolved'
    : market.canceledAt
      ? 'canceled'
      : market.closeDate && market.closeDate <= new Date()
        ? 'closed'
        : 'active'

  const snapshot = {
    marketId: market.id,
    eventId: market.eventId ?? '',
    status,
    version: Math.max(...timestamps.map((value) => value.getTime())),
    volume: Number(market.volume || 0),
    volume24h: market.volumeBuckets.reduce((sum, bucket) => sum + Number(bucket.volume || 0), 0),
    liquidity: Number(market.liquidityCount || 0),
    options: market.options.map((option) => ({
      id: option.id,
      name: option.name,
      color: option.color,
      probability: normalizeProbability(option.probability),
    })),
    user: account
      ? {
          balance: Number(balance?.total || 0),
          positions: positions.map((position) => ({
            optionId: position.optionId,
            optionName: market.options.find((option) => option.id === position.optionId)?.name ?? '',
            outcomeIndex: Math.max(0, market.options.findIndex((option) => option.id === position.optionId)),
            cost: Number(position.cost),
            quantity: Number(position.quantity),
            value: Number(position.value),
          })),
        }
      : null,
  }
  if (account && snapshot.user) {
    await publishAccountSnapshot({
      userId: userId!,
      version: snapshot.version,
      balance: snapshot.user.balance,
      positions: snapshot.user.positions.map(position => ({ ...position, marketId })),
    }, { mergePositions: true })
  }
  return snapshot
}

export async function getPublicMarketLiveSnapshots(marketIds: string[]): Promise<PublicMarketLiveSnapshot[]> {
  const ids = Array.from(new Set(marketIds))
  const requestedMarkets = await db.market.findMany({
    where: { id: { in: ids } },
    select: publicLiveMarketSelect(),
  })
  const uniqueEventIds = requestedMarkets.flatMap(market =>
    market.eventId && market.event?.marketMode === 'multi_unique' ? [market.eventId] : [],
  )
  const siblingMarkets = uniqueEventIds.length > 0
    ? await db.market.findMany({
        where: { eventId: { in: uniqueEventIds }, id: { notIn: ids } },
        select: publicLiveMarketSelect(),
      })
    : []
  const markets = [...requestedMarkets, ...siblingMarkets]
  const expandedIds = markets.map(market => market.id)

  const uniqueGroups = new Map<string, typeof markets>()
  for (const market of markets) {
    if (!market.eventId || market.event?.marketMode !== 'multi_unique') continue
    if (market.question.trim().toLowerCase() === market.event.title.trim().toLowerCase() && markets.some(
      sibling => sibling.eventId === market.eventId && sibling.id !== market.id,
    )) continue
    const group = uniqueGroups.get(market.eventId) ?? []
    group.push(market)
    uniqueGroups.set(market.eventId, group)
  }
  const normalizedYes = new Map<string, number>()
  const groupedVersions = new Map<string, number>()
  for (const group of Array.from(uniqueGroups.values())) {
    const raw = group.map(market => normalizeProbability(market.options[0]?.probability))
    const total = raw.reduce((sum, value) => sum + value, 0)
    const groupVersion = Math.max(...group.flatMap(market => [
      market.updatedAt.getTime(),
      ...market.options.map(option => option.updatedAt.getTime()),
      ...market.volumeBuckets.map(bucket => bucket.updatedAt.getTime()),
    ]))
    group.forEach((market, index) => {
      normalizedYes.set(market.id, total > 0 ? raw[index] / total : 1 / group.length)
      groupedVersions.set(market.id, groupVersion)
    })
  }

  const byId = new Map(markets.map((market) => {
    const status: 'active' | 'closed' | 'resolved' | 'canceled' = market.resolvedAt
      ? 'resolved'
      : market.canceledAt
        ? 'canceled'
        : market.closeDate && market.closeDate <= new Date()
          ? 'closed'
          : 'active'
    const marketVersion = Math.max(
      market.updatedAt.getTime(),
      ...market.options.map((option) => option.updatedAt.getTime()),
      ...market.volumeBuckets.map((bucket) => bucket.updatedAt.getTime()),
    )
    // A multi-unique event is one probability set. A trade on one sibling
    // changes every sibling's normalized odds, so they must advance under the
    // same version or the live cache will correctly reject part of the update.
    const version = Math.max(marketVersion, groupedVersions.get(market.id) ?? 0)
    return [market.id, {
      marketId: market.id,
      eventId: market.eventId ?? '',
      status,
      version,
      volume: Number(market.volume || 0),
      volume24h: market.volumeBuckets.reduce((sum, bucket) => sum + Number(bucket.volume || 0), 0),
      liquidity: Number(market.liquidityCount || 0),
      options: market.options.map((option, optionIndex) => ({
        id: option.id,
        name: option.name,
        color: option.color,
        probability: normalizedYes.has(market.id)
          ? (optionIndex === 0 ? normalizedYes.get(market.id)! : 1 - normalizedYes.get(market.id)!)
          : normalizeProbability(option.probability),
      })),
    }] as const
  }))

  return expandedIds.flatMap((id) => {
    const snapshot = byId.get(id)
    return snapshot ? [snapshot] : []
  })
}

export async function publishFreshPublicMarketSnapshots(marketIds: string[]) {
  const snapshots = await getPublicMarketLiveSnapshots(marketIds)
  await publishPublicSnapshots(snapshots)
  return snapshots
}

export async function publishFreshMarketLiveBundle({ marketId, userId }: { marketId: string; userId: string }) {
  const accountPromise = getUserPrimaryAccount({ userId })
  const publicSnapshotsPromise = getPublicMarketLiveSnapshots([marketId])
  const account = await accountPromise
  const [publicSnapshots, balance, positions] = await Promise.all([
    publicSnapshotsPromise,
    db.balance.findFirst({
      where: { accountId: account.id, assetType: 'CURRENCY', assetId: 'PRIMARY', marketId: null },
      select: { total: true, updatedAt: true },
    }),
    db.marketOptionPosition.findMany({
      where: { accountId: account.id, marketId },
      select: { optionId: true, cost: true, quantity: true, value: true, updatedAt: true },
    }),
  ])
  const publicSnapshot = publicSnapshots.find(snapshot => snapshot.marketId === marketId)
  if (!publicSnapshot) throw new Error('Market live snapshot not found')

  const version = issueLiveVersion(Math.max(
    publicSnapshot.version,
    balance?.updatedAt.getTime() ?? 0,
    ...positions.map(position => position.updatedAt.getTime()),
  ))
  const versionedPublicSnapshots = publicSnapshots.map(snapshot => ({
    ...snapshot,
    version,
  }))
  const user = {
    balance: Number(balance?.total || 0),
    positions: positions.map(position => ({
      optionId: position.optionId,
      optionName: publicSnapshot.options.find(option => option.id === position.optionId)?.name ?? '',
      outcomeIndex: Math.max(0, publicSnapshot.options.findIndex(option => option.id === position.optionId)),
      cost: Number(position.cost),
      quantity: Number(position.quantity),
      value: Number(position.value),
    })),
  }

  await Promise.all([
    publishPublicSnapshots(versionedPublicSnapshots),
    publishAccountSnapshot({
      userId,
      version,
      balance: user.balance,
      positions: user.positions.map(position => ({ ...position, marketId })),
    }, { mergePositions: true }),
  ])

  return {
    markets: versionedPublicSnapshots,
    snapshot: { ...publicSnapshot, version, user },
  }
}
