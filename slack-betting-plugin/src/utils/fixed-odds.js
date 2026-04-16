// Sensitivity constant: controls how quickly odds shift from initial to market-driven.
// After this many coins of total bets, odds are fully determined by bet distribution.
const SENSITIVITY = 10000;

/**
 * Calculate current fixed odds for all options in a market.
 * @param {Array} options - Options array, each with { id, initial_odds }
 * @param {Object} betsPerOption - Map of { optionId: totalBetAmount }
 * @param {number} totalBets - Sum of all bet amounts across all options
 * @returns {Object} Map of { optionId: currentOdds }
 */
function calculateFixedOdds(options, betsPerOption, totalBets) {
  const result = {};

  // Calculate initial implied probabilities
  const initialProbs = {};
  for (const opt of options) {
    initialProbs[opt.id] = 1 / (Number(opt.initial_odds) || 2);
  }

  // Calculate original overround (sum of implied probs)
  const originalOverround = Object.values(initialProbs).reduce((a, b) => a + b, 0);
  const effectiveOverround = Math.max(originalOverround, 1.0);

  // Blend weight based on total money bet
  const weight = Math.min(totalBets / SENSITIVITY, 1.0);

  for (const opt of options) {
    const optId = opt.id;
    const betsOnThis = betsPerOption[optId] || 0;
    const empiricalProb = totalBets > 0 ? betsOnThis / totalBets : 0;
    const blendedProb = (1 - weight) * initialProbs[optId] + weight * empiricalProb;
    result[optId] = blendedProb;
  }

  // Normalize
  const sumBlended = Object.values(result).reduce((a, b) => a + b, 0);
  if (sumBlended === 0) {
    // Fallback: return initial odds
    for (const opt of options) {
      result[opt.id] = Number(opt.initial_odds) || 2;
    }
    return result;
  }

  for (const optId of Object.keys(result)) {
    const normalizedProb = result[optId] / sumBlended;
    const adjustedProb = normalizedProb * effectiveOverround;
    // Convert back to odds, clamp minimum to 1.01
    result[optId] = Math.max(1 / adjustedProb, 1.01);
  }

  return result;
}

function formatFixedOdds(odds) {
  return `${odds.toFixed(2)}x`;
}

module.exports = { calculateFixedOdds, formatFixedOdds, SENSITIVITY };
