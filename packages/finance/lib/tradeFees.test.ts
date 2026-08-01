import Decimal from 'decimal.js'
import { calculateAmmTradeAmounts } from './tradeFees'

describe('calculateAmmTradeAmounts', () => {
  it('deducts a basis-point fee from the submitted amount', () => {
    const result = calculateAmmTradeAmounts(new Decimal('100.00'), 500)

    expect(result.feeAmount.toFixed(2)).toBe('5.00')
    expect(result.netAmount.toFixed(2)).toBe('95.00')
    expect(result.grossAmount.toFixed(2)).toBe('100.00')
  })

  it('rounds currency fees to two decimal places', () => {
    const result = calculateAmmTradeAmounts(new Decimal('12.34'), 175)

    expect(result.feeAmount.toFixed(2)).toBe('0.22')
    expect(result.netAmount.toFixed(2)).toBe('12.12')
  })

  it('rejects invalid fee configurations', () => {
    expect(() => calculateAmmTradeAmounts(new Decimal('10'), 901)).toThrow('Invalid AMM trade fee')
  })
})
