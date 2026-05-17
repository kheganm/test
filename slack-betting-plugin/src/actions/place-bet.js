const { getMarket } = require('../models/market');
const { placeBet, getPoolByOption, getTotalPool } = require('../models/bet');
const { getBalance, getActiveSuspension } = require('../models/user');
const { buildPlaceBetModal } = require('../views/modals');
const { buildMarketMessage } = require('../views/market-message');
const { calculateCostMultipliers } = require('../utils/weighted');

function registerPlaceBetActions(app) {
  // Handle "Bet on this" button clicks — opens the bet modal
  app.action(/^place_bet_\d+_\d+$/, async ({ action, ack, client, body }) => {
    await ack();

    const suspension = await getActiveSuspension(body.user.id);
    if (suspension) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: `\uD83D\uDEA8 You are suspended by the CFTC and cannot place bets. Reason: ${suspension.reason}`,
      });
      return;
    }

    const { marketId, optionId } = JSON.parse(action.value);
    const market = await getMarket(marketId);
    if (!market || market.status !== 'open') {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: 'This market is no longer accepting bets.',
      });
      return;
    }

    const option = market.options.find((o) => Number(o.id) === optionId);
    const balance = await getBalance(body.user.id);

    // For weighted markets, compute current cost multiplier to show in modal
    let costMultiplier = null;
    if (market.market_type === 'weighted') {
      const pools = await getPoolByOption(marketId);
      const totalPool = await getTotalPool(marketId);
      const betsPerOption = {};
      for (const opt of market.options) {
        betsPerOption[opt.id] = 0;
      }
      for (const p of pools) {
        betsPerOption[p.option_id] = Number(p.pool);
      }
      const multiplierMap = calculateCostMultipliers(market.options.length, betsPerOption, totalPool);
      costMultiplier = multiplierMap[optionId];
    }

    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildPlaceBetModal(marketId, optionId, option.label, balance, market.market_type, costMultiplier),
    });
  });

  // Handle bet modal submission
  app.view('place_bet_submit', async ({ ack, view, body, client }) => {
    const { marketId, optionId, marketType } = JSON.parse(view.private_metadata);
    const amountStr = view.state.values.amount_block.amount_input.value;
    const amount = parseInt(amountStr, 10);

    if (isNaN(amount) || amount <= 0) {
      await ack({
        response_action: 'errors',
        errors: { amount_block: 'Please enter a valid positive number.' },
      });
      return;
    }

    try {
      // For weighted markets, compute cost multiplier at submission time
      let costMultiplier = null;
      if (marketType === 'weighted') {
        const market = await getMarket(marketId);
        const pools = await getPoolByOption(marketId);
        const totalPool = await getTotalPool(marketId);
        const betsPerOption = {};
        for (const opt of market.options) {
          betsPerOption[opt.id] = 0;
        }
        for (const p of pools) {
          betsPerOption[p.option_id] = Number(p.pool);
        }
        const multiplierMap = calculateCostMultipliers(market.options.length, betsPerOption, totalPool);
        costMultiplier = multiplierMap[optionId];
      }

      await placeBet(body.user.id, marketId, optionId, amount, costMultiplier);
      await ack();

      const market = await getMarket(marketId);
      if (market && market.message_ts) {
        const blocks = await buildMarketMessage(market);
        await client.chat.update({
          channel: market.channel_id,
          ts: market.message_ts,
          blocks,
          text: market.title,
        });
      }

      const optionLabel = market.options.find((o) => Number(o.id) === optionId)?.label;
      let confirmText = `\u2705 Bet placed! You wagered *${amount} coins* on *${optionLabel}*.`;
      if (costMultiplier) {
        const actualCost = Math.ceil(amount * costMultiplier);
        confirmText = `\u2705 Bet placed! *${amount} coins* on *${optionLabel}* (cost: *${actualCost} coins* at ${costMultiplier.toFixed(2)}x).`;
      }

      await client.chat.postEphemeral({
        channel: market.channel_id,
        user: body.user.id,
        text: confirmText,
      });
    } catch (err) {
      await ack({
        response_action: 'errors',
        errors: { amount_block: err.message },
      });
    }
  });
}

module.exports = { registerPlaceBetActions };
