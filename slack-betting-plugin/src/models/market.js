const { getDb } = require('../db');

function createMarket(title, description, createdBy, channelId, optionLabels) {
  const db = getDb();
  const insert = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO markets (title, description, created_by, channel_id) VALUES (?, ?, ?, ?)'
    ).run(title, description, createdBy, channelId);

    const marketId = result.lastInsertRowid;
    const insertOption = db.prepare('INSERT INTO options (market_id, label) VALUES (?, ?)');
    for (const label of optionLabels) {
      insertOption.run(marketId, label);
    }
    return marketId;
  });
  return insert();
}

function getMarket(marketId) {
  const db = getDb();
  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId);
  if (!market) return null;
  market.options = db.prepare('SELECT * FROM options WHERE market_id = ?').all(marketId);
  return market;
}

function getActiveMarkets(channelId) {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM markets WHERE channel_id = ? AND status IN ('open', 'closed') ORDER BY created_at DESC"
  ).all(channelId);
}

function setMessageTs(marketId, messageTs) {
  const db = getDb();
  db.prepare('UPDATE markets SET message_ts = ? WHERE id = ?').run(messageTs, marketId);
}

function closeMarket(marketId) {
  const db = getDb();
  db.prepare("UPDATE markets SET status = 'closed', closed_at = datetime('now') WHERE id = ? AND status = 'open'").run(marketId);
}

function resolveMarket(marketId, winningOptionId) {
  const db = getDb();
  const resolve = db.transaction(() => {
    db.prepare("UPDATE markets SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?").run(marketId);
    db.prepare('UPDATE options SET is_winner = 1 WHERE id = ? AND market_id = ?').run(winningOptionId, marketId);

    // Calculate payouts
    const totalPool = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE market_id = ?').get(marketId).total;
    const winningPool = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE market_id = ? AND option_id = ?').get(marketId, winningOptionId).total;

    if (winningPool === 0 || totalPool === 0) return [];

    // Get winning bets and distribute proportionally
    const winningBets = db.prepare('SELECT * FROM bets WHERE market_id = ? AND option_id = ?').all(marketId, winningOptionId);
    const updatePayout = db.prepare('UPDATE bets SET payout = ? WHERE id = ?');
    const updateBalance = db.prepare('UPDATE users SET balance = balance + ? WHERE slack_id = ?');

    const payouts = [];
    for (const bet of winningBets) {
      const payout = Math.floor((bet.amount / winningPool) * totalPool);
      updatePayout.run(payout, bet.id);
      updateBalance.run(payout, bet.slack_id);
      payouts.push({ slackId: bet.slack_id, amount: bet.amount, payout });
    }
    return payouts;
  });
  return resolve();
}

function cancelMarket(marketId) {
  const db = getDb();
  const cancel = db.transaction(() => {
    db.prepare("UPDATE markets SET status = 'cancelled' WHERE id = ?").run(marketId);
    // Refund all bets
    const bets = db.prepare('SELECT * FROM bets WHERE market_id = ?').all(marketId);
    const updateBalance = db.prepare('UPDATE users SET balance = balance + ? WHERE slack_id = ?');
    for (const bet of bets) {
      updateBalance.run(bet.amount, bet.slack_id);
    }
    return bets;
  });
  return cancel();
}

module.exports = { createMarket, getMarket, getActiveMarkets, setMessageTs, closeMarket, resolveMarket, cancelMarket };
