// Technische indicatoren voor slimmere trading

// RSI (Relative Strength Index) — meet of een aandeel overbought of oversold is
// RSI > 70 = overbought (mogelijk tijd om te verkopen)
// RSI < 30 = oversold (mogelijk koopmoment)
export function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Simple Moving Average (SMA)
export function calculateSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Moving Average signaal: prijs boven SMA50 = bullish, eronder = bearish
// Golden cross: SMA20 kruist boven SMA50 = sterk koopsignaal
// Death cross: SMA20 kruist onder SMA50 = sterk verkoopsignaal
export function getMASignal(closes) {
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);

  if (!sma20 || !sma50) return { signal: 'neutral', sma20, sma50 };

  const currentPrice = closes[closes.length - 1];
  const priceAboveSMA50 = currentPrice > sma50;
  const sma20AboveSMA50 = sma20 > sma50;

  if (sma20AboveSMA50 && priceAboveSMA50) {
    return { signal: 'strong_buy', sma20, sma50, reason: 'Prijs en trend boven gemiddelde' };
  }
  if (!sma20AboveSMA50 && !priceAboveSMA50) {
    return { signal: 'strong_sell', sma20, sma50, reason: 'Prijs en trend onder gemiddelde' };
  }
  if (priceAboveSMA50) {
    return { signal: 'buy', sma20, sma50, reason: 'Prijs boven gemiddelde' };
  }
  return { signal: 'sell', sma20, sma50, reason: 'Prijs onder gemiddelde' };
}

// Analyseer een aandeel op basis van alle indicatoren
export function analyzeStock(closes, currentPrice) {
  const rsi = calculateRSI(closes);
  const maSignal = getMASignal(closes);

  let score = 0; // -2 tot +2
  let signals = [];

  // RSI signaal — geoptimaliseerd: 20/80 (minder handelen = beter)
  if (rsi !== null) {
    if (rsi < 20) {
      score += 1;
      signals.push({ type: 'positive', text: `RSI ${rsi.toFixed(0)} — sterk oversold, koopkans` });
    } else if (rsi > 80) {
      score -= 1;
      signals.push({ type: 'warning', text: `RSI ${rsi.toFixed(0)} — sterk overbought, overweeg verkoop` });
    } else {
      signals.push({ type: 'neutral', text: `RSI ${rsi.toFixed(0)} — neutraal` });
    }
  }

  // Moving Average signaal
  if (maSignal.signal === 'strong_buy') {
    score += 1;
    signals.push({ type: 'positive', text: `Trend: sterk opwaarts` });
  } else if (maSignal.signal === 'buy') {
    score += 0.5;
    signals.push({ type: 'positive', text: `Trend: opwaarts` });
  } else if (maSignal.signal === 'strong_sell') {
    score -= 1;
    signals.push({ type: 'warning', text: `Trend: sterk neerwaarts` });
  } else if (maSignal.signal === 'sell') {
    score -= 0.5;
    signals.push({ type: 'warning', text: `Trend: neerwaarts` });
  }

  // Eindoordeel
  let action = 'hold';
  if (score >= 1.5) action = 'strong_buy';
  else if (score >= 0.5) action = 'buy';
  else if (score <= -1.5) action = 'strong_sell';
  else if (score <= -0.5) action = 'sell';

  return { rsi, maSignal, score, signals, action };
}

// Trailing stop-loss: beschermt winst door mee te schuiven met de hoogste waarde
// highPrice = hoogste prijs sinds aankoop, trailingPercent = hoeveel % het mag dalen vanaf de top
export function checkTrailingStop(holding, trailingPercent = 10) {
  if (!holding.highPrice || !holding.price) return false;
  const dropFromHigh = ((holding.price - holding.highPrice) / holding.highPrice) * 100;
  return dropFromHigh <= -trailingPercent;
}

// Vaste stop-loss op aankoopprijs
export function checkStopLossHolding(holding, stopLossPercent = -15) {
  return holding.gainPercent <= stopLossPercent;
}

// Genereer trading acties op basis van indicatoren
export function generateTradeActions(holdings, stockAnalyses) {
  const actions = [];

  for (const holding of holdings) {
    const analysis = stockAnalyses[holding.symbol];
    if (!analysis) continue;

    // Trailing stop-loss: als prijs 10% daalt vanaf de hoogste waarde
    if (holding.highPrice && checkTrailingStop(holding, 10)) {
      const dropFromHigh = ((holding.price - holding.highPrice) / holding.highPrice * 100).toFixed(1);
      actions.push({
        symbol: holding.symbol,
        action: 'TRAILING_STOP',
        reason: `${dropFromHigh}% gedaald vanaf top ($${holding.highPrice?.toFixed(2)}) — winst beschermd`,
        type: 'warning',
      });
    }

    // Vaste stop-loss: verlies > 15% vanaf aankoopprijs
    else if (checkStopLossHolding(holding, -15)) {
      actions.push({
        symbol: holding.symbol,
        action: 'STOP_LOSS',
        reason: `${holding.gainPercent.toFixed(1)}% verlies — bescherming actief`,
        type: 'warning',
      });
    }

    // RSI oversold + opwaartse trend = koopkans
    if (analysis.action === 'strong_buy') {
      actions.push({
        symbol: holding.symbol,
        action: 'BIJKOPEN',
        reason: analysis.signals.map(s => s.text).join(', '),
        type: 'positive',
      });
    }

    // RSI overbought + neerwaartse trend = verkoopsignaal
    if (analysis.action === 'strong_sell') {
      actions.push({
        symbol: holding.symbol,
        action: 'AFBOUWEN',
        reason: analysis.signals.map(s => s.text).join(', '),
        type: 'warning',
      });
    }
  }

  return actions;
}
