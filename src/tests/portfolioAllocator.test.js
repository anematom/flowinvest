import { describe, it, expect } from 'vitest';
import { buildPortfolio, buildUltraPortfolio, getPortfolioTotals, isUltraMode } from '../data/portfolioAllocator';

// Mock quotes
const mockETFQuotes = [
  { symbol: 'SPY', name: 'S&P 500', price: 500, previousClose: 498, changePercent: 0.4 },
  { symbol: 'VTI', name: 'Total Market', price: 250, previousClose: 249, changePercent: 0.4 },
  { symbol: 'VXUS', name: 'International', price: 60, previousClose: 59.5, changePercent: 0.8 },
  { symbol: 'BND', name: 'Obligaties', price: 72, previousClose: 72, changePercent: 0 },
  { symbol: 'VGK', name: 'European', price: 65, previousClose: 64.5, changePercent: 0.8 },
];

const mockStockQuotes = [
  { symbol: 'NVDA', name: 'NVIDIA', description: 'AI chips', price: 900, previousClose: 890, changePercent: 1.1 },
  { symbol: 'AAPL', name: 'Apple', description: 'Tech', price: 180, previousClose: 178, changePercent: 1.1 },
  { symbol: 'MSFT', name: 'Microsoft', description: 'Cloud', price: 420, previousClose: 415, changePercent: 1.2 },
  { symbol: 'GOOGL', name: 'Alphabet', description: 'Search', price: 170, previousClose: 168, changePercent: 1.2 },
  { symbol: 'META', name: 'Meta', description: 'Social', price: 500, previousClose: 495, changePercent: 1.0 },
  { symbol: 'TSLA', name: 'Tesla', description: 'EV', price: 250, previousClose: 248, changePercent: 0.8 },
  { symbol: 'AMD', name: 'AMD', description: 'Chips', price: 160, previousClose: 155, changePercent: 3.2 },
  { symbol: 'AVGO', name: 'Broadcom', description: 'Semi', price: 180, previousClose: 175, changePercent: 2.9 },
  { symbol: 'CRM', name: 'Salesforce', description: 'CRM', price: 300, previousClose: 298, changePercent: 0.7 },
  { symbol: 'BND', name: 'Obligaties', description: 'Bonds', price: 72, previousClose: 72, changePercent: 0 },
];

describe('isUltraMode', () => {
  it('herkent ultra modus', () => {
    expect(isUltraMode('ultra')).toBe(true);
  });
  it('herkent niet-ultra modus', () => {
    expect(isUltraMode('low')).toBe(false);
    expect(isUltraMode('medium')).toBe(false);
    expect(isUltraMode('high')).toBe(false);
  });
});

describe('buildPortfolio', () => {
  it('bouwt een portfolio met correct aantal ETFs', () => {
    const portfolio = buildPortfolio(1000, 'medium', mockETFQuotes);
    expect(portfolio.length).toBeGreaterThan(0);
    expect(portfolio.length).toBeLessThanOrEqual(5);
  });

  it('investeert het juiste totaalbedrag', () => {
    const portfolio = buildPortfolio(1000, 'medium', mockETFQuotes);
    const totalInvested = portfolio.reduce((sum, p) => sum + p.invested, 0);
    expect(totalInvested).toBeCloseTo(1000, 0);
  });

  it('berekent shares op basis van huidige prijs', () => {
    const portfolio = buildPortfolio(1000, 'low', mockETFQuotes);
    for (const holding of portfolio) {
      if (holding.price > 0) {
        expect(holding.shares).toBeCloseTo(holding.invested / holding.price, 4);
      }
    }
  });
});

describe('buildUltraPortfolio', () => {
  it('selecteert top 5 aandelen (exclusief BND)', () => {
    const portfolio = buildUltraPortfolio(1000, mockStockQuotes);
    const symbols = portfolio.map(p => p.symbol);
    expect(symbols).not.toContain('BND');
    expect(portfolio.length).toBe(5);
  });

  it('investeert het juiste totaalbedrag', () => {
    const portfolio = buildUltraPortfolio(1000, mockStockQuotes);
    const totalInvested = portfolio.reduce((sum, p) => sum + p.invested, 0);
    expect(totalInvested).toBeCloseTo(1000, 0);
  });

  it('heeft de juiste gewichten (30/25/20/15/10)', () => {
    const portfolio = buildUltraPortfolio(1000, mockStockQuotes);
    expect(portfolio[0].weight).toBeCloseTo(0.30, 2);
    expect(portfolio[1].weight).toBeCloseTo(0.25, 2);
    expect(portfolio[2].weight).toBeCloseTo(0.20, 2);
    expect(portfolio[3].weight).toBeCloseTo(0.15, 2);
    expect(portfolio[4].weight).toBeCloseTo(0.10, 2);
  });

  it('sorteert op momentum (beste eerst)', () => {
    const portfolio = buildUltraPortfolio(1000, mockStockQuotes);
    // AMD heeft 3.2% en AVGO 2.9% — die moeten bovenaan staan
    expect(portfolio[0].symbol).toBe('AMD');
    expect(portfolio[1].symbol).toBe('AVGO');
  });

  it('voegt BND toe bij defensieve verschuiving', () => {
    const defensiveShift = { stocks: 0.60, BND: 0.40 };
    const portfolio = buildUltraPortfolio(1000, mockStockQuotes, defensiveShift);
    const bnd = portfolio.find(p => p.symbol === 'BND');
    expect(bnd).toBeDefined();
    expect(bnd.invested).toBeCloseTo(400, 0);
  });

  it('verdeelt geld correct bij defensieve verschuiving', () => {
    const defensiveShift = { stocks: 0.60, BND: 0.40 };
    const portfolio = buildUltraPortfolio(1000, mockStockQuotes, defensiveShift);
    const totalInvested = portfolio.reduce((sum, p) => sum + p.invested, 0);
    expect(totalInvested).toBeCloseTo(1000, 0);
  });
});

describe('getPortfolioTotals', () => {
  it('berekent totale waarde correct — winst per holding', () => {
    const portfolio = [
      { currentValue: 300, invested: 280, gain: 20 },
      { currentValue: 200, invested: 200, gain: 0 },
      { currentValue: 500, invested: 520, gain: -20 },
    ];
    const totals = getPortfolioTotals(portfolio, 1000);
    // totalGain = 20 + 0 + (-20) = 0
    expect(totals.totalValue).toBe(1000); // inleg + 0
    expect(totals.totalGain).toBe(0);
    expect(totals.isPositive).toBe(true);
  });

  it('detecteert winst correct', () => {
    const portfolio = [
      { currentValue: 550, invested: 500, gain: 50 },
      { currentValue: 550, invested: 500, gain: 50 },
    ];
    const totals = getPortfolioTotals(portfolio, 1000);
    // totalGain = 50 + 50 = 100
    expect(totals.totalValue).toBe(1100); // inleg + 100
    expect(totals.totalGain).toBe(100);
    expect(totals.totalGainPercent).toBeCloseTo(10, 0);
    expect(totals.isPositive).toBe(true);
  });

  it('detecteert verlies correct', () => {
    const portfolio = [
      { currentValue: 400, invested: 500, gain: -100 },
      { currentValue: 400, invested: 500, gain: -100 },
    ];
    const totals = getPortfolioTotals(portfolio, 1000);
    // totalGain = -100 + (-100) = -200
    expect(totals.totalValue).toBe(800); // inleg + (-200)
    expect(totals.totalGain).toBe(-200);
    expect(totals.isPositive).toBe(false);
  });
});
