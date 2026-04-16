const { createMarket, getMarket, setMessageTs, closeMarket, resolveMarket, cancelMarket } = require('../models/market');
const { buildMarketMessage } = require('../views/market-message');
const { isCreatorOrAdmin } = require('../utils/permissions');
const { applyCftcBlind } = require('../models/cftc');

function registerManageMarketActions(app) {
  // Handle create market modal submission
  app.view('create_market_submit', async ({ ack, view, body, client }) => {
    const { channelId } = JSON.parse(view.private_metadata);
    const title = view.state.values.title_block.title_input.value;
    const description = view.state.values.description_block?.description_input?.value || '';
    const optionsText = view.state.values.options_block.options_input.value;
    const marketType = view.state.values.market_type_block?.market_type_input?.selected_option?.value || 'parimutuel';

    // Get close date/time and convert from user's local timezone to UTC
    const closeDate = view.state.values.close_date_block?.close_date_input?.selected_date || null;
    const closeTime = view.state.values.close_time_block?.close_time_input?.selected_time || null;
    let closeAt = null;
    if (closeDate) {
      const timeStr = closeTime || '23:59';
      const localDateStr = `${closeDate}T${timeStr}:00`;

      // Look up the user's timezone offset
      let tzOffsetSec = 0;
      try {
        const userInfo = await client.users.info({ user: body.user.id });
        tzOffsetSec = userInfo.user.tz_offset || 0;
      } catch (e) {
        console.error('Could not fetch user timezone, defaulting to UTC:', e.message);
      }

      // Parse as local time, subtract offset to get UTC
      const localMs = new Date(localDateStr).getTime();
      const utcMs = localMs - (tzOffsetSec * 1000);
      const utcDate = new Date(utcMs);
      closeAt = utcDate.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

      if (utcDate.getTime() <= Date.now()) {
        await ack({
          response_action: 'errors',
          errors: { close_date_block: 'Close date must be in the future.' },
        });
        return;
      }
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

    // Parse initial odds for fixed-odds markets
    let initialOdds = null;
    if (marketType === 'fixed_odds') {
      const oddsText = view.state.values.initial_odds_block?.initial_odds_input?.value || '';
      const oddsValues = oddsText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((l) => parseFloat(l));

      if (oddsValues.length !== optionLabels.length) {
        await ack({
          response_action: 'errors',
          errors: { initial_odds_block: `Please provide exactly ${optionLabels.length} odds values (one per option).` },
        });
        return;
      }

      for (const o of oddsValues) {
        if (isNaN(o) || o <= 1.0) {
          await ack({
            response_action: 'errors',
            errors: { initial_odds_block: 'Each odds value must be a number greater than 1.0 (e.g., 2.50).' },
          });
          return;
        }
      }

      initialOdds = oddsValues;
    }

    await ack();

    const creatorId = body.user.id;
    const marketId = await createMarket(title, description, creatorId, channelId, optionLabels, closeAt, marketType, initialOdds);
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
        text: '\uD83D\uDEAB Only the market creator or an admin can close betting.',
      });
      return;
    }

    await closeMarket(marketId);

    // CFTC blind only applies to parimutuel markets
    let blind = null;
    if (market.market_type !== 'fixed_odds') {
      blind = await applyCftcBlind(marketId);
    }

    const updated = await getMarket(marketId);
    const blocks = await buildMarketMessage(updated);

    await client.chat.update({
      channel: updated.channel_id,
      ts: updated.message_ts,
      blocks,
      text: updated.title,
    });

    let closeText = `\uD83D\uDD12 Betting is now *CLOSED* on *${updated.title}*. Waiting for results...`;
    if (blind) {
      closeText += `\n\uD83C\uDFE6 The CFTC placed a *${blind.amount} coin* blind bet on *${blind.optionLabel}*.`;
    }

    await client.chat.postMessage({
      channel: updated.channel_id,
      text: closeText,
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
        text: '\uD83D\uDEAB Only the market creator or an admin can resolve this market.',
      });
      return;
    }

    const result = await resolveMarket(marketId, optionId);
    const { payouts, marketType: resolvedType, houseDelta } = result;
    const updated = await getMarket(marketId);
    const winner = updated.options.find((o) => Number(o.id) === optionId);
    const blocks = await buildMarketMessage(updated);

    await client.chat.update({
      channel: updated.channel_id,
      ts: updated.message_ts,
      blocks,
      text: updated.title,
    });

    let resultText = `\uD83C\uDFC1 *${updated.title}* has been resolved!\n\uD83C\uDFC6 Winner: *${winner.label}*\n\n`;
    if (payouts.length === 0) {
      resultText += '_No winning bets — the house keeps the pool!_';
    } else {
      const payoutLines = payouts.map((p) => {
        if (resolvedType === 'fixed_odds' && p.lockedOdds) {
          return `<@${p.slackId}>: bet ${p.amount} at ${p.lockedOdds.toFixed(2)}x \u2192 won *${p.payout} coins* \uD83D\uDCB0`;
        }
        return `<@${p.slackId}>: bet ${p.amount} \u2192 won *${p.payout} coins* \uD83D\uDCB0`;
      });
      resultText += `*Payouts:*\n${payoutLines.join('\n')}`;
    }

    if (resolvedType === 'fixed_odds' && houseDelta !== undefined) {
      if (houseDelta >= 0) {
        resultText += `\n\n\uD83C\uDFE6 *House profit:* +${houseDelta} coins`;
      } else {
        resultText += `\n\n\uD83C\uDFE6 *House loss:* ${houseDelta} coins`;
      }
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
    if (market.status !== 'open') {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: 'This market is no longer open and cannot be cancelled.',
      });
      return;
    }
    if (!isCreatorOrAdmin(body.user.id, market.created_by)) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: '\uD83D\uDEAB Only the market creator or an admin can cancel this market.',
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
      text: `\uD83D\uDEAB *${updated.title}* has been cancelled. All bets (${refunds.length}) have been refunded.`,
    });
  });
}

module.exports = { registerManageMarketActions };
