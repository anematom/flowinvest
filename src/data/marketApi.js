const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
