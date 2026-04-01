// Automatische portfolio allocatie op basis van risicoprofiel
// Verdeelt het startbedrag over ETF's of losse aandelen

const allocations = {
  low: [
    { symbol: 'BND', name: 'Obligaties', weight: 0.50 },
    { symbol: 'VGK', name: 'Europese aandelen', weight: 0.20 },
    { symbol: 'SPY', name: 'S&P 500', weight: 0.15 },
    { symbol: 'VXUS', name: 'Internationaal', weight: 0.15 },
  ],
  medium: [
    { symbol: 'SPY', name: 'S&P 500', weight: 0.35 },
    { symbol: 'VGK', name: 'Europese aandelen', weight: 0.20 },
    { symbol: 'VXUS', name: 'Internationaal', weight: 0.20 },
    { symbol: 'BND', name: 'Obligaties', weight: 0.15 },
    { symbol: 'VTI', name: 'US Total Market', weight: 0.10 },
  ],
  high: [
    { symbol: 'SPY', name: 'S&P 500', weight: 0.40 },
    { symbol: 'VTI', name: 'US Total Market', weight: 0.25 },
    { symbol: 'VXUS', name: 'Internationaal', weight: 0.20 },
    { symbol: 'VGK', name: 'Europese aandelen', weight: 0.15 },
  ],
  // Ultra modus wordt dynamisch gebouwd op basis van momentum
};

// Bereken hoeveel "shares" je koopt met je startbedrag
export function buildPortfolio(amount, riskLevel, quotes) {
  const alloc = allocations[riskLevel] || allocations.medium;

  return alloc.map(item => {
    const quote = quotes.find(q => q.symbol === item.symbol);
    if (!quote || !quote.price) {
      return { ...item, shares: 0, invested: 0, currentValue: 0, gain: 0, gainPercent: 0 };
    }

    const invested = amount * item.weight;
    const shares = invested / quote.price;
    const currentValue = shares * quote.price;
    const gain = currentValue - invested;
    const gainPercent = invested > 0 ? ((gain / invested) * 100) : 0;

    return {
      ...item,
      shares,
      invested,
      currentValue,
      gain,
      gainPercent,
      price: quote.price,
      changePercent: quote.changePercent,
    };
  });
}

// Bouw een ultra-agressief portfolio op basis van momentum
// Selecteert de top 5 best presterende aandelen en verdeelt het geld
// Bij daling wordt een deel naar obligaties (BND) verschoven
export function buildUltraPortfolio(amount, stockQuotes, defensiveShift) {
  if (!stockQuotes || stockQuotes.length === 0) return [];

  // Bepaal hoeveel naar aandelen vs obligaties gaat
  const stockFraction = defensiveShift?.stocks ?? 1.0;
  const bndFraction = defensiveShift?.BND ?? 0.0;
  const stockAmount = amount * stockFraction;
  const bndAmount = amount * bndFraction;

  // Top 5 aandelen op basis van dagelijks momentum (exclusief BND)
  const top5 = stockQuotes
    .filter(q => q.price && q.changePercent != null && q.symbol !== 'BND')
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 5);

  if (top5.length === 0) return [];

  // Verdeel aandelengeld: meer naar de sterkste performers
  // #1 krijgt 30%, #2 25%, #3 20%, #4 15%, #5 10%
  const weights = [0.30, 0.25, 0.20, 0.15, 0.10];

  const portfolio = top5.map((stock, i) => {
    const stockWeight = weights[i] || 0.10;
    const invested = stockAmount * stockWeight;
    const shares = invested / stock.price;
    const currentValue = shares * stock.price;
    const gain = currentValue - invested;
    const gainPercent = invested > 0 ? ((gain / invested) * 100) : 0;

    return {
      symbol: stock.symbol,
      name: stock.name,
      description: stock.description,
      weight: stockWeight * stockFraction,
      rank: i + 1,
      shares,
      invested,
      currentValue,
      gain,
      gainPercent,
      price: stock.price,
      changePercent: stock.changePercent,
      high: stock.high,
      low: stock.low,
    };
  });

  // Voeg obligaties toe als er een defensieve verschuiving is
  if (bndAmount > 0) {
    // BND (obligatie ETF) als veilige haven
    const bndQuote = stockQuotes.find(q => q.symbol === 'BND');
    const bndPrice = bndQuote?.price || 72; // fallback prijs
    const bndPrevClose = bndQuote?.previousClose || bndPrice;
    const bndShares = bndAmount / bndPrevClose;
    const bndValue = bndShares * bndPrice;
    const bndGain = bndValue - bndAmount;

    portfolio.push({
      symbol: 'BND',
      name: 'Obligaties (bescherming)',
      description: `Veilige haven — ${Math.round(bndFraction * 100)}% van je geld`,
      weight: bndFraction,
      rank: 6,
      shares: bndShares,
      invested: bndAmount,
      currentValue: bndValue,
      gain: bndGain,
      gainPercent: bndAmount > 0 ? ((bndGain / bndAmount) * 100) : 0,
      price: bndPrice,
      changePercent: bndQuote?.changePercent || 0,
      isDefensive: true,
    });
  }

  return portfolio;
}

// Bereken totale portfolio waarde
export function getPortfolioTotals(portfolio, startAmount) {
  const totalValue = portfolio.reduce((sum, p) => sum + p.currentValue, 0);
  const totalGain = totalValue - startAmount;
  const totalGainPercent = startAmount > 0 ? ((totalGain / startAmount) * 100) : 0;

  return {
    totalValue,
    totalGain,
    totalGainPercent,
    isPositive: totalGain >= 0,
  };
}

export function getAllocationForRisk(riskLevel) {
  return allocations[riskLevel] || allocations.medium;
}

export function isUltraMode(riskLevel) {
  return riskLevel === 'ultra';
}
