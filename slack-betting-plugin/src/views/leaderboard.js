const { getLeaderboard } = require('../models/user');

function buildLeaderboardMessage() {
  const leaders = getLeaderboard(10);

  if (leaders.length === 0) {
    return [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: 'No users yet. Place a bet to get started!' },
      },
    ];
  }

  const medals = [':first_place_medal:', ':second_place_medal:', ':third_place_medal:'];
  const lines = leaders.map((user, i) => {
    const medal = medals[i] || `${i + 1}.`;
    return `${medal} <@${user.slack_id}> — *${user.balance}* coins`;
  });

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Leaderboard', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') },
    },
  ];
}

module.exports = { buildLeaderboardMessage };
