import Decimal from 'decimal.js'
import db from '@slimefish/database'

export const AMM_TRADE_FEE_GROUP = 'fees'
export const AMM_TRADE_FEE_KEY = 'amm_trade_fee_bps'
export const DEFAULT_AMM_TRADE_FEE_BPS = 100
const MAX_AMM_TRADE_FEE_BPS = 900

export async function getAmmTradeFeeBps() {
  const setting = await db.setting.findUnique({
    where: { group_key: { group: AMM_TRADE_FEE_GROUP, key: AMM_TRADE_FEE_KEY } },
    select: { value: true },
  })
  const parsed = setting ? Number.parseInt(setting.value, 10) : Number.NaN
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_AMM_TRADE_FEE_BPS
    ? parsed
    : DEFAULT_AMM_TRADE_FEE_BPS
}

export function calculateAmmTradeAmounts(grossAmount: Decimal, feeBps: number) {
  if (!grossAmount.isFinite() || grossAmount.lte(0)) {
    throw new Error('Trade amount must be positive and finite')
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_AMM_TRADE_FEE_BPS) {
    throw new Error('Invalid AMM trade fee')
  }

  const feeAmount = grossAmount
    .mul(feeBps)
    .div(10_000)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const netAmount = grossAmount.sub(feeAmount)
  if (netAmount.lte(0)) {
    throw new Error('Trade amount is too small after fees')
  }

  return { grossAmount, feeAmount, netAmount }
}
