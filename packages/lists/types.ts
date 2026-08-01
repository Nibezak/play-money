import { List, User } from '@slimefish/database'
import { ExtendedMarket } from '@slimefish/markets/types'

export type ExtendedList = List & {
  owner: User
  markets: Array<{
    createdAt: Date
    market: ExtendedMarket
  }>
}
