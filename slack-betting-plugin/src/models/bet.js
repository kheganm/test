const { getDb } = require('../db');
const { deductBalance } = require('./user');

function placeBet(slackId, marketId, optionId, amount) {
  const db = getDb();
  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId);
  if (!market) throw new Error('Market not found.');
  if (market.status !== 'open') throw new Error('This market is no longer accepting bets.');

  const option = db.prepare('SELECT * FROM options WHERE id = ? AND market_id = ?').get(optionId, marketId);
  if (!option) throw new Error('Invalid option.');

  deductBalance(slackId, amount);
  db.prepare('INSERT INTO bets (slack_id, market_id, option_id, amount) VALUES (?, ?, ?, ?)').run(slackId, marketId, optionId, amount);
}

function getMarketBets(marketId) {
  const db = getDb();
  return db.prepare('SELECT * FROM bets WHERE market_id = ?').all(marketId);
}

function getPoolByOption(marketId) {
  const db = getDb();
  return db.prepare(`
    SELECT option_id, COALESCE(SUM(amount), 0) as pool, COUNT(*) as num_bets
    FROM bets WHERE market_id = ? GROUP BY option_id
  `).all(marketId);
}

function getTotalPool(marketId) {
  const db = getDb();
  return db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE market_id = ?').get(marketId).total;
}

function getUserBetsOnMarket(slackId, marketId) {
  const db = getDb();
  return db.prepare(`
    SELECT b.*, o.label as option_label
    FROM bets b JOIN options o ON b.option_id = o.id
    WHERE b.slack_id = ? AND b.market_id = ?
  `).all(slackId, marketId);
}

module.exports = { placeBet, getMarketBets, getPoolByOption, getTotalPool, getUserBetsOnMarket };
