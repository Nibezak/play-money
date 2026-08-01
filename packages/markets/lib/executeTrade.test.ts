import Decimal from 'decimal.js'
import db from '@slimefish/database'
import { mockAccount, mockBalance } from '@slimefish/database/mocks'
import * as ECONOMY from '@slimefish/finance/economy'
import { getBalance, getMarketBalances } from '@slimefish/finance/lib/getBalances'
import { executeTrade } from './executeTrade'
import { getMarketAmmAccount } from './getMarketAmmAccount'
import { getMarketClearingAccount } from './getMarketClearingAccount'

// TODO: Test for unrealized gains
Object.defineProperty(ECONOMY, 'REALIZED_GAINS_TAX', { value: 0 })

declare global {
  namespace jest {
    interface Expect {
      closeToDecimal(expected: string | number, precision?: string | number): CustomMatcherResult
    }
    interface Matchers<R> {
      toBeCloseToDecimal(expected: string | number, precision?: string | number): R
    }
  }
}

jest.mock('./getMarketAmmAccount')
jest.mock('./getMarketClearingAccount')
jest.mock('@slimefish/finance/lib/getBalances')
jest.mock('@slimefish/database', () => ({
  __esModule: true,
  default: {
    marketOption: {
      findUnique: jest.fn(),
    },
  },
}))

describe('executeTrade', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(db.marketOption.findUnique).mockResolvedValue({
      marketId: 'market-1',
      probability: new Decimal(0.5238),
    } as any)
  })

  it('throws an error if the user does not have enough balance to purchase', async () => {
    jest.mocked(getMarketAmmAccount).mockResolvedValue(mockAccount({ id: 'ammAccountId' }))
    jest.mocked(getMarketClearingAccount).mockResolvedValue(mockAccount({ id: 'clearingAccountId' }))
    jest.mocked(getBalance).mockResolvedValue(
      mockBalance({
        accountId: 'user-account-1',
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        total: new Decimal(50),
        subtotals: {},
      })
    )
    jest.mocked(getMarketBalances).mockResolvedValue([
      mockBalance({
        accountId: 'ammAccountId',
        assetType: 'MARKET_OPTION',
        assetId: 'optionId',
        total: new Decimal(100),
        subtotals: {},
      }),
    ])

    await expect(
      executeTrade({
        accountId: 'user1',
        amount: new Decimal(100),
        marketId: 'market1',
        optionId: 'optionId',
        isBuy: true,
      })
    ).rejects.toThrow()
  })

  it('throws an error if the option to buy is not found', async () => {
    jest.mocked(getMarketAmmAccount).mockResolvedValue(mockAccount({ id: 'ammAccountId' }))
    jest.mocked(getMarketClearingAccount).mockResolvedValue(mockAccount({ id: 'clearingAccountId' }))
    jest.mocked(getBalance).mockResolvedValue(
      mockBalance({
        accountId: 'user-account-1',
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        total: new Decimal(200),
        subtotals: {},
      })
    )
    jest.mocked(getMarketBalances).mockResolvedValue([]) // No matching option

    await expect(
      executeTrade({
        accountId: 'user1',
        amount: new Decimal(100),
        marketId: 'market1',
        optionId: 'optionId',
        isBuy: true,
      })
    ).rejects.toThrow()
  })

  it('returns transaction entries for a successful trade', async () => {
    jest.mocked(getMarketAmmAccount).mockResolvedValue(mockAccount({ id: 'ammAccountId' }))
    jest.mocked(getMarketClearingAccount).mockResolvedValue(mockAccount({ id: 'clearingAccountId' }))
    jest.mocked(getBalance).mockResolvedValue(
      mockBalance({
        accountId: 'user-account-1',
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        total: new Decimal(200),
        subtotals: {},
      })
    )
    jest.mocked(getMarketBalances).mockResolvedValue([
      mockBalance({
        accountId: 'ammAccountId',
        assetType: 'MARKET_OPTION',
        assetId: 'option-1',
        total: new Decimal(1000),
        subtotals: {},
      }),
      mockBalance({
        accountId: 'ammAccountId',
        assetType: 'MARKET_OPTION',
        assetId: 'option-2',
        total: new Decimal(1000),
        subtotals: {},
      }),
    ])

    const result = await executeTrade({
      accountId: 'user-account-1',
      amount: new Decimal(100),
      marketId: 'market-1',
      optionId: 'option-1',
      isBuy: true,
    })

    expect(result.slice(0, 3)).toEqual([
      {
        amount: new Decimal(100),
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        fromAccountId: 'user-account-1',
        toAccountId: 'clearingAccountId',
      },
      {
        amount: new Decimal(100),
        assetType: 'MARKET_OPTION',
        assetId: 'option-1',
        fromAccountId: 'clearingAccountId',
        toAccountId: 'ammAccountId',
      },
      {
        amount: new Decimal(100),
        assetType: 'MARKET_OPTION',
        assetId: 'option-2',
        fromAccountId: 'clearingAccountId',
        toAccountId: 'ammAccountId',
      },
    ])
    expect(result[3]).toMatchObject({
      assetType: 'MARKET_OPTION',
      assetId: 'option-1',
      fromAccountId: 'ammAccountId',
      toAccountId: 'user-account-1',
    })
    expect(result[3]?.amount).toBeCloseToDecimal(190.91)
  })

  it('rejects the entire buy when the received shares fall below the slippage floor', async () => {
    jest.mocked(getMarketAmmAccount).mockResolvedValue(mockAccount({ id: 'ammAccountId' }))
    jest.mocked(getMarketClearingAccount).mockResolvedValue(mockAccount({ id: 'clearingAccountId' }))
    jest.mocked(getBalance).mockResolvedValue(
      mockBalance({
        accountId: 'user-account-1',
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        total: new Decimal(200),
        subtotals: {},
      })
    )
    jest.mocked(getMarketBalances).mockResolvedValue([
      mockBalance({
        accountId: 'ammAccountId',
        assetType: 'MARKET_OPTION',
        assetId: 'option-1',
        total: new Decimal(1000),
        subtotals: {},
      }),
      mockBalance({
        accountId: 'ammAccountId',
        assetType: 'MARKET_OPTION',
        assetId: 'option-2',
        total: new Decimal(1000),
        subtotals: {},
      }),
    ])

    await expect(
      executeTrade({
        accountId: 'user-account-1',
        amount: new Decimal(100),
        marketId: 'market-1',
        optionId: 'option-1',
        isBuy: true,
        minShares: new Decimal(191),
      })
    ).rejects.toThrow('Price moved beyond the allowed slippage tolerance')
  })

  it('rejects sells because AMM markets are buy-only', async () => {
    await expect(executeTrade({
      accountId: 'user-account-1',
      amount: new Decimal(64.29),
      marketId: 'market-1',
      optionId: 'option-1',
      isBuy: false,
    })).rejects.toThrow('Selling is disabled for AMM markets')
  })

  it('throws an error if market balances are empty', async () => {
    jest.mocked(getMarketAmmAccount).mockResolvedValue(mockAccount({ id: 'ammAccountId' }))
    jest.mocked(getMarketClearingAccount).mockResolvedValue(mockAccount({ id: 'clearingAccountId' }))
    jest.mocked(getBalance).mockResolvedValue(
      mockBalance({
        accountId: 'user-account-1',
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        total: new Decimal(200),
        subtotals: {},
      })
    )
    jest.mocked(getMarketBalances).mockResolvedValue([])

    await expect(
      executeTrade({
        accountId: 'user1',
        amount: new Decimal(100),
        marketId: 'market1',
        optionId: 'optionId',
        isBuy: true,
      })
    ).rejects.toThrow()
  })
})
