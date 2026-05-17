// Resolve a user mention from command text to a Slack user ID.
// Handles both formats:
//   - Slack rich mention: <@U07XXXXXX|displayname> or <@U07XXXXXX>
//   - Plain text: @username
// For plain text, uses the Slack API to look up the user by name.

async function resolveUserId(text, client) {
  // Try rich mention first: <@U07XXXXXX|name> or <@U07XXXXXX>
  const richMatch = text.match(/<@([A-Z0-9]+)\|?[^>]*>/);
  if (richMatch) {
    return richMatch[1];
  }

  // Try plain @username
  const plainMatch = text.match(/@(\S+)/);
  if (plainMatch) {
    const username = plainMatch[1].toLowerCase();
    try {
      const result = await client.users.list({ limit: 500 });
      if (result.ok && result.members) {
        const user = result.members.find(
          (m) =>
            !m.deleted &&
            !m.is_bot &&
            (m.name?.toLowerCase() === username ||
              m.profile?.display_name?.toLowerCase() === username ||
              m.real_name?.toLowerCase() === username)
        );
        if (user) return user.id;
      }
    } catch (err) {
      console.error('User lookup failed:', err.message);
    }
  }

  return null;
}

module.exports = { resolveUserId };
