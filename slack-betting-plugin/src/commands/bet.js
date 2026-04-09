const { getBalance, addBalance, getOrCreateUser } = require('../models/user');
const { getActiveMarkets, getMarket } = require('../models/market');
const { getUserBetsOnMarket } = require('../models/bet');
const { buildCreateMarketModal } = require('../views/modals');
const { buildLeaderboardMessage } = require('../views/leaderboard');
const { buildMarketMessage } = require('../views/market-message');

function registerBetCommand(app) {
  app.command('/bet', async ({ command, ack, respond, client }) => {
    await ack();

    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase() || 'help';

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
      case 'give':
        await handleGive(command, args, respond);
        break;
      case 'reset':
        await handleReset(command, args, respond);
        break;
      case 'help':
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
  const balance = getBalance(command.user_id);
  await respond({
    response_type: 'ephemeral',
    text: `:coin: Your balance: *${balance} coins*`,
  });
}

async function handleLeaderboard(command, respond) {
  const blocks = buildLeaderboardMessage();
  await respond({
    response_type: 'in_channel',
    blocks,
    text: 'Leaderboard',
  });
}

async function handleMarkets(command, respond) {
  const markets = getActiveMarkets(command.channel_id);
  if (markets.length === 0) {
    await respond({
      response_type: 'ephemeral',
      text: 'No active markets in this channel. Use `/bet create` to start one!',
    });
    return;
  }

  const lines = markets.map((m) => {
    const status = m.status === 'open' ? ':green_circle:' : ':red_circle:';
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

  const market = getMarket(marketId);
  if (!market) {
    await respond({ response_type: 'ephemeral', text: 'Market not found.' });
    return;
  }

  const bets = getUserBetsOnMarket(command.user_id, marketId);
  if (bets.length === 0) {
    await respond({
      response_type: 'ephemeral',
      text: `You have no bets on *${market.title}*.`,
    });
    return;
  }

  const total = bets.reduce((sum, b) => sum + b.amount, 0);
  const lines = bets.map((b) => `• ${b.option_label}: ${b.amount} coins`);

  await respond({
    response_type: 'ephemeral',
    text: `*Your bets on "${market.title}":*\n${lines.join('\n')}\n\nTotal wagered: *${total} coins*`,
  });
}

async function handleGive(command, args, respond) {
  // Usage: /bet give @user 500
  const mentionMatch = command.text.match(/<@([A-Z0-9]+)\|?[^>]*>/);
  const amountStr = args[args.length - 1];
  const amount = parseInt(amountStr, 10);

  if (!mentionMatch || isNaN(amount) || amount <= 0) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet give @user 500` — Give coins to a user',
    });
    return;
  }

  const targetUserId = mentionMatch[1];
  getOrCreateUser(targetUserId);
  addBalance(targetUserId, amount);
  const newBalance = getBalance(targetUserId);

  await respond({
    response_type: 'ephemeral',
    text: `:moneybag: Gave *${amount} coins* to <@${targetUserId}>. Their new balance: *${newBalance} coins*`,
  });
}

async function handleReset(command, args, respond) {
  // Usage: /bet reset @user  (resets to starting balance)
  const mentionMatch = command.text.match(/<@([A-Z0-9]+)\|?[^>]*>/);

  if (!mentionMatch) {
    await respond({
      response_type: 'ephemeral',
      text: 'Usage: `/bet reset @user` — Reset a user\'s balance to the starting amount',
    });
    return;
  }

  const targetUserId = mentionMatch[1];
  const startingBalance = parseInt(process.env.STARTING_BALANCE || '1000', 10);
  const currentBalance = getBalance(targetUserId);
  const diff = startingBalance - currentBalance;

  if (diff > 0) {
    addBalance(targetUserId, diff);
  } else if (diff < 0) {
    const { getDb } = require('../db');
    getDb().prepare('UPDATE users SET balance = ? WHERE slack_id = ?').run(startingBalance, targetUserId);
  }

  await respond({
    response_type: 'ephemeral',
    text: `:arrows_counterclockwise: Reset <@${targetUserId}>'s balance to *${startingBalance} coins*`,
  });
}

async function handleHelp(respond) {
  await respond({
    response_type: 'ephemeral',
    text: [
      '*Betting Bot Commands:*',
      '`/bet create` — Create a new betting market',
      '`/bet balance` — Check your coin balance',
      '`/bet markets` — List active markets in this channel',
      '`/bet mybets <market_id>` — View your bets on a market',
      '`/bet leaderboard` — Show the top earners',
      '',
      '*Admin Commands:*',
      '`/bet give @user 500` — Give coins to a user',
      '`/bet reset @user` — Reset a user\'s balance to starting amount',
      '',
      '`/bet help` — Show this help message',
    ].join('\n'),
  });
}

module.exports = { registerBetCommand };
