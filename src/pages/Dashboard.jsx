import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { fetchPortfolio, fetchHistory, fetchStocks } from '../data/marketApi';
import { buildPortfolio, buildUltraPortfolio, getPortfolioTotals, isUltraMode } from '../data/portfolioAllocator';
import {
  analyzeMarket,
  analyzeUltraMarket,
  getSmartAllocation,
  calculateRebalance,
  checkStopLoss,
  getMarketMessage,
  getUltraMessage,
  formatLastCheck,
} from '../data/smartAI';
import { MoneyModal, EditModal } from './SettingsModal';
import '../styles/Dashboard.css';

const PIE_COLORS = ['#4CAF50', '#66BB6A', '#81C784', '#A5D6A7', '#C8E6C9'];
const ULTRA_COLORS = ['#9C27B0', '#AB47BC', '#CE93D8', '#E1BEE7', '#F3E5F5'];
const CHECK_INTERVAL = 10 * 60 * 1000; // 10 minuten
const PRICE_REFRESH = 30 * 1000;       // 30 seconden

export default function Dashboard({ settings, user, onNavigate, onUpdateSettings }) {
  const [marketData, setMarketData] = useState(null);
  const [selectedETF, setSelectedETF] = useState('SPY');
  const [etfHistory, setEtfHistory] = useState(null);
  const [liveMode, setLiveMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [virtualPortfolio, setVirtualPortfolio] = useState(null);
  const [liveTotals, setLiveTotals] = useState(null);

  // Smart AI state
  const [marketAnalysis, setMarketAnalysis] = useState(null);
  const [aiMessage, setAiMessage] = useState(null);
  const [trades, setTrades] = useState([]);
  const [lastCheck, setLastCheck] = useState(null);
  const [currentMode, setCurrentMode] = useState('normal');
  const [aiLog, setAiLog] = useState([]);
  const [lastPriceUpdate, setLastPriceUpdate] = useState(null);
  const [priceFlash, setPriceFlash] = useState(null); // 'up' | 'down' | null
  const [portfolioHistory, setPortfolioHistoryState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('flowinvest_history')) || [];
    } catch { return []; }
  });

  function setPortfolioHistory(updater) {
    setPortfolioHistoryState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      localStorage.setItem('flowinvest_history', JSON.stringify(next));
      return next;
    });
  }
  const [activeModal, setActiveModal] = useState(null); // 'money' | 'goal' | 'horizon' | 'risk'
  const intervalRef = useRef(null);
  const priceIntervalRef = useRef(null);
  const prevValueRef = useRef(null);

  // Core: fetch data, analyze, and rebalance
  const runSmartCheck = useCallback(async () => {
    try {
      if (isUltraMode(settings.risk)) {
        // === ULTRA MODUS: Losse aandelen ===
        const stockQuotes = await fetchStocks();
        setMarketData(stockQuotes);

        // 1. Analyseer aandelen
        const analysis = analyzeUltraMarket(stockQuotes);
        setMarketAnalysis(analysis);
        setCurrentMode(analysis.mode);

        // 2. Bouw momentum portfolio (top 5) met defensieve verschuiving
        const portfolio = buildUltraPortfolio(settings.amount, stockQuotes, analysis.defensiveShift);
        setVirtualPortfolio(portfolio);
        const totals = getPortfolioTotals(portfolio, settings.amount);
        setLiveTotals(totals);

        // 3. Genereer AI-bericht
        const message = getUltraMessage(analysis, portfolio, totals.totalGainPercent);
        setAiMessage(message);
        setTrades([]);

        // 4. Log + eerste snapshot
        const now = new Date();
        setLastCheck(now);
        setPortfolioHistory(prev => [...prev, {
          date: now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          value: parseFloat(totals.totalValue.toFixed(2)),
        }]);
        setAiLog(prev => [
          {
            time: formatLastCheck(now),
            mode: analysis.mode,
            avgChange: analysis.avgChange,
            trades: 0,
            message: message.title,
          },
          ...prev.slice(0, 19),
        ]);
      } else {
        // === NORMAAL: ETF modus ===
        const quotes = await fetchPortfolio();
        setMarketData(quotes);

        // 1. Analyseer de markt
        const analysis = analyzeMarket(quotes);
        setMarketAnalysis(analysis);

        // 2. Bepaal slimme allocatie
        const smartAllocation = getSmartAllocation(settings.risk, analysis.mode);
        setCurrentMode(analysis.mode);

        // 3. Bouw portfolio met slimme allocatie
        const allocArray = Object.entries(smartAllocation).map(([symbol, weight]) => {
          const quote = quotes.find(q => q.symbol === symbol);
          return {
            symbol,
            name: quote?.name || symbol,
            weight,
          };
        });

        const portfolio = allocArray.map(item => {
          const quote = quotes.find(q => q.symbol === item.symbol);
          if (!quote || !quote.price) {
            return { ...item, shares: 0, invested: 0, currentValue: 0, gain: 0, gainPercent: 0 };
          }
          const invested = settings.amount * item.weight;
          const shares = invested / quote.previousClose;
          const currentValue = shares * quote.price;
          const gain = currentValue - invested;
          const gainPercent = invested > 0 ? (gain / invested) * 100 : 0;

          return {
            ...item,
            shares,
            invested,
            currentValue,
            gain,
            gainPercent,
            price: quote.price,
            changePercent: quote.changePercent,
          };
        });

        setVirtualPortfolio(portfolio);
        const totals = getPortfolioTotals(portfolio, settings.amount);
        setLiveTotals(totals);

        // 4. Check herbalancering
        const rebalanceTrades = calculateRebalance(portfolio, smartAllocation, totals.totalValue);
        setTrades(rebalanceTrades);

        // 5. Genereer AI-bericht
        const message = getMarketMessage(analysis, rebalanceTrades, totals.totalGainPercent);
        setAiMessage(message);

        // 6. Log + eerste snapshot
        const now = new Date();
        setLastCheck(now);
        setPortfolioHistory(prev => [...prev, {
          date: now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          value: parseFloat(totals.totalValue.toFixed(2)),
        }]);
        setAiLog(prev => [
          {
            time: formatLastCheck(now),
            mode: analysis.mode,
            avgChange: analysis.avgChange,
            trades: rebalanceTrades.length,
            message: message.title,
          },
          ...prev.slice(0, 19),
        ]);
      }
    } catch {
      // Server niet bereikbaar
    }
  }, [settings.amount, settings.risk]);

  // Snelle price refresh (elke 30 sec) — alleen koersen updaten
  const refreshPrices = useCallback(async () => {
    if (!virtualPortfolio) return;
    try {
      const quotes = isUltraMode(settings.risk) ? await fetchStocks() : await fetchPortfolio();
      setMarketData(quotes);

      // Update portfolio met nieuwe prijzen maar behoud huidige allocatie
      const updated = virtualPortfolio.map(holding => {
        const quote = quotes.find(q => q.symbol === holding.symbol);
        if (!quote || !quote.price) return holding;

        const currentValue = holding.shares * quote.price;
        const gain = currentValue - holding.invested;
        const gainPercent = holding.invested > 0 ? (gain / holding.invested) * 100 : 0;

        return {
          ...holding,
          currentValue,
          gain,
          gainPercent,
          price: quote.price,
          changePercent: quote.changePercent,
        };
      });

      setVirtualPortfolio(updated);
      const totals = getPortfolioTotals(updated, settings.amount);

      // Flash effect: vergelijk met vorige waarde
      if (prevValueRef.current !== null) {
        if (totals.totalValue > prevValueRef.current) setPriceFlash('up');
        else if (totals.totalValue < prevValueRef.current) setPriceFlash('down');
        else setPriceFlash(null);
        setTimeout(() => setPriceFlash(null), 1500);
      }
      prevValueRef.current = totals.totalValue;

      setLiveTotals(totals);
      const now = new Date();
      setLastPriceUpdate(now);

      // Sla snapshot op voor live grafiek
      setPortfolioHistory(prev => {
        const snapshot = {
          date: now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          value: parseFloat(totals.totalValue.toFixed(2)),
        };
        const updated = [...prev, snapshot];
        // Bewaar max 200 snapshots (~100 minuten aan data)
        return updated.slice(-200);
      });
    } catch {
      // Server niet bereikbaar
    }
  }, [virtualPortfolio, settings.amount, settings.risk]);

  // Start/stop 10-minuten interval (AI analyse)
  useEffect(() => {
    if (liveMode) {
      runSmartCheck(); // direct eerste check
      intervalRef.current = setInterval(runSmartCheck, CHECK_INTERVAL);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
      setMarketAnalysis(null);
      setAiMessage(null);
      setTrades([]);
      setPortfolioHistory([]);
      prevValueRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [liveMode, runSmartCheck]);

  // Start/stop 30-seconden price refresh
  useEffect(() => {
    if (liveMode && virtualPortfolio) {
      priceIntervalRef.current = setInterval(refreshPrices, PRICE_REFRESH);
    }
    return () => {
      if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
    };
  }, [liveMode, virtualPortfolio, refreshPrices]);

  // Fetch ETF history when selected
  useEffect(() => {
    if (!liveMode || !selectedETF) return;
    fetchHistory(selectedETF, 12)
      .then(result => setEtfHistory(result.data))
      .catch(() => setEtfHistory(null));
  }, [liveMode, selectedETF]);

  const goalLabels = {
    starter: 'Beginnen met beleggen',
    target: 'Sparen voor een doel',
    future: 'Bouwen aan de toekomst',
    idle: 'Geld niet laten stilstaan',
  };

  const modeLabels = {
    normal: 'Normaal',
    defense: 'Defensief',
    panic: 'Noodmodus',
    recovery: 'Herstel',
  };

  const modeColors = {
    normal: '#4CAF50',
    defense: '#FF9800',
    panic: '#F44336',
    recovery: '#2196F3',
  };

  // Summary
  const summary = liveTotals
    ? {
        currentValue: liveTotals.totalValue,
        gainLoss: liveTotals.totalGain,
        gainLossPercent: liveTotals.totalGainPercent.toFixed(2),
        isPositive: liveTotals.isPositive,
        status: aiMessage?.message || 'Laden...',
      }
    : {
        currentValue: settings.amount,
        gainLoss: 0,
        gainLossPercent: '0.00',
        isPositive: true,
        status: 'Marktdata wordt geladen...',
      };

  // Chart data
  const chartData = portfolioHistory.length > 1
    ? portfolioHistory
    : [{ date: 'Nu', value: settings.amount }];

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dash-header">
        <div>
          <span className="dash-logo">🌱</span>
          <span className="dash-title">FlowInvest</span>
        </div>
        <span className="mode-toggle live">● Live</span>
      </div>

      {/* Smart AI Status Bar */}
      {marketAnalysis && (
        <div className="ai-status-bar" style={{ borderLeftColor: modeColors[currentMode] }}>
          <div className="ai-status-top">
            <div className="ai-status-left">
              <span className="ai-status-dot" style={{ background: modeColors[currentMode] }} />
              <span className="ai-status-mode">AI Modus: {modeLabels[currentMode]}</span>
            </div>
            {lastCheck && (
              <span className="ai-last-check">
                Laatste check: {formatLastCheck(lastCheck)}
              </span>
            )}
          </div>
          {aiMessage && (
            <div className={`ai-message ai-message-${aiMessage.type}`}>
              <strong>{aiMessage.title}</strong>
              <p>{aiMessage.message}</p>
            </div>
          )}
          {trades.length > 0 && (
            <div className="ai-trades">
              <span className="ai-trades-title">Automatische aanpassingen:</span>
              {trades.map((trade, i) => (
                <div key={i} className="ai-trade">
                  <span className={`trade-action ${trade.action === 'KOOP' ? 'buy' : 'sell'}`}>
                    {trade.action}
                  </span>
                  <span className="trade-symbol">{trade.symbol}</span>
                  <span className="trade-amount">€{trade.amount.toFixed(2)}</span>
                  <span className="trade-weight">{trade.fromWeight}% → {trade.toWeight}%</span>
                </div>
              ))}
            </div>
          )}
          <div className="ai-interval-info">
            Volgende check over 10 minuten
            <button className="refresh-btn" onClick={runSmartCheck}>Nu checken</button>
          </div>
        </div>
      )}

      {/* Balance card */}
      <div className="balance-card">
        <p className="balance-label">Jouw vermogen</p>
        <h1 className={`balance-amount ${priceFlash ? `flash-${priceFlash}` : ''}`}>
          €{summary.currentValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </h1>
        <div className={`balance-change ${summary.isPositive ? 'positive' : 'negative'}`}>
          {summary.isPositive ? '↑' : '↓'} €{Math.abs(summary.gainLoss).toFixed(2)} ({summary.isPositive ? '+' : ''}{summary.gainLossPercent}%)
        </div>
        {lastPriceUpdate && (
          <div className="live-ticker">
            <span className="ticker-dot" />
            Live — update elke 30 sec — {formatLastCheck(lastPriceUpdate)}
          </div>
        )}
      </div>

      {/* Status message */}
      <div className={`status-card ${!summary.isPositive ? 'status-neutral' : ''}`}>
        <span className="status-icon">{summary.isPositive ? '✓' : 'ℹ'}</span>
        <span className="status-text">{summary.status}</span>
      </div>

      {/* Virtual Portfolio Allocation */}
      {virtualPortfolio && (
        <div className="portfolio-section">
          <h3 className="section-title">
            {isUltraMode(settings.risk)
              ? `Top 5 Aandelen — €${settings.amount} belegd`
              : `Jouw portfolio — €${settings.amount} verdeeld`
            }
            {currentMode !== 'normal' && (
              <span className="mode-badge" style={{ background: modeColors[currentMode] }}>
                {modeLabels[currentMode]}
              </span>
            )}
          </h3>

          {isUltraMode(settings.risk) && (
            <div className="ultra-badge-bar">
              <span className="ultra-badge">MAXIMAAL</span>
              <span className="ultra-desc">AI selecteert de sterkste aandelen</span>
            </div>
          )}

          {/* Pie chart */}
          <div className="allocation-chart">
            <PieChart width={160} height={160}>
              <Pie
                data={virtualPortfolio.filter(p => p.invested > 0)}
                dataKey="invested"
                nameKey="symbol"
                cx="50%"
                cy="50%"
                outerRadius={70}
                innerRadius={40}
              >
                {virtualPortfolio.map((_, i) => (
                  <Cell key={i} fill={isUltraMode(settings.risk) ? ULTRA_COLORS[i % ULTRA_COLORS.length] : PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </div>

          {/* Holdings list */}
          <div className="holdings-list">
            {virtualPortfolio.map((holding, i) => (
              <button
                key={holding.symbol}
                className={`holding-card ${selectedETF === holding.symbol ? 'selected' : ''} ${isUltraMode(settings.risk) ? 'ultra' : ''}`}
                onClick={() => setSelectedETF(holding.symbol)}
              >
                <div className="holding-left">
                  {isUltraMode(settings.risk) ? (
                    <div className="holding-rank">#{holding.rank || i + 1}</div>
                  ) : (
                    <div className="holding-color" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  )}
                  <div>
                    <div className="holding-symbol">{holding.symbol}</div>
                    <div className="holding-name">{holding.name}</div>
                    {isUltraMode(settings.risk) && holding.description && (
                      <div className="holding-desc">{holding.description}</div>
                    )}
                  </div>
                </div>
                <div className="holding-right">
                  <div className="holding-value">
                    €{holding.currentValue.toFixed(2)}
                  </div>
                  <div className={`holding-gain ${holding.gain >= 0 ? 'positive' : 'negative'}`}>
                    {holding.gain >= 0 ? '+' : ''}{holding.gainPercent.toFixed(2)}%
                  </div>
                  <div className="holding-weight">
                    {(holding.weight * 100).toFixed(0)}% van inleg
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading/Error for live mode */}
      {!virtualPortfolio && (
        <div className="market-section">
          {loading ? (
            <div className="loading-card">AI analyseert de markt...</div>
          ) : !marketData ? (
            <div className="error-card">
              Kan geen verbinding maken met de server.<br />
              Start de backend met: <code>node server/index.js</code>
            </div>
          ) : null}
        </div>
      )}

      {/* Chart */}
      <div className="chart-card">
        <h3>Portfolio verloop</h3>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#90A4AE' }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(chartData.length / 6)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#90A4AE' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `€${v}`}
                width={55}
                domain={['dataMin', 'dataMax']}
              />
              <Tooltip
                formatter={v => [
                  `€${typeof v === 'number' ? v.toFixed(2) : v}`,
                  'Waarde'
                ]}
                contentStyle={{
                  background: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  fontSize: 13,
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#4CAF50"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#4CAF50' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Activity Log */}
      {aiLog.length > 0 && (
        <div className="ai-log-card">
          <h3>AI Activiteit</h3>
          <div className="ai-log-list">
            {aiLog.map((entry, i) => (
              <div key={i} className="ai-log-entry">
                <span className="log-time">{entry.time}</span>
                <span className="log-dot" style={{ background: modeColors[entry.mode] }} />
                <span className="log-message">{entry.message}</span>
                {entry.trades > 0 && (
                  <span className="log-trades">{entry.trades} trades</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info cards */}
      <div className="info-grid">
        <div className="info-card clickable" onClick={() => setActiveModal('money')}>
          <span className="info-label">Inleg <span className="edit-icon">✎</span></span>
          <span className="info-value">€{settings.amount.toLocaleString('nl-NL')}</span>
        </div>
        <div className="info-card clickable" onClick={() => setActiveModal('goal')}>
          <span className="info-label">Doel <span className="edit-icon">✎</span></span>
          <span className="info-value">{goalLabels[settings.goal]}</span>
        </div>
        <div className="info-card clickable" onClick={() => setActiveModal('horizon')}>
          <span className="info-label">Horizon <span className="edit-icon">✎</span></span>
          <span className="info-value">{settings.horizon} jaar</span>
        </div>
        <div className="info-card clickable" onClick={() => setActiveModal('risk')}>
          <span className="info-label">Risico <span className="edit-icon">✎</span></span>
          <span className="info-value">
            {settings.risk === 'low' ? 'Voorzichtig' : settings.risk === 'medium' ? 'Gebalanceerd' : settings.risk === 'high' ? 'Ambitieus' : 'Maximaal'}
          </span>
        </div>
      </div>

      {/* Modals */}
      {activeModal === 'money' && (
        <MoneyModal
          settings={settings}
          userId={user?.id}
          onUpdate={onUpdateSettings}
          onClose={() => setActiveModal(null)}
        />
      )}
      {(activeModal === 'goal' || activeModal === 'horizon' || activeModal === 'risk') && (
        <EditModal
          field={activeModal}
          settings={settings}
          onUpdate={onUpdateSettings}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* Bottom nav */}
      <div className="bottom-nav">
        <button className="nav-btn active" onClick={() => onNavigate('dashboard')}>
          <span className="nav-icon">📊</span>
          <span>Dashboard</span>
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
