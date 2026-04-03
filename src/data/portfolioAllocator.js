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

  // Top 8 aandelen op basis van momentum (exclusief BND)
  const top8 = stockQuotes
    .filter(q => q.price && q.changePercent != null && q.symbol !== 'BND')
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 8);

  if (top8.length === 0) return [];

  // Verdeel aandelengeld: meer naar de sterkste performers
  // #1-3 krijgen meer, #4-8 minder (geoptimaliseerd via backtest)
  const weights = [0.20, 0.16, 0.14, 0.12, 0.10, 0.10, 0.10, 0.08];

  const portfolio = top8.map((stock, i) => {
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
  // Bereken winst per holding en tel op
  const totalGainFromHoldings = portfolio.reduce((sum, p) => sum + (p.gain || 0), 0);
  const totalValue = startAmount + totalGainFromHoldings;
  const totalGain = totalGainFromHoldings;
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

export function isCryptoMode(riskLevel) {
  return riskLevel === 'crypto';
}

// Bouw crypto portfolio — top 5 crypto's op basis van prijs
export function buildCryptoPortfolio(amount, cryptoQuotes) {
  if (!cryptoQuotes || cryptoQuotes.length === 0) return [];

  const valid = cryptoQuotes
    .filter(q => q.price && q.price > 0)
    .slice(0, 5);

  if (valid.length === 0) return [];

  const weights = [0.35, 0.25, 0.20, 0.12, 0.08];

  return valid.map((coin, i) => {
    const weight = weights[i] || 0.08;
    const invested = amount * weight;
    const shares = invested / coin.price;
    const currentValue = shares * coin.price;

    return {
      symbol: coin.symbol,
      name: coin.name,
      description: coin.description,
      weight,
      rank: i + 1,
      shares,
      invested,
      currentValue,
      gain: 0,
      gainPercent: 0,
      price: coin.price,
      changePercent: coin.changePercent || 0,
      isCrypto: true,
    };
  });
}
