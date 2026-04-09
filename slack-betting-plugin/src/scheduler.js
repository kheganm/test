const { getMarketsToClose, getMarket, closeMarket } = require('./models/market');
const { buildMarketMessage } = require('./views/market-message');

function startScheduler(app) {
  console.log('Market auto-close scheduler started (checks every 30s)');

  setInterval(async () => {
    try {
      const markets = await getMarketsToClose();
      for (const market of markets) {
        console.log(`[scheduler] Auto-closing market #${market.id}: ${market.title}`);
        await closeMarket(market.id);
        const updated = await getMarket(market.id);
        const blocks = await buildMarketMessage(updated);

        await app.client.chat.update({
          channel: updated.channel_id,
          ts: updated.message_ts,
          blocks,
          text: updated.title,
        });

        await app.client.chat.postMessage({
          channel: updated.channel_id,
          text: `:alarm_clock: Betting is now *CLOSED* on *${updated.title}*. Time's up! Waiting for results...`,
        });
      }
    } catch (err) {
      console.error('[scheduler] Error:', err.message);
    }
  }, 30000);
}

module.exports = { startScheduler };
