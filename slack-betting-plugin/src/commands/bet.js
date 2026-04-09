const { getBalance, addBalance, getOrCreateUser } = require('../models/user');
const { getActiveMarkets, getMarket } = require('../models/market');
const { getUserBetsOnMarket } = require('../models/bet');
const { createLoan, repayLoan, getActiveLoansForUser } = require('../models/loan');
const { isAdmin } = require('../utils/permissions');
const { resolveUserId } = require('../utils/resolve-user');
const { buildCreateMarketModal } = require('../views/modals');
const { buildLeaderboardMessage } = require('../views/leaderboard');

function registerBetCommand(app) {
  app.command('/bet', async ({ command, ack, respond, client }) => {
    await ack();

    const text = (command.text || '').trim();
    const args = text.split(/\s+/);
    const subcommand = (args[0] || '').toLowerCase();

    console.log(`[/bet] user=${command.user_id} text="${text}" subcommand="${subcommand}"`);

    switch (subcommand) {
      case 'create':
        await handleCreate(command, client);
        break;
      case 'balance':
        await handleBalance(command, respond);
        break;
      case 'leaderboard':
        await handleLeaderboard(command, respond);
        break;
      case 'markets':
        await handleMarkets(command, respond);
        break;
      case 'mybets':
        await handleMyBets(command, args, respond);
        break;
      case 'loan':
        await handleLoan(command, args, respond, client);
        break;
      case 'repay':
        await handleRepay(command, args, respond);
        break;
      case 'loans':
        await handleLoans(command, respond);
        break;
      case 'give':
        await handleGive(command, args, respond, client);
        break;
      case 'reset':
        await handleReset(command, args, respond, client);
        break;
      case 'help':
      case '':
      default:
        await handleHelp(respond);
        break;
    }
  });
}

async function handleCreate(command, client) {
  await client.views.open({
    trigger_id: command.trigger_id,
    view: buildCreateMarketModal(command.channel_id),
  });
}

async function handleBalance(command, respond) {
  const balance = await getBalance(command.user_id);
  await respond({
    response_type: 'ephemeral',
    text: `\uD83E\uDE99 Your balance: *${balance} coins*`,
  });
}

async function handleLeaderboard(command, respond) {
  const blocks = await buildLeaderboardMessage();
  await respond({
    response_type: 'in_channel',
    blocks,
    text: 'Leaderboard',
  });
}

async function handleMarkets(command, respond) {
  const markets = await getActiveMarkets(command.channel_id);
  if (markets.length === 0) {
    await respond({
      response_type: 'ephemeral',
      text: 'No active markets in this channel. Use `/bet create` to start one!',
    });
    return;
  }

  const lines = markets.map((m) => {
    const status = m.status === 'open' ? '\uD83D\uDFE2' : '\uD83D\uDD34';
    return `${status} *#${m.id}* — ${m.title} (${m.status})`;
  });

  await respond({
    response_type: 'ephemeral',
    text: `*Active Markets:*\n${lines.join('\n')}`,
  });
}

async function handleMyBets(command, args, respond) {
  const marketId = parseInt(args[1], 10);
  if (!marketId) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet mybets <market_id>`',
    });
    return;
  }

  const market = await getMarket(marketId);
  if (!market) {
    await respond({ response_type: 'ephemeral', text: 'Market not found.' });
    return;
  }

  const bets = await getUserBetsOnMarket(command.user_id, marketId);
  if (bets.length === 0) {
    await respond({
      response_type: 'ephemeral',
      text: `You have no bets on *${market.title}*.`,
    });
    return;
  }

  const total = bets.reduce((sum, b) => sum + Number(b.amount), 0);
  const lines = bets.map((b) => `• ${b.option_label}: ${b.amount} coins`);

  await respond({
    response_type: 'ephemeral',
    text: `*Your bets on "${market.title}":*\n${lines.join('\n')}\n\nTotal wagered: *${total} coins*`,
  });
}

async function handleLoan(command, args, respond, client) {
  const borrowerId = await resolveUserId(command.text, client);
  const numbers = command.text.match(/\b(\d+)\b/g);

  if (!borrowerId || !numbers || numbers.length < 2) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet loan @user 500 10` — Offer a 500 coin loan at 10% interest\nMake sure to tag the user with @.',
    });
    return;
  }

  const amount = parseInt(numbers[numbers.length - 2], 10);
  const interestRate = parseFloat(numbers[numbers.length - 1]);

  if (borrowerId === command.user_id) {
    await respond({ response_type: 'ephemeral', text: "You can't loan money to yourself." });
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    await respond({ response_type: 'ephemeral', text: 'Amount must be a positive number.' });
    return;
  }

  if (isNaN(interestRate) || interestRate < 0) {
    await respond({ response_type: 'ephemeral', text: 'Interest rate must be 0 or higher.' });
    return;
  }

  try {
    const loan = await createLoan(command.user_id, borrowerId, amount, interestRate, command.channel_id);

    const result = await client.chat.postMessage({
      channel: command.channel_id,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Loan Offer', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `\uD83C\uDFE6 <@${command.user_id}> is offering <@${borrowerId}> a loan!\n\n\uD83D\uDCB0 *Amount:* ${amount} coins\n\uD83D\uDCC8 *Interest:* ${interestRate}%\n\uD83D\uDCB8 *Total to repay:* ${loan.total_owed} coins`,
          },
        },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Accept Loan', emoji: true },
              action_id: `accept_loan_${loan.id}`,
              value: String(loan.id),
              style: 'primary',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Decline', emoji: true },
              action_id: `decline_loan_${loan.id}`,
              value: String(loan.id),
              style: 'danger',
            },
          ],
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Loan #${loan.id} — Only <@${borrowerId}> can accept or decline` },
          ],
        },
      ],
      text: `Loan offer from <@${command.user_id}> to <@${borrowerId}>`,
    });

    await getDb().execute({ sql: 'UPDATE loans SET message_ts = ? WHERE id = ?', args: [result.ts, loan.id] });
  } catch (err) {
    await respond({ response_type: 'ephemeral', text: `\u274C ${err.message}` });
  }
}

async function handleRepay(command, args, respond) {
  const loanId = parseInt(args[1], 10);
  if (!loanId) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet repay <loan_id>` — Repay an active loan\nUse `/bet loans` to see your loan IDs.',
    });
    return;
  }

  try {
    const loan = await repayLoan(loanId, command.user_id);
    await respond({
      response_type: 'in_channel',
      text: `\u2705 <@${command.user_id}> repaid *${loan.total_owed} coins* to <@${loan.lender_id}> (Loan #${loan.id}). Debt cleared!`,
    });
  } catch (err) {
    await respond({ response_type: 'ephemeral', text: `\u274C ${err.message}` });
  }
}

async function handleLoans(command, respond) {
  const { given, received } = await getActiveLoansForUser(command.user_id);

  if (given.length === 0 && received.length === 0) {
    await respond({
      response_type: 'ephemeral',
      text: 'You have no active or pending loans.',
    });
    return;
  }

  const lines = [];

  if (received.length > 0) {
    lines.push('*Loans you owe:*');
    for (const loan of received) {
      const statusIcon = loan.status === 'pending' ? '\u231B' : '\uD83D\uDCB8';
      lines.push(`${statusIcon} Loan #${loan.id} — ${loan.amount} coins from <@${loan.lender_id}> at ${loan.interest_rate}% \u2192 owe *${loan.total_owed} coins* (${loan.status})`);
    }
  }

  if (given.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('*Loans you gave:*');
    for (const loan of given) {
      const statusIcon = loan.status === 'pending' ? '\u231B' : '\uD83C\uDFE6';
      lines.push(`${statusIcon} Loan #${loan.id} — ${loan.amount} coins to <@${loan.borrower_id}> at ${loan.interest_rate}% \u2192 owed *${loan.total_owed} coins* (${loan.status})`);
    }
  }

  await respond({
    response_type: 'ephemeral',
    text: lines.join('\n'),
  });
}

async function handleGive(command, args, respond, client) {
  if (!isAdmin(command.user_id)) {
    await respond({ response_type: 'ephemeral', text: '\uD83D\uDEAB Only admins can use `/bet give`.' });
    return;
  }

  const targetUserId = await resolveUserId(command.text, client);
  const amountStr = args[args.length - 1];
  const amount = parseInt(amountStr, 10);

  if (!targetUserId || isNaN(amount) || amount <= 0) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet give @user 500` — Give coins to a user',
    });
    return;
  }

  await getOrCreateUser(targetUserId);
  await addBalance(targetUserId, amount);
  const newBalance = await getBalance(targetUserId);

  await respond({
    response_type: 'ephemeral',
    text: `\uD83D\uDCB0 Gave *${amount} coins* to <@${targetUserId}>. Their new balance: *${newBalance} coins*`,
  });
}

async function handleReset(command, args, respond, client) {
  if (!isAdmin(command.user_id)) {
    await respond({ response_type: 'ephemeral', text: '\uD83D\uDEAB Only admins can use `/bet reset`.' });
    return;
  }

  const targetUserId = await resolveUserId(command.text, client);

  if (!targetUserId) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet reset @user` — Reset a user\'s balance to the starting amount',
    });
    return;
  }

  const startingBalance = parseInt(process.env.STARTING_BALANCE || '1000', 10);
  await getDb().execute({ sql: 'UPDATE users SET balance = ? WHERE slack_id = ?', args: [startingBalance, targetUserId] });

  await respond({
    response_type: 'ephemeral',
    text: `\uD83D\uDD04 Reset <@${targetUserId}>'s balance to *${startingBalance} coins*`,
  });
}

async function handleHelp(respond) {
  await respond({
    response_type: 'ephemeral',
    text: [
      '*Betting Bot Commands:*',
      '`/bet create` — Create a new betting market (with optional close date/time)',
      '`/bet balance` — Check your coin balance',
      '`/bet markets` — List active markets in this channel',
      '`/bet mybets <market_id>` — View your bets on a market',
      '`/bet leaderboard` — Show the top earners',
      '',
      '*Loans:*',
      '`/bet loan @user 500 10` — Offer a 500 coin loan at 10% interest',
      '`/bet loans` — View your active/pending loans',
      '`/bet repay <loan_id>` — Repay a loan',
      '',
      '*Admin Commands:*',
      '`/bet give @user 500` — Give coins to a user',
      '`/bet reset @user` — Reset a user\'s balance to starting amount',
      '',
      '`/bet help` — Show this help message',
    ].join('\n'),
  });
}

const { getDb } = require('../db');

module.exports = { registerBetCommand };
