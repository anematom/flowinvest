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

// Maximaal aantal posities per regio, zodat de portefeuille niet ongemerkt
// volledig in de VS terechtkomt. Zelfde waarde als REGION_CAP in de server.
export const REGION_CAP = 5;

// Rangschikt op momentum over 6 en 12 maanden (server/index.js berekent de
// score) en houdt maximaal REGION_CAP posities per regio aan.
//
// Zonder momentumscores valt dit terug op de dagbeweging. Dat is een zwak
// signaal — het is de ranking die hiervoor gebruikt werd — maar in simulatie
// gaat het om weergave, niet om echt geld. De server weigert in dat geval
// juist te handelen.
export function selectByMomentum(quotes, nPositions, regionCap = REGION_CAP) {
  const hasMomentum = quotes.some(q => q.momentumScore != null);
  const scoreOf = (q) => (hasMomentum ? (q.momentumScore ?? -Infinity) : q.changePercent);

  const ranked = [...quotes].sort((a, b) => scoreOf(b) - scoreOf(a));

  const picks = [];
  const perRegion = {};
  for (const q of ranked) {
    if (picks.length >= nPositions) break;
    // Quotes zonder regio (bijvoorbeeld uit een oudere serverversie) tellen
    // niet mee voor het maximum, anders zou er niets geselecteerd worden.
    if (q.region && (perRegion[q.region] || 0) >= regionCap) continue;
    if (q.region) perRegion[q.region] = (perRegion[q.region] || 0) + 1;
    picks.push(q);
  }
  return picks;
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

  // Aantal posities dynamisch op basis van beschikbaar bedrag (minimaal $50/positie).
  // Bij een kleine portefeuille (bijv. $340) zijn 8 posities te versnipperd.
  const maxPositions = Math.min(8, Math.max(4, Math.floor(amount / 50)));

  // Top N aandelen op basis van momentum (exclusief BND)
  const top8 = selectByMomentum(
    stockQuotes.filter(q => q.price && q.changePercent != null && q.symbol !== 'BND'),
    maxPositions
  );

  if (top8.length === 0) return [];

  // Verdeel aandelengeld: meer naar de sterkste performers
  const weights = [0.20, 0.16, 0.14, 0.12, 0.10, 0.10, 0.10, 0.08];
  const usedWeights = weights.slice(0, top8.length);
  const weightSum = usedWeights.reduce((a, b) => a + b, 0);
  const normalizedWeights = usedWeights.map(w => w / weightSum);

  const portfolio = top8.map((stock, i) => {
    const stockWeight = normalizedWeights[i] || 0.10;
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
    const bndShares = bndAmount / bndPrice;
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
