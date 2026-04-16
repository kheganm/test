const { getDb } = require('../db');
const { getBalance, addBalance, getOrCreateUser, getMoneySupply, suspendUser, getActiveSuspension, deductBalance } = require('../models/user');
const { getActiveMarkets, getMarket, deleteMarket } = require('../models/market');
const { getCftcBalance, addToCftcPool } = require('../models/cftc');
const { getHouseBalance, addToHousePool } = require('../models/house');
const { getUserBetsOnMarket, withdrawUserBets } = require('../models/bet');
const { createLoan, repayLoan, getActiveLoansForUser } = require('../models/loan');
const { isAdmin } = require('../utils/permissions');
const { createPetition, getReferencedAction } = require('../models/petition');
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

    // Check suspension for action commands (allow read-only + admin commands through)
    const readOnlyCommands = ['balance', 'leaderboard', 'economy', 'supply', 'markets', 'mybets', 'loans', 'petition', 'help', ''];
    const adminCommands = ['give', 'reset', 'delete', 'suspend', 'fine', 'house'];
    if (!readOnlyCommands.includes(subcommand) && !adminCommands.includes(subcommand)) {
      const suspension = await getActiveSuspension(command.user_id);
      if (suspension) {
        const expiresUnix = Math.floor(new Date(suspension.expires_at + 'Z').getTime() / 1000);
        await respond({
          response_type: 'ephemeral',
          text: `\uD83D\uDEA8 *You are suspended by the CFTC.*\n*Reason:* ${suspension.reason}\n*Expires:* <!date^${expiresUnix}^{date_short_pretty} at {time}|${suspension.expires_at}>\n\nYou cannot place bets, create markets, take loans, or withdraw until your suspension is lifted.`,
        });
        return;
      }
    }

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
      case 'economy':
      case 'supply':
        await handleEconomy(command, respond);
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
      case 'withdraw':
        await handleWithdraw(command, args, respond, client);
        break;
      case 'give':
        await handleGive(command, args, respond, client);
        break;
      case 'reset':
        await handleReset(command, args, respond, client);
        break;
      case 'petition':
        await handlePetition(command, args, respond, client);
        break;
      case 'fine':
        await handleFine(command, args, respond, client);
        break;
      case 'suspend':
        await handleSuspend(command, args, respond, client);
        break;
      case 'delete':
        await handleDelete(command, args, respond, client);
        break;
      case 'house':
        await handleHouse(command, args, respond);
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

async function handleEconomy(command, respond) {
  const supply = await getMoneySupply();
  const cftcBalance = await getCftcBalance();
  const houseBalance = await getHouseBalance();
  const sign = supply.inflationPct >= 0 ? '+' : '';
  const trend = supply.inflationPct > 0 ? '\uD83D\uDCC8' : supply.inflationPct < 0 ? '\uD83D\uDCC9' : '\u27A1\uFE0F';

  const text = [
    '*\uD83C\uDFE6 Economy Report*',
    '',
    `\uD83D\uDC65 *Users:* ${supply.userCount}`,
    `\uD83D\uDCB0 *Initial supply:* ${supply.initialSupply.toLocaleString()} coins  _(${supply.userCount} \u00D7 ${supply.startingBalance})_`,
    `\uD83D\uDCB5 *Current supply:* ${supply.currentSupply.toLocaleString()} coins`,
    `     \u2022 In wallets: ${supply.walletTotal.toLocaleString()} coins`,
    `     \u2022 Locked in markets: ${supply.lockedTotal.toLocaleString()} coins`,
    `     \u2022 CFTC fine pool: ${cftcBalance.toLocaleString()} coins`,
    `     \u2022 House pool (fixed-odds): ${houseBalance.toLocaleString()} coins`,
    '',
    `${trend} *Inflation:* ${sign}${supply.inflationPct.toFixed(2)}% from initial supply`,
  ].join('\n');

  await respond({
    response_type: 'in_channel',
    text,
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

  const isFixedOdds = market.market_type === 'fixed_odds';
  const total = bets.reduce((sum, b) => sum + Number(b.amount), 0);
  const lines = bets.map((b) => {
    if (isFixedOdds && b.locked_odds) {
      const payout = Math.floor(Number(b.amount) * Number(b.locked_odds));
      return `\u2022 ${b.option_label}: ${b.amount} coins at ${Number(b.locked_odds).toFixed(2)}x (payout: ${payout} coins)`;
    }
    return `\u2022 ${b.option_label}: ${b.amount} coins`;
  });

  const typeLabel = isFixedOdds ? ' (Fixed Odds)' : '';
  await respond({
    response_type: 'ephemeral',
    text: `*Your bets on "${market.title}"${typeLabel}:*\n${lines.join('\n')}\n\nTotal wagered: *${total} coins*`,
  });
}

async function handleLoan(command, args, respond, client) {
  const borrowerId = await resolveUserId(command.text, client);
  const numbers = command.text.match(/\b(\d+)\b/g);

  if (!borrowerId || !numbers || numbers.length < 2) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet loan @user 500 10` — Offer a 500 coin loan at 10% interest\nOptional: `/bet loan @user 500 10 3d` — due in 3 days (use `d` for days, `w` for weeks)\nMake sure to tag the user with @.',
    });
    return;
  }

  const amount = parseInt(numbers[numbers.length - 2], 10);
  const interestRate = parseFloat(numbers[numbers.length - 1]);

  // Parse optional due duration (e.g. "3d", "2w")
  const dueMatch = command.text.match(/\b(\d+)\s*(d|w)\b/i);
  let dueAt = null;
  if (dueMatch) {
    const dueNum = parseInt(dueMatch[1], 10);
    const dueUnit = dueMatch[2].toLowerCase();
    const dueMs = dueUnit === 'w' ? dueNum * 7 * 24 * 60 * 60 * 1000 : dueNum * 24 * 60 * 60 * 1000;
    dueAt = new Date(Date.now() + dueMs).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  }

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
    const loan = await createLoan(command.user_id, borrowerId, amount, interestRate, command.channel_id, dueAt);

    let loanDetails = `\uD83C\uDFE6 <@${command.user_id}> is offering <@${borrowerId}> a loan!\n\n\uD83D\uDCB0 *Amount:* ${amount} coins\n\uD83D\uDCC8 *Interest:* ${interestRate}%\n\uD83D\uDCB8 *Total to repay:* ${loan.total_owed} coins`;
    if (loan.due_at) {
      const dueUnix = Math.floor(new Date(loan.due_at + 'Z').getTime() / 1000);
      loanDetails += `\n\uD83D\uDCC5 *Due:* <!date^${dueUnix}^{date_short_pretty} at {time}|${loan.due_at}>`;
    }

    const result = await client.chat.postMessage({
      channel: command.channel_id,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Loan Offer', emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: loanDetails },
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
      const statusIcon = loan.status === 'overdue' ? '\uD83D\uDEA8' : loan.status === 'pending' ? '\u231B' : '\uD83D\uDCB8';
      let line = `${statusIcon} Loan #${loan.id} — ${loan.amount} coins from <@${loan.lender_id}> at ${loan.interest_rate}% \u2192 owe *${loan.total_owed} coins* (${loan.status})`;
      if (loan.due_at) {
        const dueUnix = Math.floor(new Date(loan.due_at + 'Z').getTime() / 1000);
        line += ` — due <!date^${dueUnix}^{date_short_pretty}|${loan.due_at}>`;
      }
      lines.push(line);
    }
  }

  if (given.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('*Loans you gave:*');
    for (const loan of given) {
      const statusIcon = loan.status === 'overdue' ? '\uD83D\uDEA8' : loan.status === 'pending' ? '\u231B' : '\uD83C\uDFE6';
      let line = `${statusIcon} Loan #${loan.id} — ${loan.amount} coins to <@${loan.borrower_id}> at ${loan.interest_rate}% \u2192 owed *${loan.total_owed} coins* (${loan.status})`;
      if (loan.due_at) {
        const dueUnix = Math.floor(new Date(loan.due_at + 'Z').getTime() / 1000);
        line += ` — due <!date^${dueUnix}^{date_short_pretty}|${loan.due_at}>`;
      }
      lines.push(line);
    }
  }

  await respond({
    response_type: 'ephemeral',
    text: lines.join('\n'),
  });
}

async function handleWithdraw(command, args, respond, client) {
  const marketId = parseInt(args[1], 10);
  if (!marketId) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet withdraw <market_id>` — Withdraw all your bets from an open market',
    });
    return;
  }

  try {
    const result = await withdrawUserBets(command.user_id, marketId);
    const market = await getMarket(marketId);

    // Refresh market message to update pools/odds
    if (market && market.message_ts) {
      const { buildMarketMessage } = require('../views/market-message');
      const blocks = await buildMarketMessage(market);
      await client.chat.update({
        channel: market.channel_id,
        ts: market.message_ts,
        blocks,
        text: market.title,
      });
    }

    await respond({
      response_type: 'ephemeral',
      text: `\u2705 Withdrew ${result.betsRemoved} bet(s) from *${market.title}*. Refunded *${result.refunded} coins* to your balance.`,
    });
  } catch (err) {
    await respond({ response_type: 'ephemeral', text: `\u274C ${err.message}` });
  }
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

async function handleDelete(command, args, respond, client) {
  if (!isAdmin(command.user_id)) {
    await respond({ response_type: 'ephemeral', text: '\uD83D\uDEAB Only admins can use `/bet delete`.' });
    return;
  }

  const marketId = parseInt(args[1], 10);
  if (!marketId) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet delete <market_id>` — Delete a market and remove its message',
    });
    return;
  }

  const market = await getMarket(marketId);
  if (!market) {
    await respond({ response_type: 'ephemeral', text: 'Market not found.' });
    return;
  }

  try {
    // Delete the Slack message
    if (market.message_ts) {
      try {
        await client.chat.delete({
          channel: market.channel_id,
          ts: market.message_ts,
        });
      } catch (e) {
        console.error(`[delete] Could not delete Slack message for market #${marketId}:`, e.message);
      }
    }

    const wasOpen = market.status === 'open';
    await deleteMarket(marketId);

    let msg = `\uD83D\uDDD1\uFE0F Market #${marketId} (*${market.title}*) has been deleted.`;
    if (wasOpen) msg += ' All bets have been refunded.';

    await respond({ response_type: 'ephemeral', text: msg });
  } catch (err) {
    await respond({ response_type: 'ephemeral', text: `\u274C ${err.message}` });
  }
}

async function handlePetition(command, args, respond, client) {
  const petitionType = (args[1] || '').toLowerCase();
  const referenceId = parseInt(args[2], 10);

  if (!['fine', 'suspension'].includes(petitionType) || !referenceId) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet petition fine <fine_id>` or `/bet petition suspension <suspension_id>`',
    });
    return;
  }

  try {
    const petition = await createPetition(petitionType, referenceId, command.user_id, command.channel_id);
    const action = await getReferencedAction(petition);

    let description;
    if (petitionType === 'fine') {
      description = `\uD83D\uDCB8 *Fine #${referenceId}* — <@${action.slack_id}> was fined *${action.amount} coins*\n\uD83D\uDCCB *Reason:* ${action.reason}`;
    } else {
      description = `\uD83D\uDEA8 *Suspension #${referenceId}* — <@${action.slack_id}> was suspended\n\uD83D\uDCCB *Reason:* ${action.reason}`;
    }

    const closesUnix = Math.floor(new Date(petition.closes_at + 'Z').getTime() / 1000);

    const result = await client.chat.postMessage({
      channel: command.channel_id,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '\uD83D\uDCDC Petition to Overturn CFTC Action', emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: description },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Filed by <@${command.user_id}>\n\u23F0 *Voting closes:* <!date^${closesUnix}^{date_short_pretty} at {time}|${petition.closes_at}>\n\n*Vote to overturn or uphold this action.* Majority of votes cast when the 24h window closes wins. Votes are final and cannot be changed.\n\n\u2705 *Overturn:* 0  |  \u274C *Uphold:* 0  |  \uD83D\uDDF3\uFE0F *Total:* 0`,
          },
        },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '\u2705 Vote to Overturn', emoji: true },
              action_id: `petition_vote_overturn_${petition.id}`,
              value: String(petition.id),
              style: 'primary',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '\u274C Vote to Uphold', emoji: true },
              action_id: `petition_vote_uphold_${petition.id}`,
              value: String(petition.id),
              style: 'danger',
            },
          ],
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Petition #${petition.id} \u2014 ${petitionType} #${referenceId}` },
          ],
        },
      ],
      text: `Petition to overturn ${petitionType} #${referenceId}`,
    });

    const { setPetitionMessageTs } = require('../models/petition');
    await setPetitionMessageTs(petition.id, result.ts);

    await respond({
      response_type: 'ephemeral',
      text: `\u2705 Petition #${petition.id} created. The community can now vote.`,
    });
  } catch (err) {
    await respond({ response_type: 'ephemeral', text: `\u274C ${err.message}` });
  }
}

async function handleFine(command, args, respond, client) {
  if (!isAdmin(command.user_id)) {
    await respond({ response_type: 'ephemeral', text: '\uD83D\uDEAB Only admins can use `/bet fine`.' });
    return;
  }

  const targetUserId = await resolveUserId(command.text, client);
  const numbers = command.text.match(/\b(\d+)\b/g);

  if (!targetUserId || !numbers || numbers.length < 1) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet fine @user 500 Market manipulation` — Fine a user and add coins to the CFTC pool',
    });
    return;
  }

  const amount = parseInt(numbers[0], 10);
  if (isNaN(amount) || amount <= 0) {
    await respond({ response_type: 'ephemeral', text: 'Fine amount must be a positive number.' });
    return;
  }

  // Extract reason: everything after the user mention and amount
  const textAfterUser = command.text.replace(/<@[^>]+>|@\S+/g, '').trim();
  const reason = textAfterUser.replace(/^\d+\s*/, '').trim() || 'No reason provided';

  try {
    await deductBalance(targetUserId, amount);
    await addToCftcPool(amount);
    const cftcBalance = await getCftcBalance();

    // Record fine in DB for petition tracking
    const fineResult = await getDb().execute({
      sql: 'INSERT INTO fines (slack_id, amount, reason, fined_by, channel_id) VALUES (?, ?, ?, ?, ?)',
      args: [targetUserId, amount, reason, command.user_id, command.channel_id],
    });
    const fineId = Number(fineResult.lastInsertRowid);

    await client.chat.postMessage({
      channel: command.channel_id,
      text: [
        `\uD83D\uDCB8 *CFTC FINE ISSUED* \uD83D\uDCB8`,
        '',
        `<@${targetUserId}> has been fined *${amount} coins*.`,
        '',
        `\uD83D\uDCCB *Violation:* ${reason}`,
        `\uD83C\uDFE6 *CFTC Pool Balance:* ${cftcBalance} coins`,
        `\uD83D\uDDC3\uFE0F *Fine #${fineId}*`,
        '',
        `_Fines are redistributed as market blind bets on underdog positions at market close._`,
        `_Use \`/bet petition fine ${fineId}\` to challenge this action._`,
      ].join('\n'),
    });

    await respond({
      response_type: 'ephemeral',
      text: `\u2705 Fined <@${targetUserId}> ${amount} coins (Fine #${fineId}). CFTC pool is now ${cftcBalance} coins.`,
    });
  } catch (err) {
    await respond({ response_type: 'ephemeral', text: `\u274C ${err.message}` });
  }
}

async function handleSuspend(command, args, respond, client) {
  if (!isAdmin(command.user_id)) {
    await respond({ response_type: 'ephemeral', text: '\uD83D\uDEAB Only admins can use `/bet suspend`.' });
    return;
  }

  const targetUserId = await resolveUserId(command.text, client);

  // Parse duration (e.g. "1h", "3d", "2w")
  const durationMatch = command.text.match(/\b(\d+)\s*(h|d|w)\b/i);

  // Reason is everything after the duration token
  const textAfterUser = command.text.replace(/<@[^>]+>|@\S+/g, '').trim();
  const reasonMatch = textAfterUser.replace(/\b\d+\s*(h|d|w)\b/i, '').trim();
  const reason = reasonMatch || 'No reason provided';

  if (!targetUserId || !durationMatch) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet suspend @user 3d Market manipulation` — Suspend for 3 days\nDurations: `h`=hours, `d`=days, `w`=weeks',
    });
    return;
  }

  const durationNum = parseInt(durationMatch[1], 10);
  const durationUnit = durationMatch[2].toLowerCase();
  const multipliers = { h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000, w: 7 * 24 * 60 * 60 * 1000 };
  const durationMs = durationNum * multipliers[durationUnit];
  const durationLabels = { h: 'hour(s)', d: 'day(s)', w: 'week(s)' };

  try {
    const result = await suspendUser(targetUserId, reason, command.user_id, command.channel_id, durationMs);
    const expiresUnix = Math.floor(new Date(result.expiresAt + 'Z').getTime() / 1000);

    // Post public notification to channel
    await client.chat.postMessage({
      channel: command.channel_id,
      text: [
        `\uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8 *CFTC ENFORCEMENT ACTION* \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8`,
        '',
        `<@${targetUserId}> has been *suspended* from all trading activity.`,
        '',
        `\uD83D\uDCCB *Offense:* ${reason}`,
        `\u23F1\uFE0F *Duration:* ${durationNum} ${durationLabels[durationUnit]}`,
        `\uD83D\uDD13 *Reinstated:* <!date^${expiresUnix}^{date_short_pretty} at {time}|${result.expiresAt}>`,
        `\uD83D\uDDC3\uFE0F *Suspension #${result.id}*`,
        '',
        `_This enforcement action was issued by the Coin Futures Trading Commission (CFTC)._`,
        `_Use \`/bet petition suspension ${result.id}\` to challenge this action._`,
      ].join('\n'),
    });

    await respond({
      response_type: 'ephemeral',
      text: `\u2705 Suspended <@${targetUserId}> for ${durationNum} ${durationLabels[durationUnit]} (Suspension #${result.id}).`,
    });
  } catch (err) {
    await respond({ response_type: 'ephemeral', text: `\u274C ${err.message}` });
  }
}

async function handleHouse(command, args, respond) {
  if (!isAdmin(command.user_id)) {
    await respond({ response_type: 'ephemeral', text: '\uD83D\uDEAB Only admins can use `/bet house`.' });
    return;
  }

  const amount = parseInt(args[1], 10);
  if (!amount || amount <= 0) {
    const balance = await getHouseBalance();
    await respond({
      response_type: 'ephemeral',
      text: `\uD83C\uDFE6 *Fixed-Odds House Pool:* ${balance} coins\n\nUsage: \`/bet house 5000\` \u2014 Fund the house pool with 5000 coins`,
    });
    return;
  }

  await addToHousePool(amount);
  const newBalance = await getHouseBalance();

  await respond({
    response_type: 'ephemeral',
    text: `\uD83C\uDFE6 Added *${amount} coins* to the fixed-odds house pool. New balance: *${newBalance} coins*`,
  });
}

async function handleHelp(respond) {
  await respond({
    response_type: 'ephemeral',
    text: [
      '*Betting Bot Commands:*',
      '`/bet create` — Create a new betting market (Pool or Fixed Odds)',
      '`/bet balance` — Check your coin balance',
      '`/bet markets` — List active markets in this channel',
      '`/bet mybets <market_id>` — View your bets on a market',
      '`/bet withdraw <market_id>` — Withdraw all your bets from an open market',
      '`/bet leaderboard` — Show the top earners',
      '`/bet economy` — Show total money supply and inflation rate',
      '`/bet petition fine <id>` — Petition to overturn a fine (24h voting window)',
      '`/bet petition suspension <id>` — Petition to overturn a suspension (24h voting window)',
      '',
      '*Market Types:*',
      '\u2022 *Pool (Parimutuel)* — All bets go into a shared pool. Winners split proportionally.',
      '\u2022 *Fixed Odds* — Odds shift dynamically but lock at bet time. House pool covers shortfalls.',
      '',
      '*Loans:*',
      '`/bet loan @user 500 10` — Offer a 500 coin loan at 10% interest',
      '`/bet loan @user 500 10 3d` — Same, but due in 3 days (`d`=days, `w`=weeks)',
      '`/bet loans` — View your active/pending loans',
      '`/bet repay <loan_id>` — Repay a loan',
      '',
      '*Admin Commands:*',
      '`/bet give @user 500` — Give coins to a user',
      '`/bet reset @user` — Reset a user\'s balance to starting amount',
      '`/bet delete <market_id>` — Delete a market and its message from the channel',
      '`/bet fine @user 500 Reason` — Fine a user (coins go to CFTC pool)',
      '`/bet suspend @user 3d Reason` — Suspend a user (`h`/`d`/`w`)',
      '`/bet house 5000` — Fund the fixed-odds house pool',
      '',
      '`/bet help` — Show this help message',
    ].join('\n'),
  });
}

module.exports = { registerBetCommand };
