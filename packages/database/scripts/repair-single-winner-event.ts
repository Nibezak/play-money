import Decimal from 'decimal.js'
import db from '../prisma'
import { cancelMarket } from '../../markets/lib/cancelMarket'
import { createMarket } from '../../markets/lib/createMarket'

async function main() {
  const eventSlug = process.argv[2]
  const totalLiquidity = new Decimal(process.argv[3] || '5')

  if (!eventSlug) {
    throw new Error('Usage: tsx repair-single-winner-event.ts <event-slug> [total-liquidity]')
  }
  if (!totalLiquidity.isFinite() || totalLiquidity.lte(0)) {
    throw new Error('Total liquidity must be greater than zero.')
  }

  const event = await db.event.findUnique({
    where: { slug: eventSlug },
    include: {
      markets: {
        include: {
          options: { orderBy: { createdAt: 'asc' } },
          positions: true,
          transactions: true,
        },
      },
    },
  })

  if (!event) {
    throw new Error(`Event not found: ${eventSlug}`)
  }

  const legacyMarket = event.markets.find(market => !market.canceledAt && market.options.length > 2)
  if (!legacyMarket) {
    const activeBinaryMarkets = event.markets.filter(market => !market.canceledAt && market.options.length === 2)
    if (event.endDate && activeBinaryMarkets.length > 0) {
      await db.market.updateMany({
        where: { id: { in: activeBinaryMarkets.map(market => market.id) } },
        data: { closeDate: event.endDate },
      })
    }
    console.log(JSON.stringify({
      repaired: false,
      reason: 'No legacy multi-option market found.',
      normalizedCloseDate: event.endDate,
      marketIds: activeBinaryMarkets.map(market => market.id),
    }))
    return
  }

  const userTrades = legacyMarket.transactions.filter(transaction => (
    transaction.type === 'TRADE_BUY' || transaction.type === 'TRADE_SELL'
  ))
  const openPositions = legacyMarket.positions.filter(position => !new Decimal(position.quantity).isZero())
  if (userTrades.length > 0 || openPositions.length > 0) {
    throw new Error('Refusing to restructure a market that already has trades or positions.')
  }

  await cancelMarket({
    canceledById: legacyMarket.createdBy,
    marketId: legacyMarket.id,
    reason: 'Replaced legacy multi-option pool with binary candidate markets.',
  })

  const perMarketLiquidity = totalLiquidity.div(legacyMarket.options.length)
  const yesProbability = new Decimal(1).div(legacyMarket.options.length).toNumber()
  const createdMarkets = []

  for (const candidate of legacyMarket.options) {
    const market = await createMarket({
      question: candidate.name,
      description: legacyMarket.description,
      closeDate: event.endDate ?? legacyMarket.closeDate,
      createdBy: legacyMarket.createdBy,
      eventId: event.id,
      tags: legacyMarket.tags,
      options: [
        { name: 'Yes', color: '#22C55E', probability: yesProbability },
        { name: 'No', color: '#F43F5E', probability: 1 - yesProbability },
      ],
      subsidyAmount: perMarketLiquidity,
    })
    createdMarkets.push(market)
  }

  console.log(JSON.stringify({
    repaired: true,
    event: { id: event.id, slug: event.slug, title: event.title },
    retiredMarketId: legacyMarket.id,
    markets: createdMarkets.map(market => ({
      id: market.id,
      question: market.question,
      slug: market.slug,
      closeDate: market.closeDate,
      options: market.options.map((option, index) => ({
        id: option.id,
        name: option.name,
        index,
      })),
    })),
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
