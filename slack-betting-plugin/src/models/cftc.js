const { getDb } = require('../db');

const CFTC_USER_ID = '__CFTC__';

async function getCftcBalance() {
  const result = await getDb().execute({ sql: 'SELECT balance FROM cftc_pool WHERE id = 1', args: [] });
  return Number(result.rows[0].balance);
}

async function addToCftcPool(amount) {
  await getDb().execute({
    sql: 'UPDATE cftc_pool SET balance = balance + ? WHERE id = 1',
    args: [amount],
  });
}

async function applyCftcBlind(marketId) {
  const db = getDb();
  const poolBalance = await getCftcBalance();
  if (poolBalance <= 0) return null;

  // Get bet totals per option for this market
  const poolsResult = await db.execute({
    sql: 'SELECT option_id, COALESCE(SUM(amount), 0) as pool FROM bets WHERE market_id = ? GROUP BY option_id',
    args: [marketId],
  });

  // Get all options for the market
  const optionsResult = await db.execute({
    sql: 'SELECT id FROM options WHERE market_id = ?',
    args: [marketId],
  });

  if (optionsResult.rows.length === 0) return null;

  // Build map of option pools, defaulting to 0 for options with no bets
  const poolMap = {};
  for (const opt of optionsResult.rows) {
    poolMap[opt.id] = 0;
  }
  for (const row of poolsResult.rows) {
    poolMap[row.option_id] = Number(row.pool);
  }

  // Check if there are any bets at all
  const totalBets = Object.values(poolMap).reduce((a, b) => a + b, 0);
  if (totalBets === 0) return null;

  // Find the option with the least bets (underdog)
  let underdogId = null;
  let underdogPool = Infinity;
  for (const [optId, pool] of Object.entries(poolMap)) {
    if (pool < underdogPool) {
      underdogPool = pool;
      underdogId = Number(optId);
    }
  }

  // Place CFTC blind bet on the underdog
  const tx = await db.transaction('write');
  try {
    await tx.execute({
      sql: 'INSERT INTO bets (slack_id, market_id, option_id, amount) VALUES (?, ?, ?, ?)',
      args: [CFTC_USER_ID, marketId, underdogId, poolBalance],
    });
    await tx.execute({
      sql: 'UPDATE cftc_pool SET balance = 0 WHERE id = 1',
      args: [],
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  // Get the option label
  const labelResult = await db.execute({
    sql: 'SELECT label FROM options WHERE id = ?',
    args: [underdogId],
  });

  return {
    amount: poolBalance,
    optionId: underdogId,
    optionLabel: labelResult.rows[0].label,
  };
}

module.exports = { CFTC_USER_ID, getCftcBalance, addToCftcPool, applyCftcBlind };
