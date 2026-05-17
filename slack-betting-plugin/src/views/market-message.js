const { getPoolByOption, getTotalPool, getTopBettorsByOption, getCftcBetForOption } = require('../models/bet');
const { calculateOdds, formatOdds } = require('../utils/odds');
const { calculateCostMultipliers, formatMultiplier } = require('../utils/weighted');

const STATUS_EMOJI = {
  open: '\uD83D\uDFE2',       // green circle
  closed: '\uD83D\uDD34',     // red circle
  resolved: '\uD83C\uDFC1',   // checkered flag
  cancelled: '\uD83D\uDEAB',  // no entry sign
};

async function buildMarketMessage(market) {
  const pools = await getPoolByOption(market.id);
  const totalPool = await getTotalPool(market.id);
  const poolMap = {};
  for (const p of pools) {
    poolMap[p.option_id] = p;
  }

  const topBettors = await getTopBettorsByOption(market.id);
  const cftcBets = await getCftcBetForOption(market.id);

  const isWeighted = market.market_type === 'weighted';
  const typeLabel = isWeighted ? 'WEIGHTED' : 'POOL';

  // For weighted markets, compute current cost multipliers
  let multiplierMap = {};
  if (isWeighted) {
    const betsPerOption = {};
    for (const opt of market.options) {
      const pool = poolMap[opt.id];
      betsPerOption[opt.id] = pool ? Number(pool.pool) : 0;
    }
    multiplierMap = calculateCostMultipliers(market.options.length, betsPerOption, totalPool);
  }

  const statusEmoji = STATUS_EMOJI[market.status] || '\u2753';
  const blocks = [];

  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `${market.title}`, emoji: true },
  });

  let statusText = `${statusEmoji} *Status:* ${market.status.toUpperCase()}  |  \uD83C\uDFB2 *Type:* ${typeLabel}  |  \uD83D\uDCB0 *Total Pool:* ${totalPool} coins`;
  if (market.close_at && market.status === 'open') {
    statusText += `\n\u23F0 *Betting closes:* <!date^${Math.floor(new Date(market.close_at + 'Z').getTime() / 1000)}^{date_short_pretty} at {time}|${market.close_at}>`;
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
    const percentage = totalPool > 0 ? ((poolAmount / totalPool) * 100).toFixed(1) : '0.0';
    const progressBar = buildProgressBar(totalPool > 0 ? poolAmount / totalPool : 0);
    const winnerTag = option.is_winner ? ' \uD83C\uDFC6 *WINNER*' : '';

    let oddsDisplay;
    if (isWeighted) {
      const multiplier = multiplierMap[option.id] || 1.0;
      oddsDisplay = `Cost: ${formatMultiplier(multiplier)}`;
    } else {
      const odds = calculateOdds(poolAmount, totalPool);
      oddsDisplay = `Odds: ${formatOdds(odds)}`;
    }

    const sectionBlock = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${option.label}*${winnerTag}\n${progressBar} ${percentage}%\nPool: ${poolAmount} coins  |  ${oddsDisplay}  |  ${numBets} bet(s)`,
      },
    };

    if (market.status === 'open') {
      sectionBlock.accessory = {
        type: 'button',
        text: { type: 'plain_text', text: 'Bet on this', emoji: true },
        action_id: `place_bet_${market.id}_${option.id}`,
        value: JSON.stringify({ marketId: Number(market.id), optionId: Number(option.id) }),
        style: 'primary',
      };
    }

    blocks.push(sectionBlock);

    const optionTopBettors = topBettors[option.id];
    const cftcAmount = cftcBets[option.id];
    const contextParts = [];
    if (cftcAmount && !isWeighted) {
      contextParts.push(`\uD83C\uDFE6 *CFTC blind:* ${cftcAmount} coins`);
    }
    if (optionTopBettors && optionTopBettors.length > 0) {
      const bettorLines = optionTopBettors.map(
        (b, i) => `${i + 1}. <@${b.slackId}> \u2014 ${b.total} coins`
      );
      contextParts.push(`\uD83D\uDCCA *Top bettors:* ${bettorLines.join('  |  ')}`);
    }
    if (contextParts.length > 0) {
      blocks.push({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: contextParts.join('\n') },
        ],
      });
    }
  }

  blocks.push({ type: 'divider' });

  if (market.status === 'open') {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '\u274C Cancel Market', emoji: true },
          action_id: `cancel_market_${market.id}`,
          value: String(market.id),
        },
      ],
    });
  } else if (market.status === 'closed') {
    const resolveButtons = market.options.map((option) => ({
      type: 'button',
      text: { type: 'plain_text', text: `\uD83C\uDFC6 ${option.label} wins`, emoji: true },
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
        text: `Created by <@${market.created_by}>  |  Market #${market.id}  |  ${typeLabel}${market.status === 'open' ? '  |  Use the buttons above to bet' : ''}`,
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
