const { getPoolByOption, getTotalPool } = require('../models/bet');
const { calculateOdds, formatOdds } = require('../utils/odds');

const STATUS_EMOJI = {
  open: ':green_circle:',
  closed: ':red_circle:',
  resolved: ':checkered_flag:',
  cancelled: ':no_entry_sign:',
};

function buildMarketMessage(market) {
  const pools = getPoolByOption(market.id);
  const totalPool = getTotalPool(market.id);
  const poolMap = {};
  for (const p of pools) {
    poolMap[p.option_id] = p;
  }

  const statusEmoji = STATUS_EMOJI[market.status] || ':grey_question:';
  const blocks = [];

  // Header
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `${market.title}`, emoji: true },
  });

  // Status & info
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${statusEmoji} *Status:* ${market.status.toUpperCase()}  |  :moneybag: *Total Pool:* ${totalPool} coins${market.description ? `\n${market.description}` : ''}`,
    },
  });

  blocks.push({ type: 'divider' });

  // Options with odds
  for (const option of market.options) {
    const pool = poolMap[option.id] || { pool: 0, num_bets: 0 };
    const odds = calculateOdds(pool.pool, totalPool);
    const percentage = totalPool > 0 ? ((pool.pool / totalPool) * 100).toFixed(1) : '0.0';
    const progressBar = buildProgressBar(totalPool > 0 ? pool.pool / totalPool : 0);

    const winnerTag = option.is_winner ? ' :trophy: *WINNER*' : '';

    const sectionBlock = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${option.label}*${winnerTag}\n${progressBar} ${percentage}%\nPool: ${pool.pool} coins  |  Odds: ${formatOdds(odds)}  |  ${pool.num_bets} bet(s)`,
      },
    };

    // Add bet button only if market is open
    if (market.status === 'open') {
      sectionBlock.accessory = {
        type: 'button',
        text: { type: 'plain_text', text: `Bet on this`, emoji: true },
        action_id: `place_bet_${option.id}`,
        value: JSON.stringify({ marketId: market.id, optionId: option.id }),
        style: 'primary',
      };
    }

    blocks.push(sectionBlock);
  }

  blocks.push({ type: 'divider' });

  // Admin actions
  if (market.status === 'open') {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: ':lock: Close Betting', emoji: true },
          action_id: 'close_market',
          value: String(market.id),
          style: 'danger',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: ':x: Cancel Market', emoji: true },
          action_id: 'cancel_market',
          value: String(market.id),
        },
      ],
    });
  } else if (market.status === 'closed') {
    const resolveButtons = market.options.map((option) => ({
      type: 'button',
      text: { type: 'plain_text', text: `:trophy: ${option.label} wins`, emoji: true },
      action_id: `resolve_market_${option.id}`,
      value: JSON.stringify({ marketId: market.id, optionId: option.id }),
      style: 'primary',
    }));
    blocks.push({
      type: 'actions',
      elements: resolveButtons,
    });
  }

  // Footer
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Created by <@${market.created_by}>  |  Market #${market.id}${market.status === 'open' ? '  |  Use the buttons above or `/bet place` to bet' : ''}`,
      },
    ],
  });

  return blocks;
}

function buildProgressBar(ratio) {
  const filled = Math.round(ratio * 10);
  const empty = 10 - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

module.exports = { buildMarketMessage };
