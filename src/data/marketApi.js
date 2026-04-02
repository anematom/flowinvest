const API_BASE = import.meta.env.VITE_API_URL || 'https://flowinvest.onrender.com/api';

export async function fetchQuote(symbol) {
  const res = await fetch(`${API_BASE}/quote/${symbol}`);
  if (!res.ok) throw new Error('Failed to fetch quote');
  return res.json();
}

export async function fetchHistory(symbol, months = 12) {
  const res = await fetch(`${API_BASE}/history/${symbol}?months=${months}`);
  if (!res.ok) throw new Error('Failed to fetch history');
  return res.json();
}

export async function fetchPortfolio() {
  const res = await fetch(`${API_BASE}/portfolio`);
  if (!res.ok) throw new Error('Failed to fetch portfolio');
  return res.json();
}

export async function fetchMarketStatus() {
  const res = await fetch(`${API_BASE}/market-status`);
  if (!res.ok) throw new Error('Failed to fetch market status');
  return res.json();
}

export async function fetchStocks() {
  const res = await fetch(`${API_BASE}/stocks`);
  if (!res.ok) throw new Error('Failed to fetch stocks');
  return res.json();
}

export async function fetchTopStocks(count = 5) {
  const res = await fetch(`${API_BASE}/stocks/top?count=${count}`);
  if (!res.ok) throw new Error('Failed to fetch top stocks');
  return res.json();
}

// ========== Alpaca ==========
export async function fetchAlpacaAccount() {
  const res = await fetch(`${API_BASE}/alpaca/account`);
  if (!res.ok) throw new Error('Failed to fetch Alpaca account');
  return res.json();
}

export async function fetchAlpacaPositions() {
  const res = await fetch(`${API_BASE}/alpaca/positions`);
  if (!res.ok) throw new Error('Failed to fetch Alpaca positions');
  return res.json();
}

export async function alpacaBuy(symbol, amount) {
  const res = await fetch(`${API_BASE}/alpaca/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, amount }),
  });
  if (!res.ok) throw new Error('Failed to buy');
  return res.json();
}

export async function alpacaSell(symbol, qty) {
  const res = await fetch(`${API_BASE}/alpaca/sell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, qty }),
  });
  if (!res.ok) throw new Error('Failed to sell');
  return res.json();
}

export async function alpacaAutoTrade(risk, amount, alpacaKeys) {
  const res = await fetch(`${API_BASE}/alpaca/auto-trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ risk, amount, alpacaKeys }),
  });
  if (!res.ok) throw new Error('Auto-trade mislukt');
  return res.json();
}

export async function alpacaEmergencyStop() {
  const res = await fetch(`${API_BASE}/alpaca/emergency-stop`, { method: 'POST' });
  return res.json();
}

export async function alpacaEmergencyResume() {
  const res = await fetch(`${API_BASE}/alpaca/emergency-resume`, { method: 'POST' });
  return res.json();
}

export async function fetchEmergencyStatus() {
  const res = await fetch(`${API_BASE}/alpaca/emergency-status`);
  return res.json();
}

export async function fetchAuditLog() {
  const res = await fetch(`${API_BASE}/alpaca/audit-log`);
  return res.json();
}

export async function fetchAlpacaOrders() {
  const res = await fetch(`${API_BASE}/alpaca/orders`);
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export async function fetchCrypto() {
  const res = await fetch(`${API_BASE}/crypto`);
  if (!res.ok) throw new Error('Failed to fetch crypto');
  return res.json();
}

export async function fetchStockHistory(symbols, months = 3) {
  const query = symbols ? `?symbols=${symbols.join(',')}&months=${months}` : `?months=${months}`;
  const res = await fetch(`${API_BASE}/stocks/history${query}`);
  if (!res.ok) throw new Error('Failed to fetch stock history');
  return res.json();
}
