import { describe, it, expect } from 'vitest';
import { buildPortfolio, buildUltraPortfolio, getPortfolioTotals, isUltraMode, selectByMomentum } from '../data/portfolioAllocator';

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
    expect(portfolio.length).toBeLessThanOrEqual(8);
  });

  it('investeert het juiste totaalbedrag', () => {
    const portfolio = buildUltraPortfolio(1000, mockStockQuotes);
    const totalInvested = portfolio.reduce((sum, p) => sum + p.invested, 0);
    expect(totalInvested).toBeCloseTo(1000, 0);
  });

  it('heeft de juiste gewichten (20/16/14/12/10/10/10/8)', () => {
    const portfolio = buildUltraPortfolio(1000, mockStockQuotes);
    expect(portfolio[0].weight).toBeCloseTo(0.20, 2);
    expect(portfolio[1].weight).toBeCloseTo(0.16, 2);
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

// Quotes met momentumscores en regio's, zoals de server ze nu levert.
// De dagbeweging staat expres tegengesteld aan het momentum, zodat een test
// die faalt meteen laat zien op welk van de twee gesorteerd wordt.
const mockMomentumQuotes = [
  { symbol: 'NVDA', name: 'NVIDIA', price: 900, changePercent: -2.0, momentumScore: 80, region: 'US' },
  { symbol: 'MSFT', name: 'Microsoft', price: 420, changePercent: -1.5, momentumScore: 70, region: 'US' },
  { symbol: 'AAPL', name: 'Apple', price: 180, changePercent: -1.0, momentumScore: 60, region: 'US' },
  { symbol: 'AMD', name: 'AMD', price: 160, changePercent: -0.5, momentumScore: 50, region: 'US' },
  { symbol: 'META', name: 'Meta', price: 500, changePercent: 0.5, momentumScore: 40, region: 'US' },
  { symbol: 'ORCL', name: 'Oracle', price: 200, changePercent: 1.0, momentumScore: 35, region: 'US' },
  { symbol: 'ASML', name: 'ASML', price: 800, changePercent: 2.0, momentumScore: 30, region: 'EU' },
  { symbol: 'SAP', name: 'SAP', price: 250, changePercent: 3.0, momentumScore: 20, region: 'EU' },
  { symbol: 'TSM', name: 'TSMC', price: 180, changePercent: 4.0, momentumScore: 10, region: 'Asia' },
];

describe('selectByMomentum', () => {
  it('rangschikt op momentum, niet op dagbeweging', () => {
    const picks = selectByMomentum(mockMomentumQuotes, 3);
    expect(picks.map(p => p.symbol)).toEqual(['NVDA', 'MSFT', 'AAPL']);
  });

  it('houdt maximaal 5 posities per regio aan', () => {
    const picks = selectByMomentum(mockMomentumQuotes, 8);
    const amerikaans = picks.filter(p => p.region === 'US');
    expect(amerikaans.length).toBe(5);
    // De zesde VS-naam (ORCL) wordt overgeslagen voor Europa en Azie
    expect(picks.map(p => p.symbol)).not.toContain('ORCL');
    expect(picks.map(p => p.symbol)).toContain('ASML');
  });

  it('geeft spreiding over meerdere regios', () => {
    const picks = selectByMomentum(mockMomentumQuotes, 8);
    const regios = new Set(picks.map(p => p.region));
    expect(regios.size).toBeGreaterThan(1);
  });

  it('respecteert een aangepast regiomaximum', () => {
    const picks = selectByMomentum(mockMomentumQuotes, 6, 2);
    expect(picks.filter(p => p.region === 'US').length).toBe(2);
  });

  it('vraagt nooit meer posities dan gevraagd', () => {
    expect(selectByMomentum(mockMomentumQuotes, 4).length).toBe(4);
  });

  const zonderVeld = (quotes, veld) => quotes.map(q => {
    const kopie = { ...q };
    delete kopie[veld];
    return kopie;
  });

  it('valt terug op dagbeweging als er geen momentumscores zijn', () => {
    const picks = selectByMomentum(zonderVeld(mockMomentumQuotes, 'momentumScore'), 2);
    expect(picks.map(p => p.symbol)).toEqual(['TSM', 'SAP']);
  });

  it('negeert het regiomaximum bij quotes zonder regio', () => {
    expect(selectByMomentum(zonderVeld(mockMomentumQuotes, 'region'), 8).length).toBe(8);
  });
});

describe('buildUltraPortfolio met momentum', () => {
  it('kiest de aandelen met het hoogste momentum', () => {
    const portfolio = buildUltraPortfolio(10000, mockMomentumQuotes, null);
    expect(portfolio[0].symbol).toBe('NVDA');
    expect(portfolio.map(p => p.symbol)).not.toContain('ORCL');
  });

  it('investeert nog steeds het volledige bedrag', () => {
    const portfolio = buildUltraPortfolio(10000, mockMomentumQuotes, null);
    const totaal = portfolio.reduce((som, p) => som + p.invested, 0);
    expect(totaal).toBeCloseTo(10000, 2);
  });
});
