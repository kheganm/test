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

module.exports = { getOrCreateUser, getBalance, deductBalance, addBalance, getLeaderboard };
