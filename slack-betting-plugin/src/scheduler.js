const { getMarketsToClose, getMarket, closeMarket } = require('./models/market');
const { buildMarketMessage } = require('./views/market-message');
const { getOverdueLoans, markLoanOverdueNotified } = require('./models/loan');

function startScheduler(app) {
  console.log('Scheduler started (checks every 30s)');

  setInterval(async () => {
    try {
      const markets = await getMarketsToClose();
      for (const market of markets) {
        console.log(`[scheduler] Auto-closing market #${market.id}: ${market.title}`);
        await closeMarket(market.id);
        const updated = await getMarket(market.id);
        const blocks = await buildMarketMessage(updated);

        await app.client.chat.update({
          channel: updated.channel_id,
          ts: updated.message_ts,
          blocks,
          text: updated.title,
        });

        await app.client.chat.postMessage({
          channel: updated.channel_id,
          text: `\u23F0 Betting is now *CLOSED* on *${updated.title}*. Time's up! Waiting for results...`,
        });
      }
    } catch (err) {
      console.error('[scheduler] Market close error:', err.message);
    }

    try {
      const overdueLoans = await getOverdueLoans();
      for (const loan of overdueLoans) {
        console.log(`[scheduler] Loan #${loan.id} is overdue`);
        await markLoanOverdueNotified(loan.id);

        await app.client.chat.postMessage({
          channel: loan.channel_id,
          text: `\uD83D\uDEA8 *Loan #${loan.id} is overdue!* <@${loan.borrower_id}> owes <@${loan.lender_id}> *${loan.total_owed} coins*. Use \`/bet repay ${loan.id}\` to settle up!`,
        });
      }
    } catch (err) {
      console.error('[scheduler] Loan overdue error:', err.message);
    }
  }, 30000);
}

module.exports = { startScheduler };
