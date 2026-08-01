import { User, Market } from '@slimefish/database'

export function canModifyMarket({ market, user }: { market: Market; user: User }) {
  if (isMarketResolved({ market })) {
    return false
  }
  if (isMarketCanceled({ market })) {
    return false
  }
  return user.role === 'ADMIN' || user.role === 'RESOLVER' || user.role === 'MODERATOR'
}

export function isMarketTradable({ market }: { market: Market }): boolean {
  if (isMarketResolved({ market })) {
    return false
  }
  const now = new Date()
  return !market.closeDate || new Date(market.closeDate) > now
}

export function isMarketClosed({ market }: { market: Market }): boolean {
  return !isMarketTradable({ market }) && !isMarketResolved({ market }) && !isMarketCanceled({ market })
}

export function isMarketResolved({ market }: { market: Market }): boolean {
  return Boolean(market.resolvedAt)
}

export function isMarketCanceled({ market }: { market: Market }): boolean {
  return Boolean(market.canceledAt)
}
