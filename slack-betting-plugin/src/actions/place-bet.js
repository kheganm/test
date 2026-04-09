const { getMarket } = require('../models/market');
const { placeBet } = require('../models/bet');
const { getBalance } = require('../models/user');
const { buildPlaceBetModal } = require('../views/modals');
const { buildMarketMessage } = require('../views/market-message');

function registerPlaceBetActions(app) {
  // Handle "Bet on this" button clicks — opens the bet modal
  app.action(/^place_bet_\d+_\d+$/, async ({ action, ack, client, body }) => {
    await ack();

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

    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildPlaceBetModal(marketId, optionId, option.label, balance),
    });
  });

  // Handle bet modal submission
  app.view('place_bet_submit', async ({ ack, view, body, client }) => {
    const { marketId, optionId } = JSON.parse(view.private_metadata);
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
      await placeBet(body.user.id, marketId, optionId, amount);
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

      await client.chat.postEphemeral({
        channel: market.channel_id,
        user: body.user.id,
        text: `:white_check_mark: Bet placed! You wagered *${amount} coins* on *${market.options.find((o) => Number(o.id) === optionId)?.label}*.`,
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
