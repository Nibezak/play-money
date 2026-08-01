import Decimal from 'decimal.js'
import '@slimefish/config/jest/jest-setup'
import db from '@slimefish/database'
import { mockAccount, mockBalance } from '@slimefish/database/mocks'
import { executeTransaction } from '@slimefish/finance/lib/executeTransaction'
import { getMarketBalances, getBalance } from '@slimefish/finance/lib/getBalances'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import { createMarketBuyTransaction } from './createMarketBuyTransaction'
import { getMarketAmmAccount } from './getMarketAmmAccount'
import { getMarketClearingAccount } from './getMarketClearingAccount'

jest.mock('./getMarketAmmAccount')
jest.mock('./getMarketClearingAccount')
jest.mock('@slimefish/users/lib/getUserPrimaryAccount')
jest.mock('@slimefish/finance/lib/executeTransaction')
jest.mock('@slimefish/finance/lib/getBalances')
jest.mock('@slimefish/database', () => ({
  __esModule: true,
  default: {
    marketOption: {
      findUnique: jest.fn(),
    },
  },
}))

describe('createMarketBuyTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    jest.mocked(getUserPrimaryAccount).mockResolvedValue(mockAccount({ id: 'user-1-account' }))
    jest.mocked(getMarketAmmAccount).mockResolvedValue(mockAccount({ id: 'amm-1-account' }))
    jest.mocked(getMarketClearingAccount).mockResolvedValue(mockAccount({ id: 'EXCHANGER' }))
    jest.mocked(db.marketOption.findUnique).mockResolvedValue({
      marketId: 'market-1',
      probability: new Decimal(0.7776),
    } as any)
  })

  it('should call executeTransaction with approperate entries', async () => {
    jest.mocked(getBalance).mockResolvedValue(
      mockBalance({
        accountId: 'user-1',
        assetType: 'CURRENCY',
        assetId: 'PRIMARY',
        total: new Decimal(200),
        subtotals: {},
      })
    )
    jest.mocked(getMarketBalances).mockResolvedValue([
      mockBalance({
        accountId: 'amm-1-account',
        assetType: 'MARKET_OPTION',
        assetId: 'option-1',
        total: new Decimal(100),
        subtotals: {},
      }),
      mockBalance({
        accountId: 'amm-1-account',
        assetType: 'MARKET_OPTION',
        assetId: 'option-2',
        total: new Decimal(300),
        subtotals: {},
      }),
    ])

    await createMarketBuyTransaction({
      initiatorId: 'user-1',
      accountId: 'account-1',
      amount: new Decimal(50),
      marketId: 'market-1',
      optionId: 'option-1',
    })

    expect(executeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: expect.arrayContaining([
          {
            amount: new Decimal(50),
            assetType: 'CURRENCY',
            assetId: 'PRIMARY',
            fromAccountId: 'account-1',
            toAccountId: 'EXCHANGER',
          },
          {
            amount: new Decimal(50),
            assetType: 'MARKET_OPTION',
            assetId: 'option-1',
            fromAccountId: 'EXCHANGER',
            toAccountId: 'amm-1-account',
          },
          {
            amount: new Decimal(50),
            assetType: 'MARKET_OPTION',
            assetId: 'option-2',
            fromAccountId: 'EXCHANGER',
            toAccountId: 'amm-1-account',
          },
          {
            amount: expect.closeToDecimal(64.3),
            assetType: 'MARKET_OPTION',
            assetId: 'option-1',
            fromAccountId: 'amm-1-account',
            toAccountId: 'account-1',
          },
        ]),
      })
    )
  })
})
