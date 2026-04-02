import { describe, it, expect } from 'vitest';
import {
  analyzeMarket,
  analyzeUltraMarket,
  getSmartAllocation,
  calculateRebalance,
  checkStopLoss,
  getMarketMessage,
  getUltraMessage,
} from '../data/smartAI';

// Mock data
const normalMarket = [
  { symbol: 'SPY', changePercent: 0.5 },
  { symbol: 'VTI', changePercent: 0.3 },
  { symbol: 'VXUS', changePercent: -0.2 },
  { symbol: 'BND', changePercent: 0.1 },
  { symbol: 'VGK', changePercent: 0.4 },
];

const crashMarket = [
  { symbol: 'SPY', changePercent: -6.0 },
  { symbol: 'VTI', changePercent: -5.5 },
  { symbol: 'VXUS', changePercent: -7.0 },
  { symbol: 'BND', changePercent: -1.0 },
  { symbol: 'VGK', changePercent: -5.0 },
];

const dipMarket = [
  { symbol: 'SPY', changePercent: -4.0 },
  { symbol: 'VTI', changePercent: -3.5 },
  { symbol: 'VXUS', changePercent: -4.5 },
  { symbol: 'BND', changePercent: -1.0 },
  { symbol: 'VGK', changePercent: -3.0 },
];

const recoveryMarket = [
  { symbol: 'SPY', changePercent: 3.0 },
  { symbol: 'VTI', changePercent: 2.5 },
  { symbol: 'VXUS', changePercent: 3.5 },
  { symbol: 'BND', changePercent: 1.0 },
  { symbol: 'VGK', changePercent: 2.5 },
];

describe('analyzeMarket', () => {
  it('detecteert normale markt', () => {
    const result = analyzeMarket(normalMarket);
    expect(result.mode).toBe('normal');
  });

  it('detecteert paniek modus bij grote daling', () => {
    const result = analyzeMarket(crashMarket);
    expect(result.mode).toBe('panic');
  });

  it('detecteert defensieve modus bij matige daling', () => {
    const result = analyzeMarket(dipMarket);
    expect(result.mode).toBe('defense');
  });

  it('detecteert herstel modus', () => {
    const result = analyzeMarket(recoveryMarket);
    expect(result.mode).toBe('recovery');
  });

  it('berekent gemiddelde verandering', () => {
    const result = analyzeMarket(normalMarket);
    expect(result.avgChange).toBeCloseTo(0.22, 1);
  });

  it('handelt lege data af', () => {
    const result = analyzeMarket([]);
    expect(result.mode).toBe('normal');
    expect(result.avgChange).toBe(0);
  });
});

describe('analyzeUltraMarket', () => {
  const stockQuotes = [
    { symbol: 'NVDA', changePercent: 2.0 },
    { symbol: 'AAPL', changePercent: 1.0 },
    { symbol: 'MSFT', changePercent: -0.5 },
    { symbol: 'GOOGL', changePercent: 1.5 },
    { symbol: 'META', changePercent: -1.0 },
  ];

  it('telt winners en losers', () => {
    const result = analyzeUltraMarket(stockQuotes);
    expect(result.winners).toBe(3);
    expect(result.losers).toBe(2);
  });

  it('vindt beste en slechtste aandeel', () => {
    const result = analyzeUltraMarket(stockQuotes);
    expect(result.bestStock.symbol).toBe('NVDA');
    expect(result.worstStock.symbol).toBe('META');
  });

  it('detecteert crisis bij -15%+', () => {
    const crisisQuotes = [
      { symbol: 'A', changePercent: -17.0 },
      { symbol: 'B', changePercent: -16.0 },
      { symbol: 'C', changePercent: -15.0 },
    ];
    const result = analyzeUltraMarket(crisisQuotes);
    expect(result.mode).toBe('crisis');
  });

  it('heeft defensiveShift bij daling', () => {
    const defenseQuotes = [
      { symbol: 'A', changePercent: -4.0 },
      { symbol: 'B', changePercent: -3.5 },
      { symbol: 'C', changePercent: -4.5 },
    ];
    const result = analyzeUltraMarket(defenseQuotes);
    expect(result.defensiveShift).toBeDefined();
    expect(result.defensiveShift.BND).toBeGreaterThan(0);
  });
});

describe('getSmartAllocation', () => {
  it('geeft normale allocatie voor rustig profiel', () => {
    const alloc = getSmartAllocation('low', 'normal');
    expect(alloc.BND).toBeGreaterThan(0.4); // Veel obligaties
  });

  it('verschuift naar meer obligaties bij paniek', () => {
    const normal = getSmartAllocation('medium', 'normal');
    const panic = getSmartAllocation('medium', 'panic');
    expect(panic.BND).toBeGreaterThan(normal.BND);
  });

  it('geeft geen obligaties voor avontuurlijk normaal', () => {
    const alloc = getSmartAllocation('high', 'normal');
    expect(alloc.BND).toBeUndefined();
  });
});

describe('checkStopLoss', () => {
  it('triggert bij -15% of meer', () => {
    expect(checkStopLoss(-15)).toBe(true);
    expect(checkStopLoss(-20)).toBe(true);
  });

  it('triggert niet bij minder dan -15%', () => {
    expect(checkStopLoss(-10)).toBe(false);
    expect(checkStopLoss(0)).toBe(false);
    expect(checkStopLoss(5)).toBe(false);
  });
});

describe('getMarketMessage', () => {
  it('geeft stop-loss bericht bij groot verlies', () => {
    const analysis = { mode: 'normal', avgChange: 0 };
    const msg = getMarketMessage(analysis, [], -16);
    expect(msg.type).toBe('warning');
    expect(msg.title).toContain('Stop-loss');
  });

  it('geeft paniek bericht bij crash', () => {
    const analysis = { mode: 'panic', avgChange: -6 };
    const msg = getMarketMessage(analysis, [], -3);
    expect(msg.type).toBe('alert');
  });

  it('geeft positief bericht bij herstel', () => {
    const analysis = { mode: 'recovery', avgChange: 2.5, shouldBuyDip: false };
    const msg = getMarketMessage(analysis, [], 2);
    expect(msg.type).toBe('positive');
  });
});

describe('getUltraMessage', () => {
  const baseAnalysis = {
    mode: 'normal',
    avgChange: 1.0,
    winners: 3,
    losers: 2,
    bestStock: { symbol: 'NVDA', changePercent: 3.0 },
    worstStock: { symbol: 'META', changePercent: -1.0 },
    defensiveShift: { stocks: 1.0, BND: 0.0 },
  };

  it('geeft crisis bericht bij crisis modus', () => {
    const analysis = { ...baseAnalysis, mode: 'crisis', defensiveShift: { stocks: 0.4, BND: 0.6 } };
    const msg = getUltraMessage(analysis, [], -5);
    expect(msg.type).toBe('warning');
    expect(msg.title).toContain('bescherming');
  });

  it('crasht niet bij null changePercent', () => {
    const analysis = {
      ...baseAnalysis,
      bestStock: { symbol: 'NVDA', changePercent: null },
      worstStock: { symbol: 'META', changePercent: null },
    };
    expect(() => getUltraMessage(analysis, [], 0)).not.toThrow();
  });
});
