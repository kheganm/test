require('dotenv').config();

const { App } = require('@slack/bolt');
const { migrate } = require('./db');
const { registerBetCommand } = require('./commands/bet');
const { registerPlaceBetActions } = require('./actions/place-bet');
const { registerManageMarketActions } = require('./actions/manage-market');
const { registerLoanActions } = require('./actions/loan');
const { registerPetitionActions } = require('./actions/petition');
const { startScheduler } = require('./scheduler');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000,
});

// Register all handlers
registerBetCommand(app);
registerPlaceBetActions(app);
registerManageMarketActions(app);
registerLoanActions(app);
registerPetitionActions(app);

(async () => {
  await migrate();
  await app.start();
  startScheduler(app);
  console.log('Betting Bot is running!');
})();
