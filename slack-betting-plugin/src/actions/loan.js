const { getLoan, acceptLoan, declineLoan } = require('../models/loan');
const { getBalance } = require('../models/user');

function registerLoanActions(app) {
  app.action(/^accept_loan_\d+$/, async ({ action, ack, client, body }) => {
    await ack();

    const loanId = parseInt(action.value, 10);
    const loan = await getLoan(loanId);

    if (!loan) return;
    if (loan.borrower_id !== body.user.id) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: "This loan offer isn't for you.",
      });
      return;
    }

    if (loan.status !== 'pending') {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: 'This loan offer has already been handled.',
      });
      return;
    }

    try {
      await acceptLoan(loanId);

      await client.chat.update({
        channel: loan.channel_id,
        ts: loan.message_ts,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:handshake: *Loan Accepted!*\n\n<@${loan.lender_id}> lent *${loan.amount} coins* to <@${loan.borrower_id}> at *${loan.interest_rate}%* interest.\n\n:money_with_wings: <@${loan.borrower_id}> owes *${loan.total_owed} coins* back.\nUse \`/bet repay ${loanId}\` to repay.`,
            },
          },
        ],
        text: 'Loan accepted',
      });
    } catch (err) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: `:x: ${err.message}`,
      });
    }
  });

  app.action(/^decline_loan_\d+$/, async ({ action, ack, client, body }) => {
    await ack();

    const loanId = parseInt(action.value, 10);
    const loan = await getLoan(loanId);

    if (!loan) return;
    if (loan.borrower_id !== body.user.id) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: "This loan offer isn't for you.",
      });
      return;
    }

    await declineLoan(loanId);

    await client.chat.update({
      channel: loan.channel_id,
      ts: loan.message_ts,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:no_entry_sign: *Loan Declined*\n\n<@${loan.borrower_id}> declined the *${loan.amount} coin* loan from <@${loan.lender_id}>.`,
          },
        },
      ],
      text: 'Loan declined',
    });
  });
}

module.exports = { registerLoanActions };
