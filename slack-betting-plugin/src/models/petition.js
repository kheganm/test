const { getDb } = require('../db');

async function createPetition(petitionType, referenceId, createdBy, channelId) {
  const db = getDb();

  // Verify the referenced fine/suspension exists and is active
  if (petitionType === 'fine') {
    const fine = await db.execute({ sql: "SELECT * FROM fines WHERE id = ? AND status = 'active'", args: [referenceId] });
    if (fine.rows.length === 0) throw new Error('Fine not found or already overturned.');
  } else {
    const suspension = await db.execute({
      sql: "SELECT * FROM suspensions WHERE id = ? AND status = 'active' AND expires_at > datetime('now')",
      args: [referenceId],
    });
    if (suspension.rows.length === 0) throw new Error('Suspension not found, already lifted, or expired.');
  }

  // Check no open petition already exists for this
  const existing = await db.execute({
    sql: "SELECT * FROM petitions WHERE petition_type = ? AND reference_id = ? AND status = 'open'",
    args: [petitionType, referenceId],
  });
  if (existing.rows.length > 0) throw new Error('There is already an open petition for this.');

  // Petition closes 24 hours from now
  const closesAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  const result = await db.execute({
    sql: 'INSERT INTO petitions (petition_type, reference_id, created_by, channel_id, closes_at) VALUES (?, ?, ?, ?, ?)',
    args: [petitionType, referenceId, createdBy, channelId, closesAt],
  });

  return getPetition(Number(result.lastInsertRowid));
}

async function getPetition(petitionId) {
  const result = await getDb().execute({ sql: 'SELECT * FROM petitions WHERE id = ?', args: [petitionId] });
  return result.rows[0] || null;
}

async function setPetitionMessageTs(petitionId, messageTs) {
  await getDb().execute({ sql: 'UPDATE petitions SET message_ts = ? WHERE id = ?', args: [messageTs, petitionId] });
}

async function castVote(petitionId, slackId, vote) {
  const db = getDb();
  const petition = await getPetition(petitionId);
  if (!petition || petition.status !== 'open') throw new Error('This petition is no longer open.');

  // Check if voting period has expired
  if (petition.closes_at && new Date(petition.closes_at + 'Z').getTime() <= Date.now()) {
    throw new Error('The voting period for this petition has ended.');
  }

  // Check if user already voted (no vote changes allowed)
  const existing = await db.execute({
    sql: 'SELECT id FROM petition_votes WHERE petition_id = ? AND slack_id = ?',
    args: [petitionId, slackId],
  });
  if (existing.rows.length > 0) {
    throw new Error('You have already voted on this petition. Votes cannot be changed.');
  }

  await db.execute({
    sql: 'INSERT INTO petition_votes (petition_id, slack_id, vote) VALUES (?, ?, ?)',
    args: [petitionId, slackId, vote],
  });
}

async function getVoteCounts(petitionId) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT vote, COUNT(*) as count FROM petition_votes WHERE petition_id = ? GROUP BY vote',
    args: [petitionId],
  });
  const counts = { overturn: 0, uphold: 0 };
  for (const row of result.rows) {
    counts[row.vote] = Number(row.count);
  }
  return counts;
}

async function getTotalUserCount() {
  const result = await getDb().execute({ sql: 'SELECT COUNT(*) as count FROM users', args: [] });
  return Number(result.rows[0].count);
}

async function closePetition(petitionId, status) {
  await getDb().execute({
    sql: 'UPDATE petitions SET status = ? WHERE id = ?',
    args: [status, petitionId],
  });
}

async function getReferencedAction(petition) {
  const db = getDb();
  if (petition.petition_type === 'fine') {
    const result = await db.execute({ sql: 'SELECT * FROM fines WHERE id = ?', args: [petition.reference_id] });
    return result.rows[0] || null;
  } else {
    const result = await db.execute({ sql: 'SELECT * FROM suspensions WHERE id = ?', args: [petition.reference_id] });
    return result.rows[0] || null;
  }
}

async function getExpiredPetitions() {
  const result = await getDb().execute({
    sql: "SELECT * FROM petitions WHERE status = 'open' AND closes_at IS NOT NULL AND closes_at <= datetime('now')",
    args: [],
  });
  return result.rows;
}

module.exports = { createPetition, getPetition, setPetitionMessageTs, castVote, getVoteCounts, getTotalUserCount, closePetition, getReferencedAction, getExpiredPetitions };
