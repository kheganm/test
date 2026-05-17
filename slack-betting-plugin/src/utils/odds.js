function calculateOdds(optionPool, totalPool) {
  if (optionPool === 0 || totalPool === 0) return null;
  return totalPool / optionPool;
}

function formatOdds(odds) {
  if (odds === null) return 'N/A';
  return `${odds.toFixed(2)}x`;
}

function calculatePotentialPayout(betAmount, optionPool, totalPool) {
  const newOptionPool = optionPool + betAmount;
  const newTotalPool = totalPool + betAmount;
  return Math.floor((betAmount / newOptionPool) * newTotalPool);
}

module.exports = { calculateOdds, formatOdds, calculatePotentialPayout };
