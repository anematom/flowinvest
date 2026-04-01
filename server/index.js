import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURATIE - Vul hier je Finnhub API key in
// Gratis te verkrijgen op: https://finnhub.io/register
// ============================================
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd76003pr01qm4b7sdp1gd76003pr01qm4b7sdp20';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// Helper: fetch met error handling
async function finnhubFetch(endpoint) {
  const url = `${FINNHUB_BASE}${endpoint}&token=${FINNHUB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub error: ${res.status}`);
  return res.json();
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

// Alle ETF quotes in één keer
app.get('/api/portfolio', async (req, res) => {
  try {
    const quotes = await Promise.all(
      DEFAULT_ETFS.map(async (etf) => {
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
// LOSSE AANDELEN — Momentum strategie
// ============================================
const MOMENTUM_STOCKS = [
  { symbol: 'NVDA', name: 'NVIDIA', description: 'AI chips & GPU marktleider' },
  { symbol: 'AAPL', name: 'Apple', description: 'Consumer tech gigant' },
  { symbol: 'MSFT', name: 'Microsoft', description: 'Cloud & AI software' },
  { symbol: 'GOOGL', name: 'Alphabet', description: 'Google — zoeken & cloud' },
  { symbol: 'AMZN', name: 'Amazon', description: 'E-commerce & AWS cloud' },
  { symbol: 'META', name: 'Meta', description: 'Social media & VR' },
  { symbol: 'TSLA', name: 'Tesla', description: 'EV & energie' },
  { symbol: 'AMD', name: 'AMD', description: 'Chips & processors' },
  { symbol: 'AVGO', name: 'Broadcom', description: 'Semiconductors & infra' },
  { symbol: 'CRM', name: 'Salesforce', description: 'Cloud CRM & AI' },
];

// Haal quotes op voor alle momentum aandelen en sorteer op prestatie
// Inclusief BND (obligaties) voor defensieve verschuiving in ultra modus
app.get('/api/stocks', async (req, res) => {
  try {
    const allSymbols = [...MOMENTUM_STOCKS, { symbol: 'BND', name: 'Obligaties', description: 'Total Bond Market — veilige haven' }];
    const quotes = await Promise.all(
      allSymbols.map(async (stock) => {
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
      MOMENTUM_STOCKS.map(async (stock) => {
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
    const symbols = req.query.symbols ? req.query.symbols.split(',') : MOMENTUM_STOCKS.map(s => s.symbol);
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
// AI ASSISTENT — Google Gemini
// ============================================
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBDz-nDbUN982702bg7g3ZEPVSKxJsO21k';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const SYSTEM_PROMPT = `Je bent de FlowInvest AI-assistent, een vriendelijke en kalme beleggingsadviseur.

Je taak:
- Help gebruikers met vragen over beleggen, hun portfolio en financiële keuzes
- Geef rustig, begrijpelijk advies in het Nederlands
- Gebruik simpele taal, geen jargon
- Wees eerlijk over risico's
- Moedig lange-termijn denken aan
- Als je portfolio data krijgt, gebruik die in je antwoord

Stijl:
- Kort en bondig (max 3-4 zinnen)
- Vriendelijk en geruststellend
- Geen financieel advies disclaimer nodig, dit is een simulatie
- Spreek de gebruiker aan met "je"`;

app.post('/api/chat', async (req, res) => {
  try {
    const { message, portfolioContext } = req.body;
    if (!message) return res.status(400).json({ error: 'Geen bericht' });

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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
