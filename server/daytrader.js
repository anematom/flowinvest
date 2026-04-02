// FlowInvest Real-Time Day Trading Engine
// Checkt elke minuut de markt en maakt trades

// === INDICATOREN ===
function calcSMA(prices, period) {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) avgGain += d; else avgLoss += Math.abs(d);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcMACD(prices) {
  if (prices.length < 26) return null;
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  const prev12 = calcEMA(prices.slice(0, -1), 12);
  const prev26 = calcEMA(prices.slice(0, -1), 26);
  if (!ema12 || !ema26 || !prev12 || !prev26) return null;
  return { macd: ema12 - ema26, prev: prev12 - prev26 };
}

function calcBollinger(prices, period = 20, mult = 2) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, p) => s + (p - sma) ** 2, 0) / period);
  return { upper: sma + mult * std, middle: sma, lower: sma - mult * std };
}

// === GECOMBINEERDE STRATEGIE ===
function analyzeSignals(prices) {
  const price = prices[prices.length - 1];
  const rsi = calcRSI(prices, 14);
  const smaFast = calcSMA(prices, 5);
  const smaSlow = calcSMA(prices, 20);
  const macd = calcMACD(prices);
  const bb = calcBollinger(prices, 20, 2);

  if (!rsi || !smaFast || !smaSlow || !macd || !bb) return { signal: 'wait', score: 0, reasons: ['Te weinig data'] };

  let score = 0;
  const reasons = [];

  // RSI
  if (rsi < 25) { score += 3; reasons.push(`RSI ${rsi.toFixed(0)} — sterk oversold`); }
  else if (rsi < 35) { score += 1.5; reasons.push(`RSI ${rsi.toFixed(0)} — oversold`); }
  else if (rsi > 75) { score -= 3; reasons.push(`RSI ${rsi.toFixed(0)} — sterk overbought`); }
  else if (rsi > 65) { score -= 1.5; reasons.push(`RSI ${rsi.toFixed(0)} — overbought`); }

  // Moving Average crossover
  if (smaFast > smaSlow * 1.002) { score += 1; reasons.push('SMA5 > SMA20 (bullish)'); }
  else if (smaFast < smaSlow * 0.998) { score -= 1; reasons.push('SMA5 < SMA20 (bearish)'); }

  // MACD
  if (macd.macd > 0 && macd.prev <= 0) { score += 2; reasons.push('MACD cross omhoog'); }
  else if (macd.macd < 0 && macd.prev >= 0) { score -= 2; reasons.push('MACD cross omlaag'); }
  else if (macd.macd > macd.prev) { score += 0.5; reasons.push('MACD stijgend'); }
  else if (macd.macd < macd.prev) { score -= 0.5; reasons.push('MACD dalend'); }

  // Bollinger Bands
  if (price <= bb.lower) { score += 2; reasons.push('Prijs op Bollinger ondergrens'); }
  else if (price >= bb.upper) { score -= 2; reasons.push('Prijs op Bollinger bovengrens'); }

  // Momentum (laatste 3 prijzen)
  if (prices.length >= 3) {
    const mom = (price - prices[prices.length - 3]) / prices[prices.length - 3] * 100;
    if (mom > 0.5) { score += 0.5; reasons.push(`Momentum +${mom.toFixed(2)}%`); }
    else if (mom < -0.5) { score -= 0.5; reasons.push(`Momentum ${mom.toFixed(2)}%`); }
  }

  // === PATROONHERKENNING ===
  if (prices.length >= 30) {
    const r20 = prices.slice(-20);

    // Double Bottom: twee vergelijkbare lows
    const firstHalf = r20.slice(0, 10);
    const secondHalf = r20.slice(10);
    const low1 = Math.min(...firstHalf);
    const low2 = Math.min(...secondHalf);
    const midHigh = Math.max(...r20.slice(firstHalf.indexOf(low1), 10 + secondHalf.indexOf(low2)));
    if (Math.abs(low1 - low2) / low1 < 0.015 && price > midHigh) {
      score += 2; reasons.push('Double Bottom patroon');
    }

    // Head & Shoulders: drie pieken, middelste het hoogst
    if (prices.length >= 40) {
      const p1 = Math.max(...prices.slice(-40, -28));
      const p2 = Math.max(...prices.slice(-28, -14));
      const p3 = Math.max(...prices.slice(-14));
      if (p2 > p1 * 1.01 && p2 > p3 * 1.01 && Math.abs(p1 - p3) / p1 < 0.02 && price < p3 * 0.98) {
        score -= 2; reasons.push('Head & Shoulders patroon');
      }
    }

    // Breakout: prijs breekt door 20-daags high
    const high20 = Math.max(...prices.slice(-21, -1));
    if (price > high20 * 1.005) {
      score += 1.5; reasons.push('Breakout boven weerstand');
    }

    // Falling Wedge / Squeeze: range wordt smaller en breekt uit
    if (prices.length >= 20) {
      const rangeOld = Math.max(...prices.slice(-20, -10)) - Math.min(...prices.slice(-20, -10));
      const rangeNew = Math.max(...prices.slice(-10)) - Math.min(...prices.slice(-10));
      if (rangeNew < rangeOld * 0.6 && price > calcSMA(prices, 10)) {
        score += 1; reasons.push('Squeeze breakout');
      }
    }

    // Support bounce: prijs raakt 20-daags low en stijgt
    const low20 = Math.min(...prices.slice(-21, -1));
    const prevPrice = prices[prices.length - 2];
    if (prevPrice <= low20 * 1.005 && price > prevPrice) {
      score += 1.5; reasons.push('Bounce van support');
    }
  }

  let signal = 'hold';
  if (score >= 4) signal = 'strong_buy';
  else if (score >= 2) signal = 'buy';
  else if (score <= -4) signal = 'strong_sell';
  else if (score <= -2) signal = 'sell';

  return { signal, score, reasons, rsi, smaFast, smaSlow, macd: macd.macd, bb };
}

// === DAY TRADING ENGINE ===
export class DayTradingEngine {
  constructor(config = {}) {
    this.capital = config.startCapital || 10000;
    this.startCapital = this.capital;
    this.maxRiskPerTrade = config.riskPercent || 2;
    this.stopLossPercent = config.stopLoss || 1.5;
    this.takeProfitPercent = config.takeProfit || 3;
    this.maxPositions = config.maxPositions || 3;

    this.positions = {};   // { symbol: { shares, entryPrice, entryTime } }
    this.priceHistory = {}; // { symbol: [prices] }
    this.trades = [];       // Alle trades
    this.equityCurve = [];
    this.totalWins = 0;
    this.totalLosses = 0;
    this.dayPnL = 0;
  }

  // Voeg een nieuwe prijs toe en analyseer
  tick(symbol, price, timestamp) {
    if (!this.priceHistory[symbol]) this.priceHistory[symbol] = [];
    this.priceHistory[symbol].push(price);

    // Bewaar max 200 prijzen per symbool
    if (this.priceHistory[symbol].length > 200) {
      this.priceHistory[symbol] = this.priceHistory[symbol].slice(-200);
    }

    const prices = this.priceHistory[symbol];
    if (prices.length < 30) return { action: 'wait', reason: 'Verzamelen van data...' };

    const analysis = analyzeSignals(prices);
    let action = { action: 'hold', analysis };

    // Check bestaande positie
    if (this.positions[symbol]) {
      const pos = this.positions[symbol];
      const plPercent = ((price - pos.entryPrice) / pos.entryPrice) * 100;

      if (plPercent <= -this.stopLossPercent) {
        action = this.closePosition(symbol, price, timestamp, 'stop-loss');
      } else if (plPercent >= this.takeProfitPercent) {
        action = this.closePosition(symbol, price, timestamp, 'take-profit');
      } else if (analysis.signal === 'sell' || analysis.signal === 'strong_sell') {
        action = this.closePosition(symbol, price, timestamp, 'signaal');
      } else {
        action = { action: 'hold', plPercent: +plPercent.toFixed(2), analysis };
      }
    } else {
      // Geen positie — check of we moeten kopen
      if ((analysis.signal === 'buy' || analysis.signal === 'strong_buy') &&
          Object.keys(this.positions).length < this.maxPositions) {
        action = this.openPosition(symbol, price, timestamp, analysis);
      }
    }

    // Track equity
    this.equityCurve.push({
      time: timestamp,
      equity: this.getEquity(),
    });

    return action;
  }

  openPosition(symbol, price, timestamp, analysis) {
    const riskAmount = this.capital * (this.maxRiskPerTrade / 100);
    const slAmount = price * (this.stopLossPercent / 100);
    let shares = Math.floor(riskAmount / slAmount);
    if (shares * price > this.capital * 0.3) shares = Math.floor((this.capital * 0.3) / price);
    if (shares <= 0 || shares * price > this.capital) return { action: 'skip', reason: 'Niet genoeg kapitaal' };

    this.capital -= shares * price;
    this.positions[symbol] = { shares, entryPrice: price, entryTime: timestamp };

    const trade = {
      type: 'KOOP', symbol, shares, price,
      time: timestamp, reason: analysis.reasons.slice(0, 3).join(', '),
      score: analysis.score,
    };
    this.trades.push(trade);

    return { action: 'buy', trade, analysis };
  }

  closePosition(symbol, price, timestamp, reason) {
    const pos = this.positions[symbol];
    if (!pos) return { action: 'error', reason: 'Geen positie' };

    const pnl = pos.shares * (price - pos.entryPrice);
    const plPercent = ((price - pos.entryPrice) / pos.entryPrice) * 100;
    this.capital += pos.shares * price;
    this.dayPnL += pnl;

    if (pnl >= 0) this.totalWins++; else this.totalLosses++;

    const trade = {
      type: 'VERKOOP', symbol, shares: pos.shares, price,
      entryPrice: pos.entryPrice, pnl: +pnl.toFixed(2), plPercent: +plPercent.toFixed(2),
      time: timestamp, reason,
    };
    this.trades.push(trade);
    delete this.positions[symbol];

    return { action: 'sell', trade };
  }

  getEquity() {
    let equity = this.capital;
    for (const [sym, pos] of Object.entries(this.positions)) {
      const prices = this.priceHistory[sym];
      if (prices && prices.length > 0) {
        equity += pos.shares * prices[prices.length - 1];
      }
    }
    return +equity.toFixed(2);
  }

  getStatus() {
    const equity = this.getEquity();
    const totalReturn = ((equity - this.startCapital) / this.startCapital * 100);
    const totalTrades = this.trades.filter(t => t.type === 'VERKOOP').length;
    const winRate = totalTrades > 0 ? (this.totalWins / totalTrades * 100) : 0;

    const openPositions = Object.entries(this.positions).map(([sym, pos]) => {
      const prices = this.priceHistory[sym];
      const currentPrice = prices ? prices[prices.length - 1] : pos.entryPrice;
      const pl = ((currentPrice - pos.entryPrice) / pos.entryPrice * 100);
      return { symbol: sym, shares: pos.shares, entryPrice: pos.entryPrice, currentPrice, plPercent: +pl.toFixed(2) };
    });

    return {
      equity,
      startCapital: this.startCapital,
      totalReturn: +totalReturn.toFixed(2),
      dayPnL: +this.dayPnL.toFixed(2),
      totalTrades,
      wins: this.totalWins,
      losses: this.totalLosses,
      winRate: +winRate.toFixed(1),
      openPositions,
      recentTrades: this.trades.slice(-20).reverse(),
      equityCurve: this.equityCurve.slice(-100),
      dataPoints: Object.fromEntries(
        Object.entries(this.priceHistory).map(([s, p]) => [s, p.length])
      ),
    };
  }
}
