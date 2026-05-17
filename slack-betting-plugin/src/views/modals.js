function buildCreateMarketModal(channelId) {
  return {
    type: 'modal',
    callback_id: 'create_market_submit',
    private_metadata: JSON.stringify({ channelId }),
    title: { type: 'plain_text', text: 'Create Betting Market' },
    submit: { type: 'plain_text', text: 'Create' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'market_type_block',
        label: { type: 'plain_text', text: 'Market Type' },
        element: {
          type: 'static_select',
          action_id: 'market_type_input',
          initial_option: {
            text: { type: 'plain_text', text: 'Pool (Parimutuel)' },
            value: 'parimutuel',
          },
          options: [
            {
              text: { type: 'plain_text', text: 'Pool (Parimutuel)' },
              value: 'parimutuel',
            },
            {
              text: { type: 'plain_text', text: 'Weighted' },
              value: 'weighted',
            },
          ],
        },
      },
      {
        type: 'input',
        block_id: 'title_block',
        label: { type: 'plain_text', text: 'Market Title' },
        element: {
          type: 'plain_text_input',
          action_id: 'title_input',
          placeholder: { type: 'plain_text', text: 'e.g., Who wins the Super Bowl?' },
        },
      },
      {
        type: 'input',
        block_id: 'description_block',
        label: { type: 'plain_text', text: 'Description (optional)' },
        optional: true,
        element: {
          type: 'plain_text_input',
          action_id: 'description_input',
          multiline: true,
          placeholder: { type: 'plain_text', text: 'Additional details about this market...' },
        },
      },
      {
        type: 'input',
        block_id: 'options_block',
        label: { type: 'plain_text', text: 'Options (one per line, minimum 2)' },
        element: {
          type: 'plain_text_input',
          action_id: 'options_input',
          multiline: true,
          placeholder: { type: 'plain_text', text: 'Team A\nTeam B\nDraw' },
        },
      },
      {
        type: 'input',
        block_id: 'close_date_block',
        label: { type: 'plain_text', text: 'Betting closes on (date)' },
        element: {
          type: 'datepicker',
          action_id: 'close_date_input',
          placeholder: { type: 'plain_text', text: 'Pick a date' },
        },
      },
      {
        type: 'input',
        block_id: 'close_time_block',
        label: { type: 'plain_text', text: 'Betting closes at (time)' },
        element: {
          type: 'timepicker',
          action_id: 'close_time_input',
          placeholder: { type: 'plain_text', text: 'Pick a time' },
        },
      },
    ],
  };
}

function buildPlaceBetModal(marketId, optionId, optionLabel, balance, marketType = 'parimutuel', costMultiplier = null) {
  let infoText = `You're betting on: *${optionLabel}*\n\nYour balance: *${balance} coins*`;

  if (marketType === 'weighted' && costMultiplier !== null) {
    const exampleCost = Math.ceil(100 * costMultiplier);
    infoText += `\n\n\u2696\uFE0F *Cost multiplier:* ${costMultiplier.toFixed(2)}x\nA 100 coin bet will cost *${exampleCost} coins* from your wallet.\n_Multiplier is based on current market balance._`;
  }

  return {
    type: 'modal',
    callback_id: 'place_bet_submit',
    private_metadata: JSON.stringify({ marketId, optionId, marketType }),
    title: { type: 'plain_text', text: 'Place Your Bet' },
    submit: { type: 'plain_text', text: 'Place Bet' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: infoText,
        },
      },
      {
        type: 'input',
        block_id: 'amount_block',
        label: { type: 'plain_text', text: 'Bet Amount (coins)' },
        element: {
          type: 'plain_text_input',
          action_id: 'amount_input',
          placeholder: { type: 'plain_text', text: 'e.g., 100' },
        },
      },
    ],
  };
}

module.exports = { buildCreateMarketModal, buildPlaceBetModal };
