import Decimal from 'decimal.js'

export async function marketSell({
  marketId,
  optionId,
  userId,
  amount,
}: {
  marketId: string
  optionId: string
  userId: string
  amount: Decimal
}) {
  void marketId
  void optionId
  void userId
  void amount
  throw new Error('Positions are locked until this market is resolved')
}
