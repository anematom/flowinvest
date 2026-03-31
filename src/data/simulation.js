// Generate simulated portfolio data based on user settings
export function generatePortfolioData(startAmount, riskLevel, months = 24) {
  const data = [];
  let value = startAmount;

  // Risk affects volatility and average return
  const riskParams = {
    low: { avgMonthlyReturn: 0.004, volatility: 0.015 },
    medium: { avgMonthlyReturn: 0.007, volatility: 0.035 },
    high: { avgMonthlyReturn: 0.01, volatility: 0.06 },
  };

  const params = riskParams[riskLevel] || riskParams.medium;

  const now = new Date();
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - months);

  // Seed for deterministic but realistic-looking data
  let seed = startAmount * 137 + (riskLevel === 'low' ? 1 : riskLevel === 'medium' ? 2 : 3);

  for (let i = 0; i <= months; i++) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + i);

    // Simple pseudo-random
    seed = (seed * 16807 + 7) % 2147483647;
    const random = (seed / 2147483647) - 0.5;

    const monthlyReturn = params.avgMonthlyReturn + random * params.volatility;
    if (i > 0) {
      value = value * (1 + monthlyReturn);
    }

    data.push({
      date: date.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }),
      value: Math.round(value * 100) / 100,
      month: i,
    });
  }

  return data;
}

export function getPortfolioSummary(data, startAmount) {
  const currentValue = data[data.length - 1].value;
  const gainLoss = currentValue - startAmount;
  const gainLossPercent = ((gainLoss / startAmount) * 100).toFixed(1);
  const isPositive = gainLoss >= 0;

  return {
    currentValue,
    gainLoss,
    gainLossPercent,
    isPositive,
    status: isPositive ? 'Je ligt op koers' : 'Markten herstellen zich meestal',
  };
}
