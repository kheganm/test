const { getDb } = require('../db');

async function createMarket(title, description, createdBy, channelId, optionLabels, closeAt) {
  const db = getDb();
  const tx = await db.transaction('write');
  try {
    const result = await tx.execute({
      sql: 'INSERT INTO markets (title, description, created_by, channel_id, close_at) VALUES (?, ?, ?, ?, ?)',
      args: [title, description, createdBy, channelId, closeAt || null],
    });
    const marketId = Number(result.lastInsertRowid);

    for (const label of optionLabels) {
      await tx.execute({ sql: 'INSERT INTO options (market_id, label) VALUES (?, ?)', args: [marketId, label] });
    }
    await tx.commit();
    return marketId;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function getMarket(marketId) {
  const db = getDb();
  const marketResult = await db.execute({ sql: 'SELECT * FROM markets WHERE id = ?', args: [marketId] });
  if (marketResult.rows.length === 0) return null;
  const market = marketResult.rows[0];
  const optionsResult = await db.execute({ sql: 'SELECT * FROM options WHERE market_id = ?', args: [marketId] });
  market.options = optionsResult.rows;
  return market;
}

async function getActiveMarkets(channelId) {
  const result = await getDb().execute({
    sql: "SELECT * FROM markets WHERE channel_id = ? AND status IN ('open', 'closed') ORDER BY created_at DESC",
    args: [channelId],
  });
  return result.rows;
}

async function setMessageTs(marketId, messageTs) {
  await getDb().execute({ sql: 'UPDATE markets SET message_ts = ? WHERE id = ?', args: [messageTs, marketId] });
}

async function closeMarket(marketId) {
  await getDb().execute({
    sql: "UPDATE markets SET status = 'closed', closed_at = datetime('now') WHERE id = ? AND status = 'open'",
    args: [marketId],
  });
}

async function getMarketsToClose() {
  const result = await getDb().execute({
    sql: "SELECT * FROM markets WHERE status = 'open' AND close_at IS NOT NULL AND close_at <= datetime('now')",
    args: [],
  });
  return result.rows;
}

async function resolveMarket(marketId, winningOptionId) {
  const db = getDb();
  const tx = await db.transaction('write');
  try {
    await tx.execute({ sql: "UPDATE markets SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?", args: [marketId] });
    await tx.execute({ sql: 'UPDATE options SET is_winner = 1 WHERE id = ? AND market_id = ?', args: [winningOptionId, marketId] });

    const totalResult = await tx.execute({ sql: 'SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE market_id = ?', args: [marketId] });
    const totalPool = Number(totalResult.rows[0].total);

    const winResult = await tx.execute({ sql: 'SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE market_id = ? AND option_id = ?', args: [marketId, winningOptionId] });
    const winningPool = Number(winResult.rows[0].total);

    if (winningPool === 0 || totalPool === 0) {
      await tx.commit();
      return [];
    }

    const betsResult = await tx.execute({ sql: 'SELECT * FROM bets WHERE market_id = ? AND option_id = ?', args: [marketId, winningOptionId] });
    const payouts = [];

    for (const bet of betsResult.rows) {
      const payout = Math.floor((Number(bet.amount) / winningPool) * totalPool);
      await tx.execute({ sql: 'UPDATE bets SET payout = ? WHERE id = ?', args: [payout, bet.id] });
      await tx.execute({ sql: 'UPDATE users SET balance = balance + ? WHERE slack_id = ?', args: [payout, bet.slack_id] });
      payouts.push({ slackId: bet.slack_id, amount: Number(bet.amount), payout });
    }

    await tx.commit();
    return payouts;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function cancelMarket(marketId) {
  const db = getDb();
  const tx = await db.transaction('write');
  try {
    const check = await tx.execute({ sql: "SELECT status FROM markets WHERE id = ?", args: [marketId] });
    if (check.rows.length === 0 || check.rows[0].status !== 'open') {
      throw new Error('Only open markets can be cancelled.');
    }
    await tx.execute({ sql: "UPDATE markets SET status = 'cancelled' WHERE id = ? AND status = 'open'", args: [marketId] });
    const betsResult = await tx.execute({ sql: 'SELECT * FROM bets WHERE market_id = ?', args: [marketId] });

    for (const bet of betsResult.rows) {
      await tx.execute({ sql: 'UPDATE users SET balance = balance + ? WHERE slack_id = ?', args: [bet.amount, bet.slack_id] });
    }

    await tx.commit();
    return betsResult.rows;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = { createMarket, getMarket, getActiveMarkets, setMessageTs, closeMarket, getMarketsToClose, resolveMarket, cancelMarket };
