import db from '@slimefish/database';

async function main() {
  const users = await db.user.findMany({
    take: 5,
    include: {
      primaryAccount: true
    }
  });

  for (const user of users) {
    console.log(`User ${user.id} - Primary Account ${user.primaryAccountId}`);
    const balances = await db.balance.findMany({
      where: {
        accountId: user.primaryAccountId
      }
    });
    console.log('Balances:', balances);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
