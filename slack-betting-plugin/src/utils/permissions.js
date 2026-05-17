// Admin user IDs loaded from ADMIN_USER_IDS env var (comma-separated Slack user IDs)
// Example: ADMIN_USER_IDS=U07ABC123,U07DEF456

function getAdminIds() {
  const raw = process.env.ADMIN_USER_IDS || '';
  return raw.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
}

function isAdmin(slackId) {
  return getAdminIds().includes(slackId);
}

function isCreatorOrAdmin(slackId, creatorId) {
  return slackId === creatorId || isAdmin(slackId);
}

module.exports = { isAdmin, isCreatorOrAdmin, getAdminIds };
