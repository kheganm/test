const { getDb } = require('../db');
const { CFTC_USER_ID } = require('./cftc');
const { addToHousePool, deductFromHousePool } = require('./house');

async function createMarket(title, description, createdBy, channelId, optionLabels, closeAt, marketType = 'parimutuel') {
  const db = getDb();
  const tx = await db.transaction('write');
  try {
    const result = await tx.execute({
      sql: 'INSERT INTO markets (title, description, created_by, channel_id, close_at, market_type) VALUES (?, ?, ?, ?, ?, ?)',
      args: [title, description, createdBy, channelId, closeAt || null, marketType],
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
    // Get market type for return value
    const marketCheck = await tx.execute({ sql: 'SELECT market_type FROM markets WHERE id = ?', args: [marketId] });
    const marketType = marketCheck.rows[0]?.market_type || 'parimutuel';

    await tx.execute({ sql: "UPDATE markets SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?", args: [marketId] });
    await tx.execute({ sql: 'UPDATE options SET is_winner = 1 WHERE id = ? AND market_id = ?', args: [winningOptionId, marketId] });

    // Parimutuel resolution for all market types (weighted markets store nominal pool amounts)
    const totalResult = await tx.execute({ sql: 'SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE market_id = ?', args: [marketId] });
    const totalPool = Number(totalResult.rows[0].total);

    const winResult = await tx.execute({ sql: 'SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE market_id = ? AND option_id = ?', args: [marketId, winningOptionId] });
    const winningPool = Number(winResult.rows[0].total);

    if (winningPool === 0 || totalPool === 0) {
      await tx.commit();
      return { payouts: [], marketType };
    }

    const betsResult = await tx.execute({ sql: 'SELECT * FROM bets WHERE market_id = ? AND option_id = ?', args: [marketId, winningOptionId] });
    const payouts = [];

    for (const bet of betsResult.rows) {
      const payout = Math.floor((Number(bet.amount) / winningPool) * totalPool);
      await tx.execute({ sql: 'UPDATE bets SET payout = ? WHERE id = ?', args: [payout, bet.id] });

      if (bet.slack_id === CFTC_USER_ID) {
        await tx.execute({ sql: 'UPDATE cftc_pool SET balance = balance + ? WHERE id = 1', args: [payout] });
      } else {
        await tx.execute({ sql: 'UPDATE users SET balance = balance + ? WHERE slack_id = ?', args: [payout, bet.slack_id] });
        payouts.push({ slackId: bet.slack_id, amount: Number(bet.amount), payout });
      }
    }

    await tx.commit();
    return { payouts, marketType };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function cancelMarket(marketId) {
  const db = getDb();
  const tx = await db.transaction('write');
  try {
    const check = await tx.execute({ sql: "SELECT status, market_type FROM markets WHERE id = ?", args: [marketId] });
    if (check.rows.length === 0 || check.rows[0].status !== 'open') {
      throw new Error('Only open markets can be cancelled.');
    }
    const isWeighted = check.rows[0].market_type === 'weighted';
    await tx.execute({ sql: "UPDATE markets SET status = 'cancelled' WHERE id = ? AND status = 'open'", args: [marketId] });
    const betsResult = await tx.execute({ sql: 'SELECT * FROM bets WHERE market_id = ?', args: [marketId] });

    let totalHouseDelta = 0;
    for (const bet of betsResult.rows) {
      const refund = isWeighted && bet.locked_odds
        ? Math.ceil(Number(bet.amount) * Number(bet.locked_odds))
        : Number(bet.amount);
      await tx.execute({ sql: 'UPDATE users SET balance = balance + ? WHERE slack_id = ?', args: [refund, bet.slack_id] });
      if (isWeighted && bet.locked_odds) {
        totalHouseDelta += refund - Number(bet.amount);
      }
    }

    // Reverse house pool deltas for weighted bets
    if (totalHouseDelta > 0) {
      await tx.execute({ sql: 'UPDATE house_pool SET balance = balance - ? WHERE id = 1', args: [totalHouseDelta] });
    } else if (totalHouseDelta < 0) {
      await tx.execute({ sql: 'UPDATE house_pool SET balance = balance + ? WHERE id = 1', args: [Math.abs(totalHouseDelta)] });
    }

    await tx.commit();
    return betsResult.rows;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function deleteMarket(marketId) {
  const db = getDb();
  const tx = await db.transaction('write');
  try {
    const market = await tx.execute({ sql: 'SELECT status, market_type FROM markets WHERE id = ?', args: [marketId] });
    if (market.rows.length === 0) throw new Error('Market not found.');

    if (market.rows[0].status === 'open') {
      const isWeighted = market.rows[0].market_type === 'weighted';
      const betsResult = await tx.execute({ sql: 'SELECT * FROM bets WHERE market_id = ?', args: [marketId] });
      let totalHouseDelta = 0;
      for (const bet of betsResult.rows) {
        const refund = isWeighted && bet.locked_odds
          ? Math.ceil(Number(bet.amount) * Number(bet.locked_odds))
          : Number(bet.amount);
        await tx.execute({ sql: 'UPDATE users SET balance = balance + ? WHERE slack_id = ?', args: [refund, bet.slack_id] });
        if (isWeighted && bet.locked_odds) {
          totalHouseDelta += refund - Number(bet.amount);
        }
      }
      if (totalHouseDelta > 0) {
        await tx.execute({ sql: 'UPDATE house_pool SET balance = balance - ? WHERE id = 1', args: [totalHouseDelta] });
      } else if (totalHouseDelta < 0) {
        await tx.execute({ sql: 'UPDATE house_pool SET balance = balance + ? WHERE id = 1', args: [Math.abs(totalHouseDelta)] });
      }
    }

    await tx.execute({ sql: 'DELETE FROM bets WHERE market_id = ?', args: [marketId] });
    await tx.execute({ sql: 'DELETE FROM options WHERE market_id = ?', args: [marketId] });
    await tx.execute({ sql: 'DELETE FROM markets WHERE id = ?', args: [marketId] });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = { createMarket, getMarket, getActiveMarkets, setMessageTs, closeMarket, getMarketsToClose, resolveMarket, cancelMarket, deleteMarket };
