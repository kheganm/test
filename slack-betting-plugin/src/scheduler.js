const { getMarketsToClose, getMarket, closeMarket } = require('./models/market');
const { buildMarketMessage } = require('./views/market-message');
const { getOverdueLoans, markLoanOverdueNotified } = require('./models/loan');
const { getExpiredSuspensions, liftSuspension } = require('./models/user');
const { applyCftcBlind } = require('./models/cftc');
const { getExpiredPetitions, getVoteCounts, closePetition, getReferencedAction } = require('./models/petition');
const { overturnAction, buildClosedPetitionBlocks } = require('./actions/petition');

function startScheduler(app) {
  console.log('Scheduler started (checks every 30s)');

  setInterval(async () => {
    try {
      const markets = await getMarketsToClose();
      for (const market of markets) {
        console.log(`[scheduler] Auto-closing market #${market.id}: ${market.title}`);
        await closeMarket(market.id);

        // CFTC blind only applies to parimutuel markets
        let blind = null;
        if (market.market_type !== 'weighted') {
          blind = await applyCftcBlind(market.id);
        }

        const updated = await getMarket(market.id);
        const blocks = await buildMarketMessage(updated);

        await app.client.chat.update({
          channel: updated.channel_id,
          ts: updated.message_ts,
          blocks,
          text: updated.title,
        });

        let closeText = `\u23F0 Betting is now *CLOSED* on *${updated.title}*. Time's up! Waiting for results...`;
        if (blind) {
          closeText += `\n\uD83C\uDFE6 The CFTC placed a *${blind.amount} coin* blind bet on *${blind.optionLabel}*.`;
        }

        await app.client.chat.postMessage({
          channel: updated.channel_id,
          text: closeText,
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

    try {
      const expired = await getExpiredSuspensions();
      for (const suspension of expired) {
        console.log(`[scheduler] Lifting suspension #${suspension.id} for user ${suspension.slack_id}`);
        await liftSuspension(suspension.id);

        await app.client.chat.postMessage({
          channel: suspension.channel_id,
          text: `\uD83D\uDD13 <@${suspension.slack_id}>'s CFTC suspension has been lifted. They may resume trading.`,
        });
      }
    } catch (err) {
      console.error('[scheduler] Suspension lift error:', err.message);
    }

    // Check for expired petitions (24h voting window closed)
    try {
      const expiredPetitions = await getExpiredPetitions();
      for (const petition of expiredPetitions) {
        console.log(`[scheduler] Resolving expired petition #${petition.id}`);
        const counts = await getVoteCounts(petition.id);
        const action_ref = await getReferencedAction(petition);

        let description;
        if (petition.petition_type === 'fine') {
          description = `\uD83D\uDCB8 *Fine #${petition.reference_id}* — <@${action_ref.slack_id}> was fined *${action_ref.amount} coins*\n\uD83D\uDCCB *Reason:* ${action_ref.reason}`;
        } else {
          description = `\uD83D\uDEA8 *Suspension #${petition.reference_id}* — <@${action_ref.slack_id}> was suspended\n\uD83D\uDCCB *Reason:* ${action_ref.reason}`;
        }

        const totalVotes = counts.overturn + counts.uphold;

        if (totalVotes === 0) {
          // No votes cast — petition fails
          await closePetition(petition.id, 'failed');

          if (petition.message_ts) {
            await app.client.chat.update({
              channel: petition.channel_id,
              ts: petition.message_ts,
              blocks: buildClosedPetitionBlocks(description, petition, counts, 'UPHELD (no votes)'),
              text: `Petition #${petition.id} expired — no votes cast`,
            });
          }

          await app.client.chat.postMessage({
            channel: petition.channel_id,
            text: `\uD83D\uDCDC *Petition #${petition.id} EXPIRED* — No votes were cast. The ${petition.petition_type} stands.`,
          });
        } else if (counts.overturn > counts.uphold) {
          // Majority voted to overturn
          await closePetition(petition.id, 'passed');
          await overturnAction(petition, action_ref);

          if (petition.message_ts) {
            await app.client.chat.update({
              channel: petition.channel_id,
              ts: petition.message_ts,
              blocks: buildClosedPetitionBlocks(description, petition, counts, 'OVERTURNED'),
              text: `Petition #${petition.id} passed — action overturned`,
            });
          }

          let resultText;
          if (petition.petition_type === 'fine') {
            resultText = `\uD83D\uDCDC *Petition #${petition.id} PASSED* — Fine #${petition.reference_id} has been *overturned*!\n<@${action_ref.slack_id}> has been refunded *${action_ref.amount} coins*. (${counts.overturn}-${counts.uphold})`;
          } else {
            resultText = `\uD83D\uDCDC *Petition #${petition.id} PASSED* — Suspension #${petition.reference_id} has been *overturned*!\n<@${action_ref.slack_id}>'s suspension has been lifted. (${counts.overturn}-${counts.uphold})`;
          }

          await app.client.chat.postMessage({
            channel: petition.channel_id,
            text: resultText,
          });
        } else {
          // Majority voted to uphold (or tie — action stands)
          await closePetition(petition.id, 'failed');

          if (petition.message_ts) {
            await app.client.chat.update({
              channel: petition.channel_id,
              ts: petition.message_ts,
              blocks: buildClosedPetitionBlocks(description, petition, counts, 'UPHELD'),
              text: `Petition #${petition.id} failed — action upheld`,
            });
          }

          await app.client.chat.postMessage({
            channel: petition.channel_id,
            text: `\uD83D\uDCDC *Petition #${petition.id} FAILED* — The ${petition.petition_type} has been *upheld* by majority vote. (${counts.uphold}-${counts.overturn})`,
          });
        }
      }
    } catch (err) {
      console.error('[scheduler] Petition expiry error:', err.message);
    }
  }, 30000);
}

module.exports = { startScheduler };
