import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURATIE - Vul hier je Finnhub API key in
// Gratis te verkrijgen op: https://finnhub.io/register
// ============================================
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// ============================================
// ALPACA — Paper Trading
// ============================================
const ALPACA_KEY = process.env.ALPACA_KEY || '';
const ALPACA_SECRET = process.env.ALPACA_SECRET || '';
const ALPACA_BASE = 'https://paper-api.alpaca.markets/v2';

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
// ALPACA ROUTES
// ============================================

// Account info (saldo, koopkracht)
app.get('/api/alpaca/account', async (req, res) => {
  try {
    const data = await alpacaFetch('/account');
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
    const positions = await alpacaFetch('/positions');
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
  defenseMode: -2.0,
  panicMode: -5.0,
  crisisMode: -10.0,
  recoveryMode: 1.5,
  stopLoss: -10.0,
  takeProfit: 15.0,
  buyDip: -3.0,
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

    const { risk = 'ultra', amount } = req.body;

    // 1. Haal account info en huidige posities op
    const [account, positions, stockQuotes] = await Promise.all([
      alpacaFetch('/account'),
      alpacaFetch('/positions'),
      Promise.all(
        MOMENTUM_STOCKS.map(async (stock) => {
          try {
            const data = await finnhubFetch(`/quote?symbol=${stock.symbol}`);
            return { ...stock, price: data.c, changePercent: data.dp, previousClose: data.pc };
          } catch { return null; }
        })
      ),
    ]);

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

    // 4. Top 5 aandelen op basis van momentum
    const top5 = validQuotes
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5);

    const trades = [];
    const weights = [0.30, 0.25, 0.20, 0.15, 0.10];

    // 5. Check stop-loss en take-profit op bestaande posities
    for (const pos of positions) {
      const plPercent = parseFloat(pos.unrealized_plpc) * 100;
      const symbol = pos.symbol;

      if (plPercent <= TRADE_THRESHOLDS.stopLoss) {
        try {
          const result = await placeOrder(
            { symbol, qty: pos.qty, side: 'sell', type: 'market', time_in_force: 'day' },
            `Stop-loss: ${plPercent.toFixed(1)}% verlies`
          );
          if (!result.skipped) trades.push({ symbol, action: 'STOP_LOSS', reason: `${plPercent.toFixed(1)}% verlies`, amount: pos.qty });
        } catch (e) { console.error('Stop-loss fout:', e.message); }
        continue;
      }

      if (plPercent >= TRADE_THRESHOLDS.takeProfit) {
        const sellQty = (parseFloat(pos.qty) / 2).toFixed(4);
        try {
          const result = await placeOrder(
            { symbol, qty: sellQty, side: 'sell', type: 'market', time_in_force: 'day' },
            `Take-profit: +${plPercent.toFixed(1)}% winst`
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
            const result = await placeOrder(
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
            const result = await placeOrder(
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
            const result = await placeOrder(
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
          const result = await placeOrder(
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
