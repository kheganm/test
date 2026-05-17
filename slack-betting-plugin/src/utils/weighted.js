const SENSITIVITY = 500;
const MIN_MULTIPLIER = 0.25;
const MAX_MULTIPLIER = 3.0;

/**
 * Calculate cost multipliers for all options in a weighted market.
 * Multiplier > 1.0 = favorite (costs more), < 1.0 = underdog (costs less), 1.0 = neutral.
 * @param {number} optionCount - Number of options in the market
 * @param {Object} betsPerOption - Map of { optionId: totalBetAmount }
 * @param {number} totalBets - Sum of all nominal bet amounts across all options
 * @returns {Object} Map of { optionId: multiplier }
 */
function calculateCostMultipliers(optionCount, betsPerOption, totalBets) {
  const result = {};
  const weight = Math.min(totalBets / SENSITIVITY, 1.0);
  const uniformProb = 1 / optionCount;

  for (const [optId, betsOnThis] of Object.entries(betsPerOption)) {
    const empiricalProb = totalBets > 0 ? betsOnThis / totalBets : uniformProb;
    const blendedProb = (1 - weight) * uniformProb + weight * empiricalProb;
    const rawMultiplier = blendedProb * optionCount;
    result[optId] = Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, rawMultiplier));
  }

  return result;
}

function formatMultiplier(multiplier) {
  return `${multiplier.toFixed(2)}x`;
}

module.exports = { calculateCostMultipliers, formatMultiplier };
