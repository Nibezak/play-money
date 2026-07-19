import { marketBuy } from './packages/markets/lib/marketBuy';
import db from './packages/database';
import Decimal from 'decimal.js';

async function main() {
  const users = await db.user.findMany({ where: { id: { startsWith: 'user_fake_' } }, take: 1 });
  const user = users[0];

  const markets = await db.market.findMany({ where: { canceledAt: null, resolvedAt: null }, take: 1, include: { options: true } });
  const market = markets[0];

  console.log(`Buying for user ${user.id} in market ${market.id} option ${market.options[0].id}`);

  try {
    const ammAccount = await db.account.findFirst({ where: { marketId: market.id, type: 'MARKET_AMM' } });
    if (!ammAccount) {
        console.log('No AMM account for market!');
        return;
    }
    const ammBalances = await db.balance.findMany({ where: { accountId: ammAccount.id } });
    console.log('AMM balances:', ammBalances.map(b => ({ type: b.assetType, id: b.assetId, total: b.total })));
    
    await marketBuy({
      marketId: market.id,
      optionId: market.options[0].id,
      userId: user.id,
      amount: new Decimal(10),
    });
    console.log('Success!');
  } catch (err: any) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
