const { getDb } = require('../db');

const STARTING_BALANCE = parseInt(process.env.STARTING_BALANCE || '1000', 10);

function getOrCreateUser(slackId) {
  const db = getDb();
  let user = db.prepare('SELECT * FROM users WHERE slack_id = ?').get(slackId);
  if (!user) {
    db.prepare('INSERT INTO users (slack_id, balance) VALUES (?, ?)').run(slackId, STARTING_BALANCE);
    user = db.prepare('SELECT * FROM users WHERE slack_id = ?').get(slackId);
  }
  return user;
}

function getBalance(slackId) {
  const user = getOrCreateUser(slackId);
  return user.balance;
}

function deductBalance(slackId, amount) {
  const db = getDb();
  const user = getOrCreateUser(slackId);
  if (user.balance < amount) {
    throw new Error(`Insufficient balance. You have ${user.balance} coins but tried to bet ${amount}.`);
  }
  db.prepare('UPDATE users SET balance = balance - ? WHERE slack_id = ?').run(amount, slackId);
}

function addBalance(slackId, amount) {
  const db = getDb();
  getOrCreateUser(slackId);
  db.prepare('UPDATE users SET balance = balance + ? WHERE slack_id = ?').run(amount, slackId);
}

function getLeaderboard(limit = 10) {
  const db = getDb();
  return db.prepare('SELECT slack_id, balance FROM users ORDER BY balance DESC LIMIT ?').all(limit);
}

module.exports = { getOrCreateUser, getBalance, deductBalance, addBalance, getLeaderboard };
