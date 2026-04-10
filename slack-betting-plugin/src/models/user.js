const { getDb } = require('../db');

const STARTING_BALANCE = parseInt(process.env.STARTING_BALANCE || '1000', 10);

async function getOrCreateUser(slackId) {
  const db = getDb();
  let result = await db.execute({ sql: 'SELECT * FROM users WHERE slack_id = ?', args: [slackId] });
  if (result.rows.length === 0) {
    await db.execute({ sql: 'INSERT INTO users (slack_id, balance) VALUES (?, ?)', args: [slackId, STARTING_BALANCE] });
    result = await db.execute({ sql: 'SELECT * FROM users WHERE slack_id = ?', args: [slackId] });
  }
  return result.rows[0];
}

async function getBalance(slackId) {
  const user = await getOrCreateUser(slackId);
  return Number(user.balance);
}

async function deductBalance(slackId, amount) {
  const user = await getOrCreateUser(slackId);
  if (Number(user.balance) < amount) {
    throw new Error(`Insufficient balance. You have ${user.balance} coins but tried to bet ${amount}.`);
  }
  await getDb().execute({ sql: 'UPDATE users SET balance = balance - ? WHERE slack_id = ?', args: [amount, slackId] });
}

async function addBalance(slackId, amount) {
  await getOrCreateUser(slackId);
  await getDb().execute({ sql: 'UPDATE users SET balance = balance + ? WHERE slack_id = ?', args: [amount, slackId] });
}

async function getLeaderboard(limit = 10) {
  const result = await getDb().execute({ sql: 'SELECT slack_id, balance FROM users ORDER BY balance DESC LIMIT ?', args: [limit] });
  return result.rows;
}

async function getMoneySupply() {
  const db = getDb();

  const userCountResult = await db.execute({ sql: 'SELECT COUNT(*) as count FROM users', args: [] });
  const userCount = Number(userCountResult.rows[0].count);

  const walletResult = await db.execute({ sql: 'SELECT COALESCE(SUM(balance), 0) as total FROM users', args: [] });
  const walletTotal = Number(walletResult.rows[0].total);

  // Coins locked in active markets (open or closed but not yet resolved/cancelled)
  const lockedResult = await db.execute({
    sql: `SELECT COALESCE(SUM(b.amount), 0) as total
          FROM bets b
          JOIN markets m ON b.market_id = m.id
          WHERE m.status IN ('open', 'closed')`,
    args: [],
  });
  const lockedTotal = Number(lockedResult.rows[0].total);

  const currentSupply = walletTotal + lockedTotal;
  const initialSupply = userCount * STARTING_BALANCE;
  const inflationPct = initialSupply > 0 ? ((currentSupply - initialSupply) / initialSupply) * 100 : 0;

  return {
    userCount,
    startingBalance: STARTING_BALANCE,
    initialSupply,
    currentSupply,
    walletTotal,
    lockedTotal,
    inflationPct,
  };
}

module.exports = { getOrCreateUser, getBalance, deductBalance, addBalance, getLeaderboard, getMoneySupply };
