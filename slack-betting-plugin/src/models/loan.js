const { getDb } = require('../db');
const { getOrCreateUser, deductBalance, addBalance } = require('./user');

function createLoan(lenderId, borrowerId, amount, interestRate, channelId) {
  const db = getDb();
  getOrCreateUser(lenderId);
  getOrCreateUser(borrowerId);

  const lender = db.prepare('SELECT * FROM users WHERE slack_id = ?').get(lenderId);
  if (lender.balance < amount) {
    throw new Error(`You only have ${lender.balance} coins — can't lend ${amount}.`);
  }

  const totalOwed = Math.ceil(amount * (1 + interestRate / 100));

  const result = db.prepare(
    'INSERT INTO loans (lender_id, borrower_id, amount, interest_rate, total_owed, channel_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(lenderId, borrowerId, amount, interestRate, totalOwed, channelId);

  return getLoan(result.lastInsertRowid);
}

function getLoan(loanId) {
  const db = getDb();
  return db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId);
}

function acceptLoan(loanId) {
  const db = getDb();
  const loan = getLoan(loanId);
  if (!loan || loan.status !== 'pending') return null;

  const accept = db.transaction(() => {
    deductBalance(loan.lender_id, loan.amount);
    addBalance(loan.borrower_id, loan.amount);
    db.prepare("UPDATE loans SET status = 'active', accepted_at = datetime('now') WHERE id = ?").run(loanId);
  });
  accept();
  return getLoan(loanId);
}

function declineLoan(loanId) {
  const db = getDb();
  db.prepare("UPDATE loans SET status = 'declined' WHERE id = ? AND status = 'pending'").run(loanId);
  return getLoan(loanId);
}

function repayLoan(loanId, borrowerId) {
  const db = getDb();
  const loan = getLoan(loanId);
  if (!loan) throw new Error('Loan not found.');
  if (loan.status !== 'active') throw new Error('This loan is not active.');
  if (loan.borrower_id !== borrowerId) throw new Error("This isn't your loan to repay.");

  const borrower = db.prepare('SELECT * FROM users WHERE slack_id = ?').get(borrowerId);
  if (borrower.balance < loan.total_owed) {
    throw new Error(`You need ${loan.total_owed} coins to repay but only have ${borrower.balance}.`);
  }

  const repay = db.transaction(() => {
    deductBalance(loan.borrower_id, loan.total_owed);
    addBalance(loan.lender_id, loan.total_owed);
    db.prepare("UPDATE loans SET status = 'repaid', repaid_at = datetime('now') WHERE id = ?").run(loanId);
  });
  repay();
  return getLoan(loanId);
}

function getActiveLoansForUser(slackId) {
  const db = getDb();
  const given = db.prepare(
    "SELECT * FROM loans WHERE lender_id = ? AND status IN ('pending', 'active') ORDER BY created_at DESC"
  ).all(slackId);
  const received = db.prepare(
    "SELECT * FROM loans WHERE borrower_id = ? AND status IN ('pending', 'active') ORDER BY created_at DESC"
  ).all(slackId);
  return { given, received };
}

module.exports = { createLoan, getLoan, acceptLoan, declineLoan, repayLoan, getActiveLoansForUser };
