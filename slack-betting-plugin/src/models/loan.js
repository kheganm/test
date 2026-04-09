const { getDb } = require('../db');
const { getOrCreateUser, deductBalance, addBalance } = require('./user');

async function createLoan(lenderId, borrowerId, amount, interestRate, channelId, dueAt) {
  const db = getDb();
  await getOrCreateUser(lenderId);
  await getOrCreateUser(borrowerId);

  const lenderResult = await db.execute({ sql: 'SELECT * FROM users WHERE slack_id = ?', args: [lenderId] });
  if (Number(lenderResult.rows[0].balance) < amount) {
    throw new Error(`You only have ${lenderResult.rows[0].balance} coins — can't lend ${amount}.`);
  }

  const totalOwed = Math.ceil(amount * (1 + interestRate / 100));
  const result = await db.execute({
    sql: 'INSERT INTO loans (lender_id, borrower_id, amount, interest_rate, total_owed, channel_id, due_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [lenderId, borrowerId, amount, interestRate, totalOwed, channelId, dueAt || null],
  });
  return getLoan(Number(result.lastInsertRowid));
}

async function getLoan(loanId) {
  const result = await getDb().execute({ sql: 'SELECT * FROM loans WHERE id = ?', args: [loanId] });
  return result.rows[0] || null;
}

async function acceptLoan(loanId) {
  const db = getDb();
  const loan = await getLoan(loanId);
  if (!loan || loan.status !== 'pending') return null;

  const tx = await db.transaction('write');
  try {
    const lenderResult = await tx.execute({ sql: 'SELECT balance FROM users WHERE slack_id = ?', args: [loan.lender_id] });
    if (Number(lenderResult.rows[0].balance) < Number(loan.amount)) {
      throw new Error('Lender no longer has enough coins for this loan.');
    }
    await tx.execute({ sql: 'UPDATE users SET balance = balance - ? WHERE slack_id = ?', args: [loan.amount, loan.lender_id] });
    await tx.execute({ sql: 'UPDATE users SET balance = balance + ? WHERE slack_id = ?', args: [loan.amount, loan.borrower_id] });
    await tx.execute({ sql: "UPDATE loans SET status = 'active', accepted_at = datetime('now') WHERE id = ?", args: [loanId] });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  return getLoan(loanId);
}

async function declineLoan(loanId) {
  await getDb().execute({ sql: "UPDATE loans SET status = 'declined' WHERE id = ? AND status = 'pending'", args: [loanId] });
  return getLoan(loanId);
}

async function repayLoan(loanId, borrowerId) {
  const loan = await getLoan(loanId);
  if (!loan) throw new Error('Loan not found.');
  if (loan.status !== 'active' && loan.status !== 'overdue') throw new Error('This loan is not active.');
  if (loan.borrower_id !== borrowerId) throw new Error("This isn't your loan to repay.");

  const borrowerResult = await getDb().execute({ sql: 'SELECT balance FROM users WHERE slack_id = ?', args: [borrowerId] });
  if (Number(borrowerResult.rows[0].balance) < Number(loan.total_owed)) {
    throw new Error(`You need ${loan.total_owed} coins to repay but only have ${borrowerResult.rows[0].balance}.`);
  }

  const db = getDb();
  const tx = await db.transaction('write');
  try {
    await tx.execute({ sql: 'UPDATE users SET balance = balance - ? WHERE slack_id = ?', args: [loan.total_owed, loan.borrower_id] });
    await tx.execute({ sql: 'UPDATE users SET balance = balance + ? WHERE slack_id = ?', args: [loan.total_owed, loan.lender_id] });
    await tx.execute({ sql: "UPDATE loans SET status = 'repaid', repaid_at = datetime('now') WHERE id = ?", args: [loanId] });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  return getLoan(loanId);
}

async function getActiveLoansForUser(slackId) {
  const db = getDb();
  const givenResult = await db.execute({
    sql: "SELECT * FROM loans WHERE lender_id = ? AND status IN ('pending', 'active', 'overdue') ORDER BY created_at DESC",
    args: [slackId],
  });
  const receivedResult = await db.execute({
    sql: "SELECT * FROM loans WHERE borrower_id = ? AND status IN ('pending', 'active', 'overdue') ORDER BY created_at DESC",
    args: [slackId],
  });
  return { given: givenResult.rows, received: receivedResult.rows };
}

async function getOverdueLoans() {
  const result = await getDb().execute({
    sql: "SELECT * FROM loans WHERE status = 'active' AND due_at IS NOT NULL AND due_at <= datetime('now')",
    args: [],
  });
  return result.rows;
}

async function markLoanOverdueNotified(loanId) {
  await getDb().execute({
    sql: "UPDATE loans SET status = 'overdue' WHERE id = ? AND status = 'active'",
    args: [loanId],
  });
}

module.exports = { createLoan, getLoan, acceptLoan, declineLoan, repayLoan, getActiveLoansForUser, getOverdueLoans, markLoanOverdueNotified };
