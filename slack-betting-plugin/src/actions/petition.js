const { getPetition, castVote, getVoteCounts, getTotalUserCount, closePetition, getReferencedAction, setPetitionMessageTs } = require('../models/petition');
const { addBalance, liftSuspension } = require('../models/user');
const { addToCftcPool, getCftcBalance } = require('../models/cftc');
const { getDb } = require('../db');

function registerPetitionActions(app) {
  app.action(/^petition_vote_(overturn|uphold)_\d+$/, async ({ action, ack, client, body }) => {
    await ack();

    const match = action.action_id.match(/^petition_vote_(overturn|uphold)_(\d+)$/);
    const vote = match[1];
    const petitionId = parseInt(match[2], 10);

    const petition = await getPetition(petitionId);
    if (!petition || petition.status !== 'open') {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: 'This petition is no longer open for voting.',
      });
      return;
    }

    try {
      await castVote(petitionId, body.user.id, vote);
    } catch (err) {
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: `Could not cast vote: ${err.message}`,
      });
      return;
    }

    const counts = await getVoteCounts(petitionId);
    const totalUsers = await getTotalUserCount();
    const majority = Math.floor(totalUsers / 2) + 1;
    const action_ref = await getReferencedAction(petition);

    let description;
    if (petition.petition_type === 'fine') {
      description = `\uD83D\uDCB8 *Fine #${petition.reference_id}* — <@${action_ref.slack_id}> was fined *${action_ref.amount} coins*\n\uD83D\uDCCB *Reason:* ${action_ref.reason}`;
    } else {
      description = `\uD83D\uDEA8 *Suspension #${petition.reference_id}* — <@${action_ref.slack_id}> was suspended\n\uD83D\uDCCB *Reason:* ${action_ref.reason}`;
    }

    // Check if petition passes or fails
    const overturned = counts.overturn >= majority;
    const upheld = counts.uphold >= majority;

    if (overturned) {
      await closePetition(petitionId, 'passed');
      await overturnAction(petition, action_ref);

      // Update message to show result
      await client.chat.update({
        channel: petition.channel_id,
        ts: petition.message_ts,
        blocks: buildClosedPetitionBlocks(description, petition, counts, totalUsers, 'OVERTURNED'),
        text: `Petition #${petitionId} passed — action overturned`,
      });

      let resultText;
      if (petition.petition_type === 'fine') {
        resultText = `\uD83D\uDCDC *Petition #${petitionId} PASSED* — Fine #${petition.reference_id} has been *overturned*!\n<@${action_ref.slack_id}> has been refunded *${action_ref.amount} coins*.`;
      } else {
        resultText = `\uD83D\uDCDC *Petition #${petitionId} PASSED* — Suspension #${petition.reference_id} has been *overturned*!\n<@${action_ref.slack_id}>'s suspension has been lifted.`;
      }

      await client.chat.postMessage({
        channel: petition.channel_id,
        text: resultText,
      });
    } else if (upheld) {
      await closePetition(petitionId, 'failed');

      await client.chat.update({
        channel: petition.channel_id,
        ts: petition.message_ts,
        blocks: buildClosedPetitionBlocks(description, petition, counts, totalUsers, 'UPHELD'),
        text: `Petition #${petitionId} failed — action upheld`,
      });

      await client.chat.postMessage({
        channel: petition.channel_id,
        text: `\uD83D\uDCDC *Petition #${petitionId} FAILED* — The ${petition.petition_type} has been *upheld* by majority vote.`,
      });
    } else {
      // Still open — update the vote counts on the message
      await client.chat.update({
        channel: petition.channel_id,
        ts: petition.message_ts,
        blocks: buildOpenPetitionBlocks(description, petition, counts, totalUsers, majority),
        text: `Petition #${petitionId} — voting in progress`,
      });

      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: `Your vote to *${vote}* has been recorded.`,
      });
    }
  });
}

async function overturnAction(petition, action_ref) {
  const db = getDb();
  if (petition.petition_type === 'fine') {
    // Refund user from CFTC pool
    const cftcBalance = await getCftcBalance();
    const refundAmount = Math.min(Number(action_ref.amount), cftcBalance);
    if (refundAmount > 0) {
      await db.execute({ sql: 'UPDATE cftc_pool SET balance = balance - ? WHERE id = 1', args: [refundAmount] });
      await addBalance(action_ref.slack_id, refundAmount);
    }
    await db.execute({ sql: "UPDATE fines SET status = 'overturned' WHERE id = ?", args: [action_ref.id] });
  } else {
    // Lift suspension
    await liftSuspension(action_ref.id);
  }
}

function buildOpenPetitionBlocks(description, petition, counts, totalUsers, majority) {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '\uD83D\uDCDC Petition to Overturn CFTC Action', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: description },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Filed by <@${petition.created_by}>\n\n*Vote to overturn or uphold this action.* Need *${majority}* votes (majority of ${totalUsers} users) for a decision.\n\n\u2705 *Overturn:* ${counts.overturn}  |  \u274C *Uphold:* ${counts.uphold}`,
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '\u2705 Vote to Overturn', emoji: true },
          action_id: `petition_vote_overturn_${petition.id}`,
          value: String(petition.id),
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '\u274C Vote to Uphold', emoji: true },
          action_id: `petition_vote_uphold_${petition.id}`,
          value: String(petition.id),
          style: 'danger',
        },
      ],
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Petition #${petition.id} \u2014 ${petition.petition_type} #${petition.reference_id}` },
      ],
    },
  ];
}

function buildClosedPetitionBlocks(description, petition, counts, totalUsers, outcome) {
  const emoji = outcome === 'OVERTURNED' ? '\u2705' : '\u274C';
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `\uD83D\uDCDC Petition — ${outcome}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: description },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *Result: ${outcome}*\n\n\u2705 *Overturn:* ${counts.overturn}  |  \u274C *Uphold:* ${counts.uphold}  |  Total users: ${totalUsers}`,
      },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Petition #${petition.id} \u2014 ${petition.petition_type} #${petition.reference_id} \u2014 Filed by <@${petition.created_by}>` },
      ],
    },
  ];
}

module.exports = { registerPetitionActions };
