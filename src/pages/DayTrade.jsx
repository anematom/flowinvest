import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import '../styles/DayTrade.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://flowinvest.onrender.com/api';

export default function DayTrade({ onNavigate }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const intervalRef = useRef(null);

  async function fetchStatus() {
    try {
      const res = await fetch(`${API_BASE}/daytrade/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Fout bij ophalen daytrade status:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  async function handleAction(action) {
    setActionLoading(action);
    try {
      await fetch(`${API_BASE}/daytrade/${action}`, { method: 'POST' });
      await fetchStatus();
    } catch (err) {
      console.error(`Fout bij ${action}:`, err);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="daytrade-page">
        <div className="daytrade-loading">
          <p>Day Trading laden...</p>
        </div>
      </div>
    );
  }

  const isRunning = status?.running ?? false;
  const equity = status?.equity ?? 10000;
  const totalReturn = status?.total_return_pct ?? 0;
  const dayPL = status?.day_pl ?? 0;
  const winRate = status?.win_rate ?? 0;
  const totalTrades = status?.total_trades ?? 0;
  const equityCurve = status?.equity_curve ?? [];
  const positions = status?.positions ?? [];
  const recentTrades = status?.recent_trades ?? [];
  const dataPoints = status?.data_points ?? {};

  return (
    <div className="daytrade-page">
      {/* Header */}
      <div className="daytrade-header">
        <h1>Day Trading Demo</h1>
        <div className={`daytrade-status-badge ${isRunning ? 'running' : 'stopped'}`}>
          <span className="status-dot" />
          {isRunning ? 'Running' : 'Gestopt'}
        </div>
      </div>

      {/* Controls */}
      <div className="daytrade-controls">
        <button
          className="dt-btn dt-btn-start"
          onClick={() => handleAction('start')}
          disabled={isRunning || actionLoading}
        >
          {actionLoading === 'start' ? '...' : '▶ Start'}
        </button>
        <button
          className="dt-btn dt-btn-stop"
          onClick={() => handleAction('stop')}
          disabled={!isRunning || actionLoading}
        >
          {actionLoading === 'stop' ? '...' : '■ Stop'}
        </button>
        <button
          className="dt-btn dt-btn-reset"
          onClick={() => handleAction('reset')}
          disabled={isRunning || actionLoading}
        >
          {actionLoading === 'reset' ? '...' : '↺ Reset'}
        </button>
      </div>

      {/* Stats */}
      <div className="daytrade-stats">
        <div className="dt-stat-card">
          <span className="dt-stat-label">Equity</span>
          <span className="dt-stat-value">€{equity.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="dt-stat-card">
          <span className="dt-stat-label">Totaal rendement</span>
          <span className={`dt-stat-value ${totalReturn >= 0 ? 'positive' : 'negative'}`}>
            {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
          </span>
        </div>
        <div className="dt-stat-card">
          <span className="dt-stat-label">Dag P/L</span>
          <span className={`dt-stat-value ${dayPL >= 0 ? 'positive' : 'negative'}`}>
            {dayPL >= 0 ? '+' : ''}€{dayPL.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="dt-stat-card">
          <span className="dt-stat-label">Win rate</span>
          <span className="dt-stat-value">{winRate.toFixed(1)}%</span>
        </div>
        <div className="dt-stat-card">
          <span className="dt-stat-label">Totaal trades</span>
          <span className="dt-stat-value">{totalTrades}</span>
        </div>
      </div>

      {/* Equity curve chart */}
      <div className="daytrade-card">
        <h2 className="dt-card-title">Equity Curve</h2>
        {equityCurve.length > 1 ? (
          <div className="dt-chart-container">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={equityCurve}>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: '#78909C' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#78909C' }}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={v => `€${v.toLocaleString('nl-NL')}`}
                />
                <Tooltip
                  formatter={v => [`€${Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, 'Equity']}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  stroke="#4CAF50"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="dt-empty">Nog geen data — start de bot om de equity curve te zien.</p>
        )}
      </div>

      {/* Open positions */}
      <div className="daytrade-card">
        <h2 className="dt-card-title">Open posities</h2>
        {positions.length > 0 ? (
          <div className="dt-positions-list">
            {positions.map((pos, i) => (
              <div key={i} className="dt-position-row">
                <div className="dt-position-info">
                  <span className="dt-position-symbol">{pos.symbol}</span>
                  <span className="dt-position-qty">{pos.qty} stuks @ €{Number(pos.entry_price).toFixed(2)}</span>
                </div>
                <span className={`dt-position-pl ${(pos.unrealized_pl ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                  {(pos.unrealized_pl ?? 0) >= 0 ? '+' : ''}€{Number(pos.unrealized_pl ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="dt-empty">Geen open posities</p>
        )}
      </div>

      {/* Recent trades */}
      <div className="daytrade-card">
        <h2 className="dt-card-title">Recente trades</h2>
        {recentTrades.length > 0 ? (
          <div className="dt-trades-list">
            {recentTrades.map((trade, i) => (
              <div key={i} className="dt-trade-row">
                <div className="dt-trade-info">
                  <span className={`dt-trade-side ${trade.side}`}>
                    {trade.side === 'buy' ? 'KOOP' : 'VERKOOP'}
                  </span>
                  <span className="dt-trade-symbol">{trade.symbol}</span>
                  <span className="dt-trade-qty">{trade.qty}x @ €{Number(trade.price).toFixed(2)}</span>
                </div>
                <div className="dt-trade-meta">
                  {trade.reason && <span className="dt-trade-reason">{trade.reason}</span>}
                  {trade.time && <span className="dt-trade-time">{trade.time}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="dt-empty">Nog geen trades uitgevoerd</p>
        )}
      </div>

      {/* Data points */}
      {Object.keys(dataPoints).length > 0 && (
        <div className="daytrade-card">
          <h2 className="dt-card-title">Data punten per symbool</h2>
          <div className="dt-datapoints-list">
            {Object.entries(dataPoints).map(([symbol, count]) => (
              <div key={symbol} className="dt-datapoint-row">
                <span className="dt-datapoint-symbol">{symbol}</span>
                <span className="dt-datapoint-count">{count} punten</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div className="bottom-nav">
        <button className="nav-btn" onClick={() => onNavigate('dashboard')}>
          <span className="nav-icon">📊</span>
          <span>Dashboard</span>
        </button>
        <button className="nav-btn" onClick={() => onNavigate('calculator')}>
          <span className="nav-icon">🔢</span>
          <span>Calculator</span>
        </button>
        <button className="nav-btn" onClick={() => onNavigate('assistant')}>
          <span className="nav-icon">💬</span>
          <span>Assistent</span>
        </button>
        <button className="nav-btn" onClick={() => onNavigate('profile')}>
          <span className="nav-icon">👤</span>
          <span>Profiel</span>
        </button>
      </div>
    </div>
  );
}
