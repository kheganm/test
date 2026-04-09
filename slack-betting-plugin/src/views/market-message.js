const { getPoolByOption, getTotalPool } = require('../models/bet');
const { calculateOdds, formatOdds } = require('../utils/odds');

const STATUS_EMOJI = {
  open: ':green_circle:',
  closed: ':red_circle:',
  resolved: ':checkered_flag:',
  cancelled: ':no_entry_sign:',
};

async function buildMarketMessage(market) {
  const pools = await getPoolByOption(market.id);
  const totalPool = await getTotalPool(market.id);
  const poolMap = {};
  for (const p of pools) {
    poolMap[p.option_id] = p;
  }

  const statusEmoji = STATUS_EMOJI[market.status] || ':grey_question:';
  const blocks = [];

  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `${market.title}`, emoji: true },
  });

  let statusText = `${statusEmoji} *Status:* ${market.status.toUpperCase()}  |  :moneybag: *Total Pool:* ${totalPool} coins`;
  if (market.close_at && market.status === 'open') {
    statusText += `\n:alarm_clock: *Betting closes:* <!date^${Math.floor(new Date(market.close_at + 'Z').getTime() / 1000)}^{date_short_pretty} at {time}|${market.close_at}>`;
  }
  if (market.description) statusText += `\n${market.description}`;

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: statusText },
  });

  blocks.push({ type: 'divider' });

  for (const option of market.options) {
    const pool = poolMap[option.id] || { pool: 0, num_bets: 0 };
    const poolAmount = Number(pool.pool);
    const numBets = Number(pool.num_bets);
    const odds = calculateOdds(poolAmount, totalPool);
    const percentage = totalPool > 0 ? ((poolAmount / totalPool) * 100).toFixed(1) : '0.0';
    const progressBar = buildProgressBar(totalPool > 0 ? poolAmount / totalPool : 0);
    const winnerTag = option.is_winner ? ' :trophy: *WINNER*' : '';

    const sectionBlock = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${option.label}*${winnerTag}\n${progressBar} ${percentage}%\nPool: ${poolAmount} coins  |  Odds: ${formatOdds(odds)}  |  ${numBets} bet(s)`,
      },
    };

    if (market.status === 'open') {
      sectionBlock.accessory = {
        type: 'button',
        text: { type: 'plain_text', text: `Bet on this`, emoji: true },
        action_id: `place_bet_${market.id}_${option.id}`,
        value: JSON.stringify({ marketId: Number(market.id), optionId: Number(option.id) }),
        style: 'primary',
      };
    }

    blocks.push(sectionBlock);
  }

  blocks.push({ type: 'divider' });

  if (market.status === 'open') {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: ':lock: Close Betting', emoji: true },
          action_id: `close_market_${market.id}`,
          value: String(market.id),
          style: 'danger',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: ':x: Cancel Market', emoji: true },
          action_id: `cancel_market_${market.id}`,
          value: String(market.id),
        },
      ],
    });
  } else if (market.status === 'closed') {
    const resolveButtons = market.options.map((option) => ({
      type: 'button',
      text: { type: 'plain_text', text: `:trophy: ${option.label} wins`, emoji: true },
      action_id: `resolve_market_${market.id}_${option.id}`,
      value: JSON.stringify({ marketId: Number(market.id), optionId: Number(option.id) }),
      style: 'primary',
    }));
    blocks.push({
      type: 'actions',
      elements: resolveButtons,
    });
  }

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
