const { createClient } = require('@libsql/client');

let client;

function getDb() {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL || 'file:betting.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

async function migrate() {
  const db = getDb();
  const startingBalance = process.env.STARTING_BALANCE || 1000;

  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_id TEXT UNIQUE NOT NULL,
      balance INTEGER NOT NULL DEFAULT ${startingBalance},
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS markets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'resolved', 'cancelled')),
      created_by TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_ts TEXT,
      close_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      resolved_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      is_winner INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (market_id) REFERENCES markets(id)
    )`,
    `CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_id TEXT NOT NULL,
      market_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      amount INTEGER NOT NULL CHECK(amount > 0),
      payout INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (market_id) REFERENCES markets(id),
      FOREIGN KEY (option_id) REFERENCES options(id)
    )`,
    `CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lender_id TEXT NOT NULL,
      borrower_id TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount > 0),
      interest_rate REAL NOT NULL CHECK(interest_rate >= 0),
      total_owed INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'repaid', 'declined')),
      channel_id TEXT NOT NULL,
      message_ts TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      accepted_at TEXT,
      repaid_at TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS idx_bets_market ON bets(market_id)',
    'CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(slack_id)',
    'CREATE INDEX IF NOT EXISTS idx_options_market ON options(market_id)',
    'CREATE INDEX IF NOT EXISTS idx_loans_lender ON loans(lender_id)',
    'CREATE INDEX IF NOT EXISTS idx_loans_borrower ON loans(borrower_id)',
  ], 'write');
}

module.exports = { getDb, migrate };
