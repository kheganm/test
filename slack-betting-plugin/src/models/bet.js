const { getDb } = require('../db');
const { deductBalance, getBalance } = require('./user');
const { addToHousePool, deductFromHousePool } = require('./house');

async function placeBet(slackId, marketId, optionId, amount, costMultiplier = null) {
  const db = getDb();
  const marketResult = await db.execute({ sql: 'SELECT * FROM markets WHERE id = ?', args: [marketId] });
  if (marketResult.rows.length === 0) throw new Error('Market not found.');
  if (marketResult.rows[0].status !== 'open') throw new Error('This market is no longer accepting bets.');

  const optionResult = await db.execute({ sql: 'SELECT * FROM options WHERE id = ? AND market_id = ?', args: [optionId, marketId] });
  if (optionResult.rows.length === 0) throw new Error('Invalid option.');

  if (costMultiplier) {
    // Weighted market: charge actual cost (amount * multiplier) from wallet
    const actualCost = Math.ceil(amount * costMultiplier);
    const balance = await getBalance(slackId);
    if (balance < actualCost) {
      throw new Error(`Insufficient balance. This ${amount} coin bet costs ${actualCost} coins (${costMultiplier.toFixed(2)}x multiplier) but you have ${balance} coins.`);
    }
    await deductBalance(slackId, actualCost);

    // Record nominal amount in pool, store multiplier for refund purposes
    await db.execute({
      sql: 'INSERT INTO bets (slack_id, market_id, option_id, amount, locked_odds) VALUES (?, ?, ?, ?, ?)',
      args: [slackId, marketId, optionId, amount, costMultiplier],
    });

    // House pool absorbs the spread
    const houseDelta = actualCost - amount;
    if (houseDelta > 0) {
      await addToHousePool(houseDelta);
    } else if (houseDelta < 0) {
      await deductFromHousePool(Math.abs(houseDelta));
    }
  } else {
    // Parimutuel market: standard deduction
    await deductBalance(slackId, amount);
    await db.execute({
      sql: 'INSERT INTO bets (slack_id, market_id, option_id, amount) VALUES (?, ?, ?, ?)',
      args: [slackId, marketId, optionId, amount],
    });
  }
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

async function withdrawUserBets(slackId, marketId) {
  const db = getDb();
  const marketResult = await db.execute({ sql: 'SELECT * FROM markets WHERE id = ?', args: [marketId] });
  if (marketResult.rows.length === 0) throw new Error('Market not found.');
  if (marketResult.rows[0].status !== 'open') throw new Error('Can only withdraw bets from open markets.');

  const isWeighted = marketResult.rows[0].market_type === 'weighted';

  const betsResult = await db.execute({
    sql: 'SELECT * FROM bets WHERE slack_id = ? AND market_id = ?',
    args: [slackId, marketId],
  });

  if (betsResult.rows.length === 0) throw new Error('You have no bets on this market.');

  // For weighted bets, refund the actual cost (amount * multiplier), not just nominal amount
  let totalRefund = 0;
  let totalHouseDelta = 0;
  for (const b of betsResult.rows) {
    const amt = Number(b.amount);
    if (isWeighted && b.locked_odds) {
      const actualCost = Math.ceil(amt * Number(b.locked_odds));
      totalRefund += actualCost;
      totalHouseDelta += actualCost - amt;
    } else {
      totalRefund += amt;
    }
  }

  const tx = await db.transaction('write');
  try {
    await tx.execute({ sql: 'DELETE FROM bets WHERE slack_id = ? AND market_id = ?', args: [slackId, marketId] });
    await tx.execute({ sql: 'UPDATE users SET balance = balance + ? WHERE slack_id = ?', args: [totalRefund, slackId] });

    // Reverse house pool deltas for weighted bets
    if (totalHouseDelta > 0) {
      await tx.execute({ sql: 'UPDATE house_pool SET balance = balance - ? WHERE id = 1', args: [totalHouseDelta] });
    } else if (totalHouseDelta < 0) {
      await tx.execute({ sql: 'UPDATE house_pool SET balance = balance + ? WHERE id = 1', args: [Math.abs(totalHouseDelta)] });
    }

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  return { refunded: totalRefund, betsRemoved: betsResult.rows.length };
}

async function getTopBettorsByOption(marketId) {
  const result = await getDb().execute({
    sql: `SELECT option_id, slack_id, SUM(amount) as total
          FROM bets WHERE market_id = ? AND slack_id != '__CFTC__'
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

async function getCftcBetForOption(marketId) {
  const result = await getDb().execute({
    sql: "SELECT option_id, SUM(amount) as total FROM bets WHERE market_id = ? AND slack_id = '__CFTC__' GROUP BY option_id",
    args: [marketId],
  });
  const map = {};
  for (const row of result.rows) {
    map[row.option_id] = Number(row.total);
  }
  return map;
}

module.exports = { placeBet, getPoolByOption, getTotalPool, getUserBetsOnMarket, withdrawUserBets, getTopBettorsByOption, getCftcBetForOption };
