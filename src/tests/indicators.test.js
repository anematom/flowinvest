import { describe, it, expect } from 'vitest';
import {
  calculateRSI,
  calculateSMA,
  getMASignal,
  analyzeStock,
  checkTakeProfit,
  checkStopLossHolding,
  generateTradeActions,
} from '../data/indicators';

// Genereer mock prijsdata
function generatePrices(start, days, trend = 0.001) {
  const prices = [start];
  for (let i = 1; i < days; i++) {
    const change = (Math.random() - 0.45) * 2 + trend;
    prices.push(prices[i - 1] * (1 + change / 100));
  }
  return prices;
}

const risingPrices = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
const fallingPrices = Array.from({ length: 60 }, (_, i) => 150 - i * 0.5);
const flatPrices = Array.from({ length: 60 }, () => 100);

describe('calculateRSI', () => {
  it('geeft null bij te weinig data', () => {
    expect(calculateRSI([100, 101, 102])).toBeNull();
  });

  it('geeft waarde tussen 0 en 100', () => {
    const rsi = calculateRSI(risingPrices);
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  it('geeft hoge RSI bij stijgende prijzen', () => {
    const rsi = calculateRSI(risingPrices);
    expect(rsi).toBeGreaterThan(60);
  });

  it('geeft lage RSI bij dalende prijzen', () => {
    const rsi = calculateRSI(fallingPrices);
    expect(rsi).toBeLessThan(40);
  });
});

describe('calculateSMA', () => {
  it('geeft null bij te weinig data', () => {
    expect(calculateSMA([100, 101], 20)).toBeNull();
  });

  it('berekent correct gemiddelde', () => {
    const prices = [10, 20, 30, 40, 50];
    expect(calculateSMA(prices, 5)).toBe(30);
  });

  it('gebruikt laatste N prijzen', () => {
    const prices = [1, 2, 3, 10, 20, 30];
    expect(calculateSMA(prices, 3)).toBe(20);
  });
});

describe('getMASignal', () => {
  it('geeft strong_buy bij stijgende trend', () => {
    const signal = getMASignal(risingPrices);
    expect(['strong_buy', 'buy']).toContain(signal.signal);
  });

  it('geeft sell bij dalende trend', () => {
    const signal = getMASignal(fallingPrices);
    expect(['strong_sell', 'sell']).toContain(signal.signal);
  });

  it('geeft neutral bij te weinig data', () => {
    const signal = getMASignal([100, 101]);
    expect(signal.signal).toBe('neutral');
  });
});

describe('checkTakeProfit', () => {
  it('triggert bij +999% of meer (effectief uitgeschakeld)', () => {
    expect(checkTakeProfit({ gainPercent: 999 })).toBe(true);
    expect(checkTakeProfit({ gainPercent: 1000 })).toBe(true);
  });

  it('triggert niet onder +999%', () => {
    expect(checkTakeProfit({ gainPercent: 15 })).toBe(false);
    expect(checkTakeProfit({ gainPercent: 100 })).toBe(false);
  });
});

describe('checkStopLossHolding', () => {
  it('triggert bij -15% of meer', () => {
    expect(checkStopLossHolding({ gainPercent: -15 })).toBe(true);
    expect(checkStopLossHolding({ gainPercent: -20 })).toBe(true);
  });

  it('triggert niet boven -15%', () => {
    expect(checkStopLossHolding({ gainPercent: -10 })).toBe(false);
    expect(checkStopLossHolding({ gainPercent: 5 })).toBe(false);
  });
});

describe('analyzeStock', () => {
  it('geeft een actie terug', () => {
    const result = analyzeStock(risingPrices, 130);
    expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(result.action);
  });

  it('heeft signalen', () => {
    const result = analyzeStock(risingPrices, 130);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('heeft RSI waarde', () => {
    const result = analyzeStock(risingPrices, 130);
    expect(result.rsi).toBeGreaterThan(0);
    expect(result.rsi).toBeLessThanOrEqual(100);
  });
});

describe('generateTradeActions', () => {
  it('genereert stop-loss actie bij groot verlies', () => {
    const holdings = [{ symbol: 'NVDA', gainPercent: -12 }];
    const analyses = { NVDA: { action: 'hold', signals: [] } };
    const actions = generateTradeActions(holdings, analyses);
    const stopLoss = actions.find(a => a.action === 'STOP_LOSS');
    expect(stopLoss).toBeDefined();
  });

  it('genereert take-profit actie bij grote winst', () => {
    const holdings = [{ symbol: 'NVDA', gainPercent: 18 }];
    const analyses = { NVDA: { action: 'hold', signals: [] } };
    const actions = generateTradeActions(holdings, analyses);
    const takeProfit = actions.find(a => a.action === 'TAKE_PROFIT');
    expect(takeProfit).toBeDefined();
  });

  it('genereert geen acties bij neutrale markt', () => {
    const holdings = [{ symbol: 'NVDA', gainPercent: 3 }];
    const analyses = { NVDA: { action: 'hold', signals: [{ text: 'neutraal' }] } };
    const actions = generateTradeActions(holdings, analyses);
    expect(actions.length).toBe(0);
  });
});
