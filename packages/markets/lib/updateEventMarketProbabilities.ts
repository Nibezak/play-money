import Decimal from 'decimal.js'
import db from '@slimefish/database'
import { calculateProbability } from '@slimefish/finance/amms/maniswap-v1.1'
import { distributeRemainder } from '@slimefish/finance/lib/helpers'

function rawYesProbability({
  options,
  balances,
  ammAccountId,
}: {
  options: Array<{ id: string; probability: number | null }>
  balances: Array<{ accountId: string; assetId: string; total: Decimal }>
  ammAccountId: string
}) {
  const shares = options.map((option) => (
    balances.find((balance) => balance.accountId === ammAccountId && balance.assetId === option.id)?.total
    ?? new Decimal(0)
  ))
  const hasLiquidity = shares.length > 1 && shares.every((share) => share.gt(0))
  if (hasLiquidity) return calculateProbability({ index: 0, shares })

  const stored = Number(options[0]?.probability)
  return new Decimal(Number.isFinite(stored) ? (stored > 1 ? stored / 100 : stored) : 0.5)
}

/** Persist the one authoritative probability set used by every event surface. */
export async function updateEventMarketProbabilities(marketId: string) {
  const requested = await db.market.findUniqueOrThrow({
    where: { id: marketId },
    select: { eventId: true, event: { select: { marketMode: true, title: true } } },
  })
  // Some maintenance callers can race a market deletion; there is nothing left to refresh.
  if (!requested) return [marketId]

  const grouped = Boolean(requested.eventId && requested.event?.marketMode === 'multi_unique')
  const markets = await db.market.findMany({
    where: grouped ? { eventId: requested.eventId } : { id: marketId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      question: true,
      ammAccountId: true,
      options: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, probability: true },
      },
      balances: {
        where: { assetType: 'MARKET_OPTION' },
        select: { accountId: true, assetId: true, total: true },
      },
    },
  })
  const candidates = grouped
    ? markets.filter((market) => (
        market.question.trim().toLowerCase() !== requested.event!.title.trim().toLowerCase()
        || markets.length === 1
      ))
    : markets
  if (candidates.length === 0) return [marketId]

  if (!grouped) {
    const market = candidates[0]
    const raw = market.options.map((_option, index) => calculateProbability({
      index,
      shares: market.options.map((option) => (
        market.balances.find((balance) => (
          balance.accountId === market.ammAccountId && balance.assetId === option.id
        ))?.total ?? new Decimal(0)
      )),
    }))
    const percentages = distributeRemainder(raw)
    await db.$transaction(market.options.map((option, index) => db.marketOption.update({
      where: { id: option.id },
      data: { probability: percentages[index].toNumber(), updatedAt: new Date() },
    })))
    return [market.id]
  }

  const raw = candidates.map((market) => rawYesProbability(market))
  const percentages = distributeRemainder(raw)
  const now = new Date()
  await db.$transaction(candidates.flatMap((market, index) => {
    const yes = percentages[index].toNumber()
    return [
      ...market.options.slice(0, 2).map((option, optionIndex) => db.marketOption.update({
        where: { id: option.id },
        data: { probability: optionIndex === 0 ? yes : 100 - yes, updatedAt: now },
      })),
      db.market.update({ where: { id: market.id }, data: { updatedAt: now } }),
    ]
  }))
  return candidates.map((market) => market.id)
}
