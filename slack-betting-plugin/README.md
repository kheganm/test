# Slack Betting Plugin

A Slack bot for creating and participating in live parimutuel betting markets within your channels.

## Features

- **Create betting markets** with custom options via `/bet create`
- **Live odds display** — market messages update in real-time as bets come in
- **Parimutuel betting** — pool-based system where odds shift with the money
- **Virtual currency** — every user starts with 1,000 coins
- **Leaderboard** — track the top earners across your workspace
- **Full lifecycle** — create → bet → close → resolve → payout

## Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Enable **Socket Mode** (Settings → Socket Mode → Enable)
3. Generate an **App-Level Token** with `connections:write` scope
4. Under **Slash Commands**, create a command: `/bet`
5. Under **OAuth & Permissions**, add these bot token scopes:
   - `chat:write`
   - `commands`
   - `chat:write.public`
6. Under **Interactivity & Shortcuts**, enable interactivity
7. Install the app to your workspace

## Installation

```bash
cd slack-betting-plugin
npm install
```

## Configuration

Copy `.env.example` to `.env` and fill in your tokens:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Signing Secret from Basic Information |
| `SLACK_APP_TOKEN` | App-Level Token (`xapp-...`) |
| `PORT` | Server port (default: 3000) |
| `STARTING_BALANCE` | Coins each new user starts with (default: 1000) |

## Running

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Commands

| Command | Description |
|---|---|
| `/bet create` | Open a modal to create a new betting market |
| `/bet balance` | Check your coin balance |
| `/bet markets` | List active markets in the current channel |
| `/bet mybets <id>` | View your bets on a specific market |
| `/bet leaderboard` | Show the top earners |
| `/bet help` | Show all available commands |

## How It Works

### Creating a Market
An admin uses `/bet create` to open a modal where they enter a title, description, and betting options (one per line). A live market message is posted to the channel.

### Placing Bets
Users click "Bet on this" buttons on the market message. A modal opens where they enter their wager amount. After placing a bet, the market message updates live to show new odds and pool sizes.

### Odds System (Parimutuel)
This uses parimutuel betting — all bets go into a shared pool, and winners split the pool proportionally to their wager. The displayed odds show the current multiplier: `total_pool / option_pool`.

### Resolving a Market
1. The market creator clicks "Close Betting" to stop new bets
2. Resolve buttons appear for each option — the creator picks the winner
3. Payouts are calculated and distributed automatically
4. Results are announced in the channel

### Cancelling
The market creator can cancel at any time. All bets are fully refunded.

## Data Storage

Uses SQLite (via `better-sqlite3`) for zero-config persistence. The database file `betting.db` is created automatically in the project root on first run.
