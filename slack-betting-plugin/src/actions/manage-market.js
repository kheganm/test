const { createMarket, getMarket, setMessageTs, closeMarket, resolveMarket, cancelMarket } = require('../models/market');
const { buildMarketMessage } = require('../views/market-message');
const { isCreatorOrAdmin } = require('../utils/permissions');

function registerManageMarketActions(app) {
  // Handle create market modal submission
  app.view('create_market_submit', async ({ ack, view, body, client }) => {
    const { channelId } = JSON.parse(view.private_metadata);
    const title = view.state.values.title_block.title_input.value;
    const description = view.state.values.description_block?.description_input?.value || '';
    const optionsText = view.state.values.options_block.options_input.value;

    const optionLabels = optionsText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (optionLabels.length < 2) {
      await ack({
        response_action: 'errors',
        errors: { options_block: 'Please provide at least 2 options.' },
      });
      return;
    }

    if (optionLabels.length > 10) {
      await ack({
        response_action: 'errors',
        errors: { options_block: 'Maximum 10 options allowed.' },
      });
      return;
    }

    await ack();

    const creatorId = body.user.id;
    const marketId = createMarket(title, description, creatorId, channelId, optionLabels);
    const market = getMarket(marketId);
    const blocks = buildMarketMessage(market);

    const result = await client.chat.postMessage({
      channel: channelId,
      blocks,
      text: `New betting market: ${title}`,
    });

    setMessageTs(marketId, result.ts);
  });

  // Close market (stop accepting bets)
  app.action('close_market', async ({ action, ack, client, body }) => {
    await ack();

    const marketId = parseInt(action.value, 10);
    const market = getMarket(marketId);

    if (!market) return;
    if (!isCreatorOrAdmin(body.user.id, market.created_by)) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: ':no_entry: Only the market creator or an admin can close betting.',
      });
      return;
    }

    closeMarket(marketId);
    const updated = getMarket(marketId);
    const blocks = buildMarketMessage(updated);

    await client.chat.update({
      channel: updated.channel_id,
      ts: updated.message_ts,
      blocks,
      text: updated.title,
    });

    await client.chat.postMessage({
      channel: updated.channel_id,
      text: `:lock: Betting is now *CLOSED* on *${updated.title}*. Waiting for results...`,
    });
  });

  // Resolve market — pick a winner
  app.action(/^resolve_market_\d+$/, async ({ action, ack, client, body }) => {
    await ack();

    const { marketId, optionId } = JSON.parse(action.value);
    const market = getMarket(marketId);

    if (!market) return;
    if (!isCreatorOrAdmin(body.user.id, market.created_by)) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: ':no_entry: Only the market creator or an admin can resolve this market.',
      });
      return;
    }

    const payouts = resolveMarket(marketId, optionId);
    const updated = getMarket(marketId);
    const winner = updated.options.find((o) => o.id === optionId);
    const blocks = buildMarketMessage(updated);

    await client.chat.update({
      channel: updated.channel_id,
      ts: updated.message_ts,
      blocks,
      text: updated.title,
    });

    // Announce results
    let resultText = `:checkered_flag: *${updated.title}* has been resolved!\n:trophy: Winner: *${winner.label}*\n\n`;
    if (payouts.length === 0) {
      resultText += '_No winning bets — the house keeps the pool!_';
    } else {
      const payoutLines = payouts.map(
        (p) => `<@${p.slackId}>: bet ${p.amount} → won *${p.payout} coins* :moneybag:`
      );
      resultText += `*Payouts:*\n${payoutLines.join('\n')}`;
    }

    await client.chat.postMessage({
      channel: updated.channel_id,
      text: resultText,
    });
  });

  // Cancel market — refund all bets
  app.action('cancel_market', async ({ action, ack, client, body }) => {
    await ack();

    const marketId = parseInt(action.value, 10);
    const market = getMarket(marketId);

    if (!market) return;
    if (!isCreatorOrAdmin(body.user.id, market.created_by)) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: ':no_entry: Only the market creator or an admin can cancel this market.',
      });
      return;
    }

    const refunds = cancelMarket(marketId);
    const updated = getMarket(marketId);
    const blocks = buildMarketMessage(updated);

    await client.chat.update({
      channel: updated.channel_id,
      ts: updated.message_ts,
      blocks,
      text: updated.title,
    });

    await client.chat.postMessage({
      channel: updated.channel_id,
      text: `:no_entry_sign: *${updated.title}* has been cancelled. All bets (${refunds.length}) have been refunded.`,
    });
  });
}

module.exports = { registerManageMarketActions };
