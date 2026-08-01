import Decimal from 'decimal.js'
import db from '@slimefish/database'
import { calculateRealizedGainsTax } from '@slimefish/finance/lib/helpers'
import { calculateAmmTradeAmounts, getAmmTradeFeeBps } from '@slimefish/finance/lib/tradeFees'

export async function getMarketQuote({
  marketId,
  optionId,
  amount,
  isBuy,
}: {
  marketId: string
  optionId: string
  amount: Decimal
  isBuy: boolean
}) {
  const [feeBps, selectedOption] = await Promise.all([
    getAmmTradeFeeBps(),
    db.marketOption.findUniqueOrThrow({ where: { id: optionId }, select: { marketId: true, probability: true } }),
  ])
  if (selectedOption.marketId !== marketId) throw new Error('Target option is not part of this market')
  const tradeAmounts = isBuy
    ? calculateAmmTradeAmounts(amount, feeBps)
    : { grossAmount: amount, feeAmount: new Decimal(0), netAmount: amount }
  // MarketOption.probability is the event-wide canonical price. In particular,
  // multi-outcome events must not derive a different binary-pool price here.
  const storedProbability = Number(selectedOption.probability)
  const currentProbability = Decimal.min(0.999, Decimal.max(0.001, new Decimal(
    Number.isFinite(storedProbability) && storedProbability > 0
      ? (storedProbability > 1 ? storedProbability / 100 : storedProbability)
      : 0.5,
  )))
  // Winning shares always redeem for $1. Fees are taken once from the spend,
  // so the preview is the fee-adjusted spend divided by the current price.
  const shares = tradeAmounts.netAmount.div(currentProbability)
  const tax = isBuy ? new Decimal(0) : calculateRealizedGainsTax({ cost: tradeAmounts.netAmount, salePrice: shares })

  if (process.env.AMM_QUOTE_DEBUG === 'true') {
    console.info('[amm.quote]', {
      marketId,
      optionId,
      price: currentProbability.toFixed(6),
      grossAmount: amount.toFixed(6),
      feeAmount: tradeAmounts.feeAmount.toFixed(6),
      netAmount: tradeAmounts.netAmount.toFixed(6),
      shares: shares.toFixed(6),
    })
  }

  return {
    currentProbability,
    // Keep all consumers on the same authoritative selected-option price.
    probability: currentProbability,
    shares: shares.sub(tax),
    feeAmount: tradeAmounts.feeAmount,
    netAmount: tradeAmounts.netAmount,
    feeBps,
  }
}
