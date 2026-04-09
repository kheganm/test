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

    // Get close date/time
    const closeDate = view.state.values.close_date_block?.close_date_input?.selected_date || null;
    const closeTime = view.state.values.close_time_block?.close_time_input?.selected_time || null;
    let closeAt = null;
    if (closeDate && closeTime) {
      closeAt = `${closeDate} ${closeTime}:00`;
    } else if (closeDate) {
      closeAt = `${closeDate} 23:59:00`;
    }

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
    const marketId = await createMarket(title, description, creatorId, channelId, optionLabels, closeAt);
    const market = await getMarket(marketId);
    const blocks = await buildMarketMessage(market);

    const result = await client.chat.postMessage({
      channel: channelId,
      blocks,
      text: `New betting market: ${title}`,
    });

    await setMessageTs(marketId, result.ts);
  });

  // Close market (stop accepting bets) — action_id includes market ID now
  app.action(/^close_market_\d+$/, async ({ action, ack, client, body }) => {
    await ack();

    const marketId = parseInt(action.value, 10);
    const market = await getMarket(marketId);

    if (!market) return;
    if (!isCreatorOrAdmin(body.user.id, market.created_by)) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: ':no_entry: Only the market creator or an admin can close betting.',
      });
      return;
    }

    await closeMarket(marketId);
    const updated = await getMarket(marketId);
    const blocks = await buildMarketMessage(updated);

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

  // Resolve market — action_id includes both market ID and option ID
  app.action(/^resolve_market_\d+_\d+$/, async ({ action, ack, client, body }) => {
    await ack();

    const { marketId, optionId } = JSON.parse(action.value);
    const market = await getMarket(marketId);

    if (!market) return;
    if (!isCreatorOrAdmin(body.user.id, market.created_by)) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: ':no_entry: Only the market creator or an admin can resolve this market.',
      });
      return;
    }

    const payouts = await resolveMarket(marketId, optionId);
    const updated = await getMarket(marketId);
    const winner = updated.options.find((o) => Number(o.id) === optionId);
    const blocks = await buildMarketMessage(updated);

    await client.chat.update({
      channel: updated.channel_id,
      ts: updated.message_ts,
      blocks,
      text: updated.title,
    });

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

  // Cancel market — action_id includes market ID
  app.action(/^cancel_market_\d+$/, async ({ action, ack, client, body }) => {
    await ack();

    const marketId = parseInt(action.value, 10);
    const market = await getMarket(marketId);

    if (!market) return;
    if (!isCreatorOrAdmin(body.user.id, market.created_by)) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: ':no_entry: Only the market creator or an admin can cancel this market.',
      });
      return;
    }

    const refunds = await cancelMarket(marketId);
    const updated = await getMarket(marketId);
    const blocks = await buildMarketMessage(updated);

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
