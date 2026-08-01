import Decimal from 'decimal.js'
import '@slimefish/config/jest/jest-setup'
import { mockAccount, mockBalance, mockMarketOptionPosition } from '@slimefish/database/mocks'
import * as ECONOMY from '@slimefish/finance/economy'
import { executeTransaction } from '@slimefish/finance/lib/executeTransaction'
import { getMarketBalances, getBalance } from '@slimefish/finance/lib/getBalances'
import { getHouseAccount } from '@slimefish/finance/lib/getHouseAccount'
import { getMarketOptionPosition } from '@slimefish/users/lib/getMarketOptionPosition'
import { getUserPrimaryAccount } from '@slimefish/users/lib/getUserPrimaryAccount'
import { createMarketSellTransaction } from './createMarketSellTransaction'
import { getMarketAmmAccount } from './getMarketAmmAccount'
import { getMarketClearingAccount } from './getMarketClearingAccount'

// TODO: Test for unrealized gains
Object.defineProperty(ECONOMY, 'REALIZED_GAINS_TAX', { value: 0 })

jest.mock('./getMarketAmmAccount')
jest.mock('./getMarketClearingAccount')
jest.mock('@slimefish/users/lib/getUserPrimaryAccount')
jest.mock('@slimefish/finance/lib/executeTransaction')
jest.mock('@slimefish/finance/lib/getBalances')
jest.mock('@slimefish/finance/lib/getHouseAccount')
jest.mock('@slimefish/users/lib/getMarketOptionPosition')

describe('createMarketSellTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    jest.mocked(getUserPrimaryAccount).mockResolvedValue(mockAccount({ id: 'user-1-account' }))
    jest.mocked(getMarketAmmAccount).mockResolvedValue(mockAccount({ id: 'amm-1-account' }))
    jest.mocked(getMarketClearingAccount).mockResolvedValue(mockAccount({ id: 'EXCHANGER' }))
    jest.mocked(getHouseAccount).mockResolvedValue(mockAccount({ id: 'HOUSE' }))
  })

  it('rejects sells because AMM markets are buy-only', async () => {
    jest.mocked(getMarketOptionPosition).mockResolvedValue(
      mockMarketOptionPosition({
        accountId: 'account-1',
        optionId: 'option-1',
      })
    )
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
        accountId: 'ammAccountId',
        assetType: 'MARKET_OPTION',
        assetId: 'option-1',
        total: new Decimal(85.71),
        subtotals: {},
      }),
      mockBalance({
        accountId: 'ammAccountId',
        assetType: 'MARKET_OPTION',
        assetId: 'option-2',
        total: new Decimal(350),
        subtotals: {},
      }),
    ])

    await expect(createMarketSellTransaction({
      initiatorId: 'user-1',
      accountId: 'account-1',
      amount: new Decimal(64.29),
      marketId: 'market-1',
      optionId: 'option-1',
    })).rejects.toThrow('Selling is disabled for AMM markets')
    expect(executeTransaction).not.toHaveBeenCalled()
  })
})
