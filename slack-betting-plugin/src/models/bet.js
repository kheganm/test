const { getDb } = require('../db');
const { deductBalance } = require('./user');

async function placeBet(slackId, marketId, optionId, amount) {
  const db = getDb();
  const marketResult = await db.execute({ sql: 'SELECT * FROM markets WHERE id = ?', args: [marketId] });
  if (marketResult.rows.length === 0) throw new Error('Market not found.');
  if (marketResult.rows[0].status !== 'open') throw new Error('This market is no longer accepting bets.');

  const optionResult = await db.execute({ sql: 'SELECT * FROM options WHERE id = ? AND market_id = ?', args: [optionId, marketId] });
  if (optionResult.rows.length === 0) throw new Error('Invalid option.');

  await deductBalance(slackId, amount);
  await db.execute({
    sql: 'INSERT INTO bets (slack_id, market_id, option_id, amount) VALUES (?, ?, ?, ?)',
    args: [slackId, marketId, optionId, amount],
  });
}

async function getPoolByOption(marketId) {
  const result = await getDb().execute({
    sql: 'SELECT option_id, COALESCE(SUM(amount), 0) as pool, COUNT(*) as num_bets FROM bets WHERE market_id = ? GROUP BY option_id',
    args: [marketId],
  });
  return result.rows;
}

async function getTotalPool(marketId) {
  const result = await getDb().execute({
    sql: 'SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE market_id = ?',
    args: [marketId],
  });
  return Number(result.rows[0].total);
}

async function getUserBetsOnMarket(slackId, marketId) {
  const result = await getDb().execute({
    sql: 'SELECT b.*, o.label as option_label FROM bets b JOIN options o ON b.option_id = o.id WHERE b.slack_id = ? AND b.market_id = ?',
    args: [slackId, marketId],
  });
  return result.rows;
}

async function getTopBettorsByOption(marketId) {
  const result = await getDb().execute({
    sql: `SELECT option_id, slack_id, SUM(amount) as total
          FROM bets WHERE market_id = ?
          GROUP BY option_id, slack_id
          ORDER BY option_id, total DESC`,
    args: [marketId],
  });

  const byOption = {};
  for (const row of result.rows) {
    const optId = row.option_id;
    if (!byOption[optId]) byOption[optId] = [];
    if (byOption[optId].length < 5) {
      byOption[optId].push({ slackId: row.slack_id, total: Number(row.total) });
    }
  }
  return byOption;
}

module.exports = { placeBet, getPoolByOption, getTotalPool, getUserBetsOnMarket, getTopBettorsByOption };
