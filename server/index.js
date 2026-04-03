import express from 'express';
import cors from 'cors';
import { DayTradingEngine } from './daytrader.js';

const app = express();

// Day Trading Engine (global instance)
const dayTrader = new DayTradingEngine({
  startCapital: 10000,
  riskPercent: 2,
  stopLoss: 1.5,
  takeProfit: 3,
  maxPositions: 3,
});
app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURATIE - Vul hier je Finnhub API key in
// Gratis te verkrijgen op: https://finnhub.io/register
// ============================================
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// ============================================
// ALPACA — Paper Trading
// ============================================
const ALPACA_KEY = process.env.ALPACA_KEY || '';
const ALPACA_SECRET = process.env.ALPACA_SECRET || '';
const ALPACA_BASE = 'https://paper-api.alpaca.markets/v2';
const ALPACA_LIVE_BASE = 'https://api.alpaca.markets/v2';

async function alpacaFetch(endpoint, options = {}) {
  const res = await fetch(`${ALPACA_BASE}${endpoint}`, {
    ...options,
    headers: {
      'APCA-API-KEY-ID': ALPACA_KEY,
      'APCA-API-SECRET-KEY': ALPACA_SECRET,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Alpaca error ${res.status}: ${err}`);
  }
  return res.json();
}

// Helper: fetch met error handling
async function finnhubFetch(endpoint) {
  const url = `${FINNHUB_BASE}${endpoint}&token=${FINNHUB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub error: ${res.status}`);
  return res.json();
}

// Helper: haal stock snapshots op via Alpaca (betrouwbaarder dan Finnhub)
async function getAlpacaQuotes(symbols) {
  const key = ALPACA_KEY || process.env.ALPACA_KEY;
  const secret = ALPACA_SECRET || process.env.ALPACA_SECRET;
  if (!key || !secret) return [];

  const res = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols.join(',')}`, {
    headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret }
  });
  if (!res.ok) return [];
  const data = await res.json();

  return Object.entries(data).map(([symbol, snap]) => ({
    symbol,
    price: snap.dailyBar?.c || snap.latestTrade?.p || null,
    change: snap.dailyBar && snap.prevDailyBar ? snap.dailyBar.c - snap.prevDailyBar.c : null,
    changePercent: snap.dailyBar && snap.prevDailyBar ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c * 100) : null,
    previousClose: snap.prevDailyBar?.c || null,
    high: snap.dailyBar?.h || null,
    low: snap.dailyBar?.l || null,
  }));
}

// ============================================
// ETF / Aandelen configuratie
// ============================================
const DEFAULT_ETFS = [
  { symbol: 'SPY', name: 'S&P 500 ETF', description: 'Grootste 500 Amerikaanse bedrijven' },
  { symbol: 'VTI', name: 'Total Stock Market', description: 'Hele Amerikaanse markt' },
  { symbol: 'VXUS', name: 'International ETF', description: 'Internationale markten (ex-US)' },
  { symbol: 'BND', name: 'Total Bond Market', description: 'Obligaties — stabiel en veilig' },
  { symbol: 'VGK', name: 'European Stocks', description: 'Europese aandelen' },
];

// ============================================
// ROUTES
// ============================================

// Realtime quote voor een ticker
app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const data = await finnhubFetch(`/quote?symbol=${req.params.symbol.toUpperCase()}`);
    res.json({
      symbol: req.params.symbol.toUpperCase(),
      price: data.c,           // Current price
      change: data.d,          // Change
      changePercent: data.dp,  // Change percent
      high: data.h,            // High of day
      low: data.l,             // Low of day
      open: data.o,            // Open
      previousClose: data.pc,  // Previous close
      timestamp: data.t,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historische data (candles) voor grafiek
app.get('/api/history/:symbol', async (req, res) => {
  try {
    const { months = 12 } = req.query;
    const to = Math.floor(Date.now() / 1000);
    const from = to - (parseInt(months) * 30 * 24 * 60 * 60);

    const data = await finnhubFetch(
      `/stock/candle?symbol=${req.params.symbol.toUpperCase()}&resolution=D&from=${from}&to=${to}`
    );

    if (data.s === 'no_data') {
      return res.json({ symbol: req.params.symbol.toUpperCase(), data: [] });
    }

    // Converteer naar handig formaat
    const history = data.t.map((timestamp, i) => ({
      date: new Date(timestamp * 1000).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
      dateISO: new Date(timestamp * 1000).toISOString().split('T')[0],
      close: data.c[i],
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      volume: data.v[i],
    }));

    res.json({
      symbol: req.params.symbol.toUpperCase(),
      data: history,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alle ETF quotes in één keer (Alpaca first, Finnhub fallback)
app.get('/api/portfolio', async (req, res) => {
  try {
    const symbols = DEFAULT_ETFS.map(e => e.symbol);
    let alpacaQuotes = [];
    try {
      alpacaQuotes = await getAlpacaQuotes(symbols);
    } catch {
      // Alpaca mislukt, probeer Finnhub als fallback
    }

    const alpacaMap = Object.fromEntries(alpacaQuotes.map(q => [q.symbol, q]));

    const quotes = await Promise.all(
      DEFAULT_ETFS.map(async (etf) => {
        // Gebruik Alpaca data als beschikbaar
        if (alpacaMap[etf.symbol] && alpacaMap[etf.symbol].price != null) {
          return { ...etf, ...alpacaMap[etf.symbol] };
        }
        // Fallback naar Finnhub
        try {
          const data = await finnhubFetch(`/quote?symbol=${etf.symbol}`);
          return {
            ...etf,
            price: data.c,
            change: data.d,
            changePercent: data.dp,
            previousClose: data.pc,
          };
        } catch {
          return { ...etf, price: null, change: null, changePercent: null, error: true };
        }
      })
    );
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SENTIMENTANALYSE
// ============================================

// Cache voor sentiment (niet elke keer opnieuw analyseren)
const sentimentCache = {};
const SENTIMENT_CACHE_TTL = 30 * 60 * 1000; // 30 minuten

app.get('/api/sentiment/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  // Check cache
  if (sentimentCache[symbol] && Date.now() - sentimentCache[symbol].timestamp < SENTIMENT_CACHE_TTL) {
    return res.json(sentimentCache[symbol].data);
  }

  try {
    // Haal nieuws op van Finnhub
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const newsData = await finnhubFetch(`/company-news?symbol=${symbol}&from=${weekAgo}&to=${today}`);

    if (!newsData || newsData.length === 0) {
      return res.json({ symbol, sentiment: 'neutral', score: 0, headlines: 0 });
    }

    // Neem de laatste 10 headlines
    const headlines = newsData.slice(0, 10).map(n => n.headline).join('\n');

    // Analyseer met Gemini AI
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      return res.json({ symbol, sentiment: 'neutral', score: 0, headlines: newsData.length, reason: 'Geen AI key' });
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Analyseer deze nieuwskoppen voor het aandeel ${symbol}. Geef een sentiment score van -10 (zeer negatief) tot +10 (zeer positief). Antwoord ALLEEN met een JSON object: {"score": <nummer>, "sentiment": "positive"|"negative"|"neutral", "reason": "<korte uitleg in het Nederlands>"}\n\nHeadlines:\n${headlines}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Parse JSON uit response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const data = { symbol, ...parsed, headlines: newsData.length, analyzedAt: new Date().toISOString() };
      sentimentCache[symbol] = { data, timestamp: Date.now() };
      return res.json(data);
    }

    res.json({ symbol, sentiment: 'neutral', score: 0, headlines: newsData.length });
  } catch (err) {
    res.json({ symbol, sentiment: 'neutral', score: 0, error: err.message });
  }
});

// Bulk sentiment voor alle momentum aandelen
app.get('/api/sentiment', async (req, res) => {
  try {
    const symbols = MOMENTUM_POOL.map(s => s.symbol);
    const results = {};
    for (const sym of symbols.slice(0, 5)) { // Max 5 om rate limits te voorkomen
      try {
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const newsData = await finnhubFetch(`/company-news?symbol=${sym}&from=${weekAgo}&to=${today}`);
        const positiveWords = ['buy', 'upgrade', 'beat', 'surge', 'rally', 'growth', 'strong', 'record', 'bullish', 'outperform', 'raised', 'positive'];
        const negativeWords = ['sell', 'downgrade', 'miss', 'drop', 'fall', 'decline', 'weak', 'loss', 'bearish', 'underperform', 'cut', 'warning'];

        let score = 0;
        const headlines = newsData.slice(0, 15);
        for (const article of headlines) {
          const h = article.headline.toLowerCase();
          for (const w of positiveWords) if (h.includes(w)) score += 1;
          for (const w of negativeWords) if (h.includes(w)) score -= 1;
        }

        results[sym] = { score, sentiment: score > 2 ? 'positive' : score < -2 ? 'negative' : 'neutral', headlines: newsData.length };
      } catch { results[sym] = { score: 0, sentiment: 'neutral' }; }
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CRYPTO
// ============================================
const CRYPTO_COINS = [
  { symbol: 'BTC/USD', name: 'Bitcoin', description: 'De eerste en grootste crypto' },
  { symbol: 'ETH/USD', name: 'Ethereum', description: 'Smart contracts platform' },
  { symbol: 'SOL/USD', name: 'Solana', description: 'Snelle blockchain' },
  { symbol: 'DOGE/USD', name: 'Dogecoin', description: 'Meme coin' },
  { symbol: 'AVAX/USD', name: 'Avalanche', description: 'DeFi platform' },
  { symbol: 'LINK/USD', name: 'Chainlink', description: 'Oracle netwerk' },
  { symbol: 'DOT/USD', name: 'Polkadot', description: 'Multi-chain protocol' },
  { symbol: 'MATIC/USD', name: 'Polygon', description: 'Ethereum scaling' },
  { symbol: 'ADA/USD', name: 'Cardano', description: 'Wetenschappelijke blockchain' },
  { symbol: 'XRP/USD', name: 'Ripple', description: 'Betalingsnetwerk' },
];

// Crypto quotes via Alpaca
app.get('/api/crypto', async (req, res) => {
  try {
    const quotes = await Promise.all(
      CRYPTO_COINS.map(async (coin) => {
        try {
          const symbol = coin.symbol.replace('/', '%2F');
          const r = await fetch(`https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=${symbol}`, {
            headers: {
              'APCA-API-KEY-ID': ALPACA_KEY || req.query.apiKey || '',
              'APCA-API-SECRET-KEY': ALPACA_SECRET || req.query.secretKey || '',
            },
          });
          if (!r.ok) return { ...coin, price: null, changePercent: null, error: true };
          const data = await r.json();
          const quote = data.quotes?.[coin.symbol];
          if (!quote) return { ...coin, price: null, changePercent: null, error: true };

          const price = (quote.ap + quote.bp) / 2; // midpoint
          return {
            ...coin,
            price,
            previousClose: price, // crypto heeft geen close, gebruiken we later
            changePercent: 0,
          };
        } catch {
          return { ...coin, price: null, changePercent: null, error: true };
        }
      })
    );
    res.json(quotes.filter(q => q.price != null));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// LOSSE AANDELEN — Globale momentum strategie
// ============================================
// Globale momentum pool: US aandelen + regionale ETF's
const MOMENTUM_POOL = [
  // US Top Aandelen
  { symbol: 'NVDA', name: 'NVIDIA', description: 'AI chips & GPU marktleider', region: 'US' },
  { symbol: 'AAPL', name: 'Apple', description: 'Consumer tech gigant', region: 'US' },
  { symbol: 'MSFT', name: 'Microsoft', description: 'Cloud & AI software', region: 'US' },
  { symbol: 'GOOGL', name: 'Alphabet', description: 'Google — zoeken & cloud', region: 'US' },
  { symbol: 'AMZN', name: 'Amazon', description: 'E-commerce & AWS cloud', region: 'US' },
  { symbol: 'META', name: 'Meta', description: 'Social media & VR', region: 'US' },
  { symbol: 'TSLA', name: 'Tesla', description: 'EV & energie', region: 'US' },
  { symbol: 'AMD', name: 'AMD', description: 'Chips & processors', region: 'US' },
  { symbol: 'AVGO', name: 'Broadcom', description: 'Semiconductors & infra', region: 'US' },
  { symbol: 'CRM', name: 'Salesforce', description: 'Cloud CRM & AI', region: 'US' },
  { symbol: 'NFLX', name: 'Netflix', description: 'Streaming entertainment', region: 'US' },
  { symbol: 'ADBE', name: 'Adobe', description: 'Creatieve software', region: 'US' },
  { symbol: 'ASML', name: 'ASML', description: 'Nederlandse chipmachines', region: 'EU' },
  { symbol: 'LLY', name: 'Eli Lilly', description: 'Farma & healthcare', region: 'US' },
  { symbol: 'V', name: 'Visa', description: 'Betalingsnetwerk', region: 'US' },
  // Regionale ETF's
  { symbol: 'VGK', name: 'Europa ETF', description: 'Europese aandelen', region: 'EU' },
  { symbol: 'MCHI', name: 'China ETF', description: 'Chinese markt', region: 'China' },
  { symbol: 'KWEB', name: 'China Internet', description: 'Alibaba, Tencent, JD', region: 'China' },
  { symbol: 'VWO', name: 'Opkomende Markten', description: 'China, India, Brazilië', region: 'EM' },
  { symbol: 'EWJ', name: 'Japan ETF', description: 'Japanse markt', region: 'Japan' },
  { symbol: 'INDA', name: 'India ETF', description: 'Indiase markt', region: 'India' },
];

// Haal quotes op voor alle momentum aandelen en sorteer op prestatie
// Inclusief BND (obligaties) voor defensieve verschuiving in ultra modus
// Alpaca first, Finnhub fallback
app.get('/api/stocks', async (req, res) => {
  try {
    const allSymbols = [...MOMENTUM_POOL, { symbol: 'BND', name: 'Obligaties', description: 'Total Bond Market — veilige haven' }];
    const symbols = allSymbols.map(s => s.symbol);
    let alpacaQuotes = [];
    try {
      alpacaQuotes = await getAlpacaQuotes(symbols);
    } catch {
      // Alpaca mislukt, probeer Finnhub als fallback
    }

    const alpacaMap = Object.fromEntries(alpacaQuotes.map(q => [q.symbol, q]));

    const quotes = await Promise.all(
      allSymbols.map(async (stock) => {
        // Gebruik Alpaca data als beschikbaar
        if (alpacaMap[stock.symbol] && alpacaMap[stock.symbol].price != null) {
          return { ...stock, ...alpacaMap[stock.symbol] };
        }
        // Fallback naar Finnhub
        try {
          const data = await finnhubFetch(`/quote?symbol=${stock.symbol}`);
          return {
            ...stock,
            price: data.c,
            change: data.d,
            changePercent: data.dp,
            previousClose: data.pc,
            high: data.h,
            low: data.l,
          };
        } catch {
          return { ...stock, price: null, change: null, changePercent: null, error: true };
        }
      })
    );

    // Sorteer op dagelijkse performance (beste eerst)
    const sorted = quotes
      .filter(q => q.changePercent != null)
      .sort((a, b) => b.changePercent - a.changePercent);

    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Top momentum aandelen — selecteert de best presterende
app.get('/api/stocks/top', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 5;
    const quotes = await Promise.all(
      MOMENTUM_POOL.map(async (stock) => {
        try {
          const data = await finnhubFetch(`/quote?symbol=${stock.symbol}`);
          return {
            ...stock,
            price: data.c,
            change: data.d,
            changePercent: data.dp,
            previousClose: data.pc,
          };
        } catch {
          return null;
        }
      })
    );

    const valid = quotes.filter(q => q && q.changePercent != null);
    const top = valid.sort((a, b) => b.changePercent - a.changePercent).slice(0, count);

    res.json(top);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historische slotkoersen voor technische analyse
app.get('/api/stocks/history', async (req, res) => {
  try {
    const symbols = req.query.symbols ? req.query.symbols.split(',') : MOMENTUM_POOL.map(s => s.symbol);
    const months = parseInt(req.query.months) || 3;
    const to = Math.floor(Date.now() / 1000);
    const from = to - (months * 30 * 24 * 60 * 60);

    const results = {};
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const data = await finnhubFetch(
            `/stock/candle?symbol=${symbol.toUpperCase()}&resolution=D&from=${from}&to=${to}`
          );
          if (data.s !== 'no_data' && data.c) {
            results[symbol.toUpperCase()] = data.c; // slotkoersen array
          }
        } catch {
          // skip
        }
      })
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Markt status
app.get('/api/market-status', async (req, res) => {
  try {
    const data = await finnhubFetch('/stock/market-status?exchange=US');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ALPACA ROUTES
// ============================================

// Account info (saldo, koopkracht)
// Helper: maak een alpaca fetch met optionele user keys
function makeAlpacaFetcher(apiKey, secretKey, live) {
  const base = live ? ALPACA_LIVE_BASE : ALPACA_BASE;
  const key = apiKey || ALPACA_KEY;
  const secret = secretKey || ALPACA_SECRET;
  return async (endpoint) => {
    const r = await fetch(`${base}${endpoint}`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, 'Content-Type': 'application/json' },
    });
    if (!r.ok) throw new Error(`Alpaca error ${r.status}`);
    return r.json();
  };
}

app.get('/api/alpaca/account', async (req, res) => {
  try {
    const fetcher = makeAlpacaFetcher(req.query.apiKey, req.query.secretKey, req.query.live === 'true');
    const data = await fetcher('/account');
    res.json({
      equity: parseFloat(data.equity),
      cash: parseFloat(data.cash),
      buyingPower: parseFloat(data.buying_power),
      portfolioValue: parseFloat(data.portfolio_value),
      currency: data.currency,
      status: data.status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Huidige posities (wat je bezit)
app.get('/api/alpaca/positions', async (req, res) => {
  try {
    const fetcher = makeAlpacaFetcher(req.query.apiKey, req.query.secretKey, req.query.live === 'true');
    const positions = await fetcher('/positions');
    res.json(positions.map(p => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      avgBuyPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      marketValue: parseFloat(p.market_value),
      unrealizedPL: parseFloat(p.unrealized_pl),
      unrealizedPLPercent: parseFloat(p.unrealized_plpc) * 100,
      side: p.side,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aandeel kopen
app.post('/api/alpaca/buy', async (req, res) => {
  try {
    const { symbol, amount } = req.body;
    if (!symbol || !amount) return res.status(400).json({ error: 'symbol en amount zijn verplicht' });

    const order = await alpacaFetch('/orders', {
      method: 'POST',
      body: JSON.stringify({
        symbol: symbol.toUpperCase(),
        notional: amount.toString(),
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
      }),
    });

    res.json({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      amount: amount,
      status: order.status,
      message: `${order.symbol} gekocht voor $${amount}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aandeel verkopen
app.post('/api/alpaca/sell', async (req, res) => {
  try {
    const { symbol, qty } = req.body;
    if (!symbol) return res.status(400).json({ error: 'symbol is verplicht' });

    const body = {
      symbol: symbol.toUpperCase(),
      side: 'sell',
      type: 'market',
      time_in_force: 'day',
    };

    if (qty) {
      body.qty = qty.toString();
    } else {
      // Verkoop alles
      const positions = await alpacaFetch('/positions');
      const position = positions.find(p => p.symbol === symbol.toUpperCase());
      if (!position) return res.status(400).json({ error: `Geen positie in ${symbol}` });
      body.qty = position.qty;
    }

    const order = await alpacaFetch('/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    res.json({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      qty: body.qty,
      status: order.status,
      message: `${order.symbol} verkocht`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Order geschiedenis
app.get('/api/alpaca/orders', async (req, res) => {
  try {
    const orders = await alpacaFetch('/orders?status=all&limit=20');
    res.json(orders.map(o => ({
      id: o.id,
      symbol: o.symbol,
      side: o.side,
      qty: o.qty,
      notional: o.notional,
      status: o.status,
      filledPrice: o.filled_avg_price,
      createdAt: o.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// AUTO-TRADE — AI-gestuurde trading via Alpaca
// ============================================

// Drempels (zelfde als frontend smartAI)
const TRADE_THRESHOLDS = {
  defenseMode: -3.0,       // was -2 (meer ruimte)
  panicMode: -7.0,         // was -5
  crisisMode: -12.0,       // was -10
  recoveryMode: 2.0,       // was 1.5
  stopLoss: -15.0,         // was -10 (meer ruimte voor herstel)
  takeProfit: 999,          // was 15 (niet verkopen bij winst, laten groeien)
  buyDip: -5.0,            // was -3 (alleen echte dips)
};

// Defensieve verdeling per risicoprofiel
const DEFENSE_CONFIG = {
  low: { normal: 0.50, defense: 0.30, panic: 0.15, crisis: 0.10 },     // aandelen %
  medium: { normal: 0.85, defense: 0.60, panic: 0.40, crisis: 0.25 },
  high: { normal: 1.00, defense: 0.65, panic: 0.50, crisis: 0.35 },
  ultra: { normal: 1.00, defense: 0.80, panic: 0.60, crisis: 0.40 },
};

// ============================================
// BEVEILIGINGEN
// ============================================

// Noodstop — als actief, worden er geen trades geplaatst
let emergencyStop = false;

app.post('/api/alpaca/emergency-stop', (req, res) => {
  emergencyStop = true;
  res.json({ status: 'stopped', message: 'Noodstop geactiveerd — alle automatische trades gestopt' });
});

app.post('/api/alpaca/emergency-resume', (req, res) => {
  emergencyStop = false;
  orderCount = 0; // Reset order teller
  res.json({ status: 'resumed', message: 'Automatische trades hervat' });
});

app.get('/api/alpaca/emergency-status', (req, res) => {
  res.json({ stopped: emergencyStop });
});

// Rate limiting — max 10 orders per uur
let orderCount = 0;
let orderCountReset = Date.now();
const MAX_ORDERS_PER_HOUR = 10;

function checkRateLimit() {
  const now = Date.now();
  if (now - orderCountReset > 60 * 60 * 1000) {
    orderCount = 0;
    orderCountReset = now;
  }
  if (orderCount >= MAX_ORDERS_PER_HOUR) {
    return false;
  }
  orderCount++;
  return true;
}

// Audit log — alle trades worden vastgelegd
const auditLog = [];

function logTrade(trade) {
  auditLog.unshift({
    ...trade,
    timestamp: new Date().toISOString(),
  });
  // Bewaar max 100 entries
  if (auditLog.length > 100) auditLog.pop();
}

app.get('/api/alpaca/audit-log', (req, res) => {
  res.json(auditLog);
});

// Veilige order plaatsing met rate limiting en audit log
async function placeOrder(orderBody, reason) {
  if (emergencyStop) {
    return { skipped: true, reason: 'Noodstop actief' };
  }
  if (!checkRateLimit()) {
    return { skipped: true, reason: 'Max orders per uur bereikt' };
  }
  const result = await alpacaFetch('/orders', {
    method: 'POST',
    body: JSON.stringify(orderBody),
  });
  logTrade({
    symbol: orderBody.symbol,
    side: orderBody.side,
    qty: orderBody.qty || null,
    notional: orderBody.notional || null,
    reason,
    orderId: result.id,
    status: result.status,
  });
  return result;
}

// ============================================
// AUTO-TRADE
// ============================================

app.post('/api/alpaca/auto-trade', async (req, res) => {
  try {
    // Noodstop check
    if (emergencyStop) {
      return res.json({ action: 'stopped', reason: 'Noodstop is actief', trades: [] });
    }

    const { risk = 'ultra', amount, alpacaKeys: userKeys } = req.body;

    // Gebruik user-specifieke keys als beschikbaar
    const useKey = userKeys?.apiKey || ALPACA_KEY;
    const useSecret = userKeys?.secretKey || ALPACA_SECRET;
    const isLive = userKeys?.live === true;
    const baseUrl = isLive ? ALPACA_LIVE_BASE : ALPACA_BASE;
    if (!useKey || !useSecret) {
      return res.json({ action: 'skip', reason: 'Geen Alpaca keys geconfigureerd', trades: [] });
    }

    // User-specifieke Alpaca fetch
    async function userAlpacaFetch(endpoint, options = {}) {
      const r = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'APCA-API-KEY-ID': useKey,
          'APCA-API-SECRET-KEY': useSecret,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      if (!r.ok) {
        const err = await r.text();
        throw new Error(`Alpaca error ${r.status}: ${err}`);
      }
      return r.json();
    }

    // 0. Annuleer openstaande orders om wash trade errors te voorkomen
    try { await userAlpacaFetch('/orders', { method: 'DELETE' }); } catch {}

    // 1. Haal account info en huidige posities op
    const [account, positions] = await Promise.all([
      userAlpacaFetch('/account'),
      userAlpacaFetch('/positions'),
    ]);

    // Haal quotes op via Alpaca (bulk), fallback naar Finnhub per symbool
    let stockQuotes = [];
    try {
      const alpacaQ = await getAlpacaQuotes(MOMENTUM_POOL.map(s => s.symbol));
      const alpacaMap = Object.fromEntries(alpacaQ.map(q => [q.symbol, q]));
      stockQuotes = MOMENTUM_POOL.map(stock => {
        const q = alpacaMap[stock.symbol];
        if (q && q.price != null) return { ...stock, ...q };
        return null;
      });
    } catch {
      // Alpaca mislukt — Finnhub fallback
    }

    // Vul ontbrekende quotes aan via Finnhub
    const missing = MOMENTUM_POOL.filter((s, i) => !stockQuotes[i]);
    if (missing.length > 0) {
      const fallback = await Promise.all(
        missing.map(async (stock) => {
          try {
            const data = await finnhubFetch(`/quote?symbol=${stock.symbol}`);
            return { ...stock, price: data.c, changePercent: data.dp, previousClose: data.pc };
          } catch { return null; }
        })
      );
      let fi = 0;
      stockQuotes = stockQuotes.map((q, i) => q || fallback[fi++] || null);
    }

    // Check of er geld beschikbaar is op het account
    const accountCash = parseFloat(account.cash);
    const accountEquity = parseFloat(account.equity);
    if (isLive && accountCash < 1 && accountEquity < 1) {
      return res.json({
        action: 'waiting',
        reason: 'Wachten op storting — er staat nog geen geld op je Alpaca account. Dit kan 1-3 werkdagen duren na je eerste storting.',
        trades: [],
        cash: accountCash,
        equity: accountEquity,
      });
    }

    const validQuotes = stockQuotes.filter(q => q && q.price && q.changePercent != null);
    if (validQuotes.length < 3) {
      return res.json({ action: 'skip', reason: 'Te weinig betrouwbare koersdata' });
    }

    // 2. Analyseer markt
    const changes = validQuotes.map(q => q.changePercent);
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;

    let mode = 'normal';
    if (avgChange <= TRADE_THRESHOLDS.crisisMode) mode = 'crisis';
    else if (avgChange <= TRADE_THRESHOLDS.panicMode) mode = 'panic';
    else if (avgChange <= TRADE_THRESHOLDS.defenseMode) mode = 'defense';
    else if (avgChange >= TRADE_THRESHOLDS.recoveryMode) mode = 'recovery';

    // 3. Bepaal hoeveel in aandelen vs obligaties
    const config = DEFENSE_CONFIG[risk] || DEFENSE_CONFIG.ultra;
    const stockFraction = config[mode] || config.normal;
    const bondFraction = 1 - stockFraction;

    const equity = parseFloat(account.equity);
    const cash = parseFloat(account.cash);
    // Gebruik het inlegbedrag, niet de hele account
    const budget = amount ? parseFloat(amount) : equity;
    const currentPositionValue = positions.reduce((sum, p) => sum + parseFloat(p.market_value), 0);
    const availableBudget = Math.min(budget, cash + currentPositionValue);
    const targetStockValue = availableBudget * stockFraction;
    const targetBondValue = availableBudget * bondFraction;

    // User-specifieke placeOrder
    async function userPlaceOrder(orderBody, reason) {
      if (emergencyStop) return { skipped: true, reason: 'Noodstop actief' };
      if (!checkRateLimit()) return { skipped: true, reason: 'Max orders per uur bereikt' };
      const result = await userAlpacaFetch('/orders', {
        method: 'POST',
        body: JSON.stringify(orderBody),
      });
      logTrade({ symbol: orderBody.symbol, side: orderBody.side, qty: orderBody.qty || null, notional: orderBody.notional || null, reason, orderId: result.id, status: result.status });
      return result;
    }

    // 4. Top 5 aandelen op basis van momentum
    const top5 = validQuotes
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5);

    const trades = [];
    const weights = [0.30, 0.25, 0.20, 0.15, 0.10];

    // 5. Check trailing stop-loss en vaste stop-loss
    for (const pos of positions) {
      const plPercent = parseFloat(pos.unrealized_plpc) * 100;
      const symbol = pos.symbol;
      const currentPrice = parseFloat(pos.current_price);
      const entryPrice = parseFloat(pos.avg_entry_price);
      const highPrice = parseFloat(pos.current_price); // Alpaca geeft geen high since entry, we gebruiken unrealized P/L

      // Trailing stop-loss: als winst > 10% was maar nu 10% gedaald van top
      // Vereenvoudigd: als P/L positief was (>5%) maar nu snel daalt
      const costBasis = parseFloat(pos.cost_basis);
      const marketValue = parseFloat(pos.market_value);

      // Vaste stop-loss
      if (plPercent <= TRADE_THRESHOLDS.stopLoss) {
        try {
          const result = await userPlaceOrder(
            { symbol, qty: pos.qty, side: 'sell', type: 'market', time_in_force: 'day' },
            `Stop-loss: ${plPercent.toFixed(1)}% verlies`
          );
          if (!result.skipped) trades.push({ symbol, action: 'STOP_LOSS', reason: `${plPercent.toFixed(1)}% verlies`, amount: pos.qty });
        } catch (e) { console.error('Stop-loss fout:', e.message); }
        continue;
      }

      // Trailing stop: neem geen winst te vroeg, maar als het al flink gestegen was
      // en nu terugvalt, verkoop dan om winst te beschermen
      // Niet meer nodig met take-profit, trailing stop vervangt dit
      if (plPercent >= TRADE_THRESHOLDS.takeProfit) {
        const sellQty = (parseFloat(pos.qty) / 2).toFixed(4);
        try {
          const result = await userPlaceOrder(
            { symbol, qty: sellQty, side: 'sell', type: 'market', time_in_force: 'day' },
            `Trailing stop: winst beschermd bij +${plPercent.toFixed(1)}%`
          );
          if (!result.skipped) trades.push({ symbol, action: 'TAKE_PROFIT', reason: `+${plPercent.toFixed(1)}% winst`, amount: sellQty });
        } catch (e) { console.error('Take-profit fout:', e.message); }
      }
    }

    // 6. Koop top 5 aandelen als er cash is en budget niet overschreden
    const alreadyInvested = currentPositionValue;
    const remainingBudget = Math.max(0, availableBudget - alreadyInvested);
    if (cash > 10 && remainingBudget > 1) {
      const stockBudget = Math.min(cash, remainingBudget, targetStockValue) * 0.95;

      for (let i = 0; i < top5.length; i++) {
        const stock = top5[i];
        const buyAmount = stockBudget * weights[i];
        if (buyAmount < 1) continue;

        const existing = positions.find(p => p.symbol === stock.symbol);
        const existingValue = existing ? parseFloat(existing.market_value) : 0;
        const targetValue = targetStockValue * weights[i];

        if (existingValue < targetValue * 0.9) {
          const toBuy = Math.min(buyAmount, targetValue - existingValue);
          if (toBuy < 1) continue;

          try {
            const result = await userPlaceOrder(
              { symbol: stock.symbol, notional: toBuy.toFixed(2), side: 'buy', type: 'market', time_in_force: 'day' },
              `Top ${i + 1} momentum`
            );
            if (!result.skipped) trades.push({ symbol: stock.symbol, action: 'KOOP', reason: `Top ${i + 1} momentum`, amount: `$${toBuy.toFixed(2)}` });
          } catch (e) { console.error('Koop fout:', e.message); }
        }
      }

      // 7. Koop obligaties als defensief
      if (bondFraction > 0 && mode !== 'normal' && mode !== 'recovery') {
        const bondBudget = Math.min(cash, targetBondValue) * 0.95;
        if (bondBudget > 1) {
          try {
            const result = await userPlaceOrder(
              { symbol: 'BND', notional: bondBudget.toFixed(2), side: 'buy', type: 'market', time_in_force: 'day' },
              `${mode} modus — ${Math.round(bondFraction * 100)}% obligaties`
            );
            if (!result.skipped) trades.push({ symbol: 'BND', action: 'BESCHERMING', reason: `${mode} modus — ${Math.round(bondFraction * 100)}% obligaties`, amount: `$${bondBudget.toFixed(2)}` });
          } catch (e) { console.error('BND koop fout:', e.message); }
        }
      }
    }

    // 8. Verkoop aandelen die niet meer in top 5 zitten
    if (mode === 'normal' || mode === 'recovery') {
      const top5Symbols = top5.map(s => s.symbol);
      for (const pos of positions) {
        if (pos.symbol !== 'BND' && !top5Symbols.includes(pos.symbol)) {
          try {
            const result = await userPlaceOrder(
              { symbol: pos.symbol, qty: pos.qty, side: 'sell', type: 'market', time_in_force: 'day' },
              'Niet meer in top 5'
            );
            if (!result.skipped) trades.push({ symbol: pos.symbol, action: 'ROTATIE', reason: 'Niet meer in top 5', amount: pos.qty });
          } catch (e) { console.error('Rotatie fout:', e.message); }
        }
      }

      // Verkoop BND bij herstel
      const bndPosition = positions.find(p => p.symbol === 'BND');
      if (bndPosition && bondFraction === 0) {
        try {
          const result = await userPlaceOrder(
            { symbol: 'BND', qty: bndPosition.qty, side: 'sell', type: 'market', time_in_force: 'day' },
            'Terug naar 100% aandelen'
          );
          if (!result.skipped) trades.push({ symbol: 'BND', action: 'HERSTEL', reason: 'Terug naar 100% aandelen', amount: bndPosition.qty });
        } catch (e) { console.error('BND verkoop fout:', e.message); }
      }
    }

    res.json({
      mode,
      avgChange: avgChange.toFixed(2),
      stockFraction: Math.round(stockFraction * 100),
      bondFraction: Math.round(bondFraction * 100),
      top5: top5.map(s => s.symbol),
      trades,
      equity,
      cash,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// DAY TRADING DEMO
// ============================================
const DAY_TRADE_SYMBOLS = MOMENTUM_POOL.slice(0, 10).map(s => s.symbol);
let dayTradeInterval = null;
let dayTradeActive = false;

async function dayTradeTick() {
  const now = new Date();
  const timestamp = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  for (const symbol of DAY_TRADE_SYMBOLS) {
    try {
      const data = await finnhubFetch(`/quote?symbol=${symbol}`);
      if (data.c) {
        dayTrader.tick(symbol, data.c, timestamp);
      }
    } catch {}
  }
}

// Start/stop day trading
app.post('/api/daytrade/start', (req, res) => {
  if (dayTradeActive) return res.json({ status: 'already_running' });
  dayTradeActive = true;
  dayTradeTick(); // eerste tick direct
  dayTradeInterval = setInterval(dayTradeTick, 60 * 1000); // elke minuut
  res.json({ status: 'started', message: 'Day trading gestart — checkt elke minuut' });
});

app.post('/api/daytrade/stop', (req, res) => {
  dayTradeActive = false;
  if (dayTradeInterval) clearInterval(dayTradeInterval);
  dayTradeInterval = null;
  res.json({ status: 'stopped' });
});

app.get('/api/daytrade/status', (req, res) => {
  res.json({ active: dayTradeActive, ...dayTrader.getStatus() });
});

app.post('/api/daytrade/reset', (req, res) => {
  dayTradeActive = false;
  if (dayTradeInterval) clearInterval(dayTradeInterval);
  dayTradeInterval = null;
  // Reset engine
  dayTrader.capital = dayTrader.startCapital;
  dayTrader.positions = {};
  dayTrader.priceHistory = {};
  dayTrader.trades = [];
  dayTrader.equityCurve = [];
  dayTrader.totalWins = 0;
  dayTrader.totalLosses = 0;
  dayTrader.dayPnL = 0;
  res.json({ status: 'reset' });
});

// ============================================
// AI ASSISTENT — Google Gemini
// ============================================
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const SYSTEM_PROMPT = `Je bent de FlowInvest AI-assistent, een vriendelijke en kalme beleggingsadviseur.

Je taak:
- Help gebruikers met vragen over beleggen, hun portfolio en financiële keuzes
- Geef rustig, begrijpelijk advies in het Nederlands
- Gebruik simpele taal, geen jargon
- Wees eerlijk over risico's
- Moedig lange-termijn denken aan
- Als je portfolio data krijgt, gebruik die in je antwoord

Wat FlowInvest doet (leg dit simpel uit als ernaar gevraagd wordt):
- FlowInvest belegt automatisch voor je. Jij kiest hoeveel je wilt inleggen en hoe avontuurlijk je wilt beleggen, de rest doet de app.
- De app spreidt je geld over de sterkste aandelen en past dit automatisch aan.
- Er zit een beschermingssysteem in: als de markt daalt, wordt een deel van je geld automatisch naar veiligere beleggingen verschoven. Hoe groter de daling, hoe meer bescherming. Bij herstel gaat het weer terug.
- Er is een stop-loss: bij meer dan 10% verlies wordt je gewaarschuwd.
- De app houdt de markt continu in de gaten en maakt automatisch aanpassingen als dat nodig is.
- Er zijn 4 profielen: Voorzichtig, Gebalanceerd, Ambitieus en Maximaal. Hoe avontuurlijker, hoe meer in aandelen en hoe minder snel er beschermd wordt.
- Bij het Maximaal profiel selecteert de app automatisch de best presterende aandelen.

Wat je NIET moet vertellen (dit is intern):
- Noem geen specifieke technische termen zoals RSI, SMA, Moving Averages, momentum-rotatie
- Noem niet dat er elke 10 minuten gecheckt wordt
- Noem niet de exacte percentages van de beschermingsdrempels (-2%, -5%, -10%)
- Noem Alpaca, Finnhub of andere technische systemen niet
- Leg niet uit hoe de code of backend werkt
- Als iemand vraagt hoe het precies werkt, zeg dan: "FlowInvest gebruikt slimme technologie om de markt te analyseren en je geld te beschermen. De details zijn ons geheim, maar je kunt erop vertrouwen dat het systeem continu voor je werkt."

Modi:
- Simulatie: oefenen met nepgeld en echte koersen, ideaal om te beginnen
- Paper Trading: oefenen met virtueel geld via een echte broker, alles werkt zoals echt maar zonder risico
- Live Trading: beleggen met echt geld (binnenkort beschikbaar)
- Gebruikers beginnen altijd in simulatie en kunnen later upgraden naar paper trading of live

Portfolios:
- Gebruikers kunnen meerdere simulatie-portfolio's hebben met elk een eigen strategie
- Er kan maximaal één paper trading portfolio tegelijk actief zijn
- Elk portfolio heeft eigen inleg, doel, horizon en risicoprofiel
- Je kunt geld storten, opnemen en maandelijks automatisch bijstorten

Stijl:
- Kort en bondig (max 3-4 zinnen)
- Vriendelijk en geruststellend
- Spreek de gebruiker aan met "je"
- Praat als een betrouwbare financieel adviseur, niet als een robot
- Als je iets niet weet, zeg dat eerlijk`;

app.post('/api/chat', async (req, res) => {
  try {
    const { message, portfolioContext } = req.body;
    if (!message) return res.status(400).json({ error: 'Geen bericht' });

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    let prompt = SYSTEM_PROMPT;
    if (portfolioContext) {
      prompt += `\n\nDe gebruiker heeft deze portfolio:\n${portfolioContext}`;
    }
    prompt += `\n\nGebruiker: ${message}\nAssistent:`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    res.json({ response });
  } catch (err) {
    console.error('Gemini error:', err.message, err.stack);
    res.status(500).json({ error: 'AI niet beschikbaar', detail: err.message });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// SERVER START
// ============================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`FlowInvest API draait op http://localhost:${PORT}`);
  if (FINNHUB_API_KEY === 'JOUW_API_KEY_HIER') {
    console.log('⚠️  Vergeet niet je Finnhub API key in te stellen!');
    console.log('   Ga naar https://finnhub.io/register voor een gratis key.');
    console.log('   Start dan met: FINNHUB_API_KEY=jouw_key node server/index.js');
  }
});
