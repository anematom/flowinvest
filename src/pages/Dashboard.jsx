import { useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { fetchPortfolio, fetchStocks, fetchCrypto, fetchStockHistory, fetchAlpacaAccount, fetchAlpacaPositions, alpacaAutoTrade, alpacaEmergencyStop, alpacaEmergencyResume, fetchEmergencyStatus } from '../data/marketApi';
import { loadPortfolioHoldings, savePortfolioHoldings } from '../data/supabase';
import { buildPortfolio, buildUltraPortfolio, buildCryptoPortfolio, getPortfolioTotals, isUltraMode, isCryptoMode } from '../data/portfolioAllocator';
import {
  analyzeMarket,
  analyzeUltraMarket,
  getSmartAllocation,
  calculateRebalance,
  checkStopLoss,
  getMarketMessage,
  getUltraMessage,
  formatLastCheck,
  CRYPTO_THRESHOLDS,
} from '../data/smartAI';
import { MoneyModal, EditModal } from './SettingsModal';
import '../styles/Dashboard.css';

const PIE_COLORS = ['#4CAF50', '#66BB6A', '#81C784', '#A5D6A7', '#C8E6C9'];
const ULTRA_COLORS = ['#9C27B0', '#AB47BC', '#CE93D8', '#E1BEE7', '#F3E5F5'];
const CHECK_INTERVAL = 60 * 1000;      // 1 minuut (was 10 min — snellere reactie)
const PRICE_REFRESH = 15 * 1000;       // 15 seconden (was 30 sec)

export default function Dashboard({ settings, user, portfolios, activeIndex, brokerMode, alpacaKeys, onNavigate, onUpdateSettings, onSwitchPortfolio, onAddPortfolio, onDeletePortfolio }) {
  const [marketData, setMarketData] = useState(null);
  const [alpacaAccount, setAlpacaAccount] = useState(null);
  const [alpacaPositions, setAlpacaPositions] = useState([]);
  const [alpacaTradeResult, setAlpacaTradeResult] = useState(null);
  const [emergencyStopped, setEmergencyStopped] = useState(false);
  const [liveMode, setLiveMode] = useState(true);
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
  const portfolioId = settings.id;
  const [dbLoaded, setDbLoaded] = useState(false);

  const [portfolioHistory, setPortfolioHistoryState] = useState([]);
  const [serverHealthy, setServerHealthy] = useState(true);
  const healthFailRef = useRef(0);

  // Cache per portfolio ID — alleen lezen, nooit schrijven vanuit andere portfolio
  const cacheRef = useRef({});
  const prevPortfolioIdRef = useRef(null);

  // Server health check — elke 2 minuten
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          healthFailRef.current = 0;
          setServerHealthy(true);
        } else {
          throw new Error('not ok');
        }
      } catch {
        healthFailRef.current += 1;
        if (healthFailRef.current >= 2) {
          setServerHealthy(false);
        }
      }
    }
    checkHealth();
    const id = setInterval(checkHealth, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Laad holdings en history uit Supabase bij portfolio switch
  useEffect(() => {
    // Sla huidige data op in cache van het VORIGE portfolio
    if (prevPortfolioIdRef.current && prevPortfolioIdRef.current !== portfolioId) {
      cacheRef.current[prevPortfolioIdRef.current] = {
        virtualPortfolio, liveTotals, marketAnalysis, aiMessage, trades, aiLog, lastCheck,
      };
    }
    prevPortfolioIdRef.current = portfolioId;

    setDbLoaded(false);

    // Probeer uit cache te laden
    const cached = portfolioId ? cacheRef.current[portfolioId] : null;
    if (cached) {
      setVirtualPortfolio(cached.virtualPortfolio);
      setLiveTotals(cached.liveTotals);
      setMarketAnalysis(cached.marketAnalysis);
      setAiMessage(cached.aiMessage);
      setTrades(cached.trades);
      setAiLog(cached.aiLog);
      setLastCheck(cached.lastCheck);
    } else {
      setVirtualPortfolio(null);
      setLiveTotals(null);
      setMarketAnalysis(null);
      setAiMessage(null);
      setTrades([]);
      setAiLog([]);
      setLastCheck(null);
    }
    setLastPriceUpdate(null);
    setPortfolioHistoryState([]);
    prevValueRef.current = null;

    // Laad uit Supabase
    dbHoldingsRef.current = null;
    if (portfolioId) {
      loadPortfolioHoldings(portfolioId).then(data => {
        if (data) {
          if (data.history && data.history.length > 0 && !cached) {
            setPortfolioHistoryState(data.history);
          }
          if (data.holdings && data.holdings.length > 0) {
            dbHoldingsRef.current = data.holdings;
          }
        }
        setDbLoaded(true);
      }).catch(() => setDbLoaded(true));
    } else {
      setDbLoaded(true);
    }
  }, [portfolioId]);

  // Alpaca data laden en auto-traden in paper/live mode
  useEffect(() => {
    if (brokerMode !== 'paper' && brokerMode !== 'live') return;
    async function loadAlpaca() {
      try {
        const [account, positions, emergencyStatus] = await Promise.all([
          fetchAlpacaAccount(),
          fetchAlpacaPositions(),
          fetchEmergencyStatus(),
        ]);
        setAlpacaAccount(account);
        setAlpacaPositions(positions);
        setEmergencyStopped(emergencyStatus.stopped);
      } catch (err) {
        console.error('Alpaca laden mislukt:', err);
      }
    }
    loadAlpaca();
    const dataInterval = setInterval(loadAlpaca, 30000);

    // Auto-trade elke 10 minuten
    async function runAutoTrade() {
      try {
        const keysWithMode = alpacaKeys ? { ...alpacaKeys, live: brokerMode === 'live' } : alpacaKeys;
        const result = await alpacaAutoTrade(settings.risk, settings.amount, keysWithMode);
        setAlpacaTradeResult(result);
        loadAlpaca(); // Herlaad data na trades
      } catch (err) {
        console.error('Auto-trade mislukt:', err);
      }
    }
    runAutoTrade();
    const tradeInterval = setInterval(runAutoTrade, 10 * 60 * 1000);

    return () => {
      clearInterval(dataInterval);
      clearInterval(tradeInterval);
    };
  }, [brokerMode, settings.risk]);

  const saveTimerRef = useRef(null);
  const dbHoldingsRef = useRef(null);

  function setPortfolioHistory(updater) {
    setPortfolioHistoryState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const filtered = next.filter(s => s.value > 0 && s.value > settings.amount * 0.1);
      const limited = filtered.slice(-200);

      // Sla op naar Supabase (met debounce — max elke 30 sec)
      if (portfolioId) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          savePortfolioHoldings(portfolioId, null, limited).catch(() => {});
        }, 30000);
      }
      return limited;
    });
  }
  const [activeModal, setActiveModal] = useState(null);
  const [tradeSignals, setTradeSignals] = useState([]);
  const [stockAnalyses, setStockAnalyses] = useState({});
  const intervalRef = useRef(null);
  const priceIntervalRef = useRef(null);
  const prevValueRef = useRef(null);

  // Technische analyse — laadt indicators lazy om crashes te voorkomen
  async function runTechnicalAnalysis(portfolio) {
    if (!portfolio || portfolio.length === 0) return;
    try {
      const indicators = await import('../data/indicators');
      const symbols = portfolio.filter(h => !h.isDefensive).map(h => h.symbol);
      const historyData = await fetchStockHistory(symbols, 3);

      const analyses = {};
      for (const symbol of symbols) {
        const closes = historyData[symbol];
        if (closes && closes.length > 20) {
          const currentPrice = closes[closes.length - 1];
          analyses[symbol] = indicators.analyzeStock(closes, currentPrice);
        }
      }
      setStockAnalyses(analyses);
      setTradeSignals(indicators.generateTradeActions(portfolio, analyses));
    } catch {
      // Historische data niet beschikbaar
    }
  }

  // Core: fetch data, analyze, and rebalance
  const runSmartCheck = useCallback(async () => {
    // Wacht tot holdings uit database geladen zijn
    if (!dbLoaded) return;

    try {
      if (isCryptoMode(settings.risk)) {
        // === CRYPTO MODUS ===
        const cryptoQuotes = await fetchCrypto();

        const validQuotes = cryptoQuotes.filter(q => q.price != null);
        if (validQuotes.length < 2) return;
        setMarketData(cryptoQuotes);

        // Use same analysis as ultra but for crypto
        const avgChange = validQuotes.reduce((sum, q) => sum + (q.changePercent || 0), 0) / validQuotes.length;
        let mode = 'normal';
        if (avgChange <= -10) mode = 'crisis';
        else if (avgChange <= -5) mode = 'panic';
        else if (avgChange <= -2) mode = 'defense';
        else if (avgChange >= 3) mode = 'recovery';

        setMarketAnalysis({ mode, avgChange, winners: validQuotes.filter(q => (q.changePercent || 0) > 0).length, losers: validQuotes.filter(q => (q.changePercent || 0) < 0).length });
        setCurrentMode(mode);

        let savedHoldings = dbHoldingsRef.current;
        let portfolio;
        if (savedHoldings && savedHoldings.length > 0) {
          portfolio = savedHoldings.map(h => {
            const quote = cryptoQuotes.find(q => q.symbol === h.symbol);
            const currentPrice = quote?.price || h.buyPrice;
            const currentValue = h.shares * currentPrice;
            const gain = currentValue - h.invested;
            const gainPercent = h.invested > 0 ? ((gain / h.invested) * 100) : 0;
            return { ...h, price: currentPrice, currentValue, gain, gainPercent, changePercent: quote?.changePercent || 0 };
          });
        } else {
          portfolio = buildCryptoPortfolio(settings.amount, cryptoQuotes);
          const holdingsToSave = portfolio.map(h => ({
            symbol: h.symbol, name: h.name, description: h.description,
            weight: h.weight, rank: h.rank, shares: h.shares,
            invested: h.invested, buyPrice: h.price, highPrice: h.price, isCrypto: true,
          }));
          dbHoldingsRef.current = holdingsToSave;
          if (portfolioId) {
            savePortfolioHoldings(portfolioId, holdingsToSave, null).catch(() => {});
          }
        }

        setVirtualPortfolio(portfolio);
        const totals = getPortfolioTotals(portfolio, settings.amount);
        setLiveTotals(totals);

        const msg = avgChange >= 0
          ? { type: 'good', title: 'Crypto markt stabiel', message: `Gemiddelde verandering: ${avgChange.toFixed(1)}%. Je crypto portfolio wordt actief beheerd.` }
          : { type: 'caution', title: 'Crypto markt daalt', message: `Gemiddelde verandering: ${avgChange.toFixed(1)}%. Crypto is volatiel — schommelingen zijn normaal.` };
        setAiMessage(msg);
        setTrades([]);

        const now = new Date();
        setLastCheck(now);
        setPortfolioHistory(prev => [...prev, {
          date: now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          value: parseFloat(totals.totalValue.toFixed(2)),
        }]);

        if (portfolio) runTechnicalAnalysis(portfolio);
      } else if (isUltraMode(settings.risk)) {
        // === ULTRA MODUS: Losse aandelen ===
        const stockQuotes = await fetchStocks();

        // Beveilig: alleen doorgaan als we betrouwbare data hebben
        const validQuotes = stockQuotes.filter(q => q.price != null && q.changePercent != null);
        if (validQuotes.length < 3) {
          console.warn('Te weinig betrouwbare koersdata, overslaan');
          return;
        }
        setMarketData(stockQuotes);

        // 1. Analyseer aandelen
        const analysis = analyzeUltraMarket(validQuotes);
        setMarketAnalysis(analysis);
        setCurrentMode(analysis.mode);

        // 2. Bouw portfolio met huidige top 5 — roteer als nodig
        let savedHoldings = dbHoldingsRef.current;

        // Altijd nieuw portfolio bouwen met huidige top 5
        const freshPortfolio = buildUltraPortfolio(settings.amount, stockQuotes, analysis.defensiveShift);

        let portfolio;
        if (savedHoldings && savedHoldings.length > 0) {
          // Behoud aankoopprijzen voor aandelen die er nog in zitten
          portfolio = freshPortfolio.map(h => {
            const existing = savedHoldings.find(s => s.symbol === h.symbol);
            if (existing) {
              // Aandeel zat er al in — behoud originele aankoopprijs
              const currentPrice = h.price;
              const currentValue = existing.shares * currentPrice;
              const gain = currentValue - existing.invested;
              const gainPercent = existing.invested > 0 ? ((gain / existing.invested) * 100) : 0;
              return { ...h, shares: existing.shares, invested: existing.invested, buyPrice: existing.buyPrice, currentValue, gain, gainPercent };
            }
            // Nieuw aandeel (geroteerd) — koopt tegen huidige prijs
            return h;
          });
        } else {
          portfolio = freshPortfolio;
        }

        // Sla holdings op naar Supabase
        const holdingsToSave = portfolio.map(h => ({
          symbol: h.symbol, name: h.name, description: h.description,
          weight: h.weight, rank: h.rank, shares: h.shares,
          invested: h.invested, buyPrice: h.buyPrice || h.price, highPrice: h.highPrice || h.price, isDefensive: h.isDefensive || false,
        }));
        dbHoldingsRef.current = holdingsToSave;
        if (portfolioId) {
          savePortfolioHoldings(portfolioId, holdingsToSave, null).catch(() => {});
        }
        setVirtualPortfolio(portfolio);
        const totals = getPortfolioTotals(portfolio, settings.amount);
        setLiveTotals(totals);
        if (portfolio) runTechnicalAnalysis(portfolio);

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

        // Beveilig: alleen doorgaan als we betrouwbare data hebben
        const validETFs = quotes.filter(q => q.price != null && q.changePercent != null);
        if (validETFs.length < 2) {
          console.warn('Te weinig betrouwbare koersdata, overslaan');
          return;
        }
        setMarketData(quotes);

        // 1. Analyseer de markt
        const analysis = analyzeMarket(validETFs);
        setMarketAnalysis(analysis);

        // 2. Bepaal slimme allocatie
        const smartAllocation = getSmartAllocation(settings.risk, analysis.mode);
        setCurrentMode(analysis.mode);

        // 3. Bouw portfolio met huidige allocatie — behoud aankoopprijzen
        let savedETF = dbHoldingsRef.current;

        const allocArray = Object.entries(smartAllocation).map(([symbol, weight]) => {
          const quote = quotes.find(q => q.symbol === symbol);
          return { symbol, name: quote?.name || symbol, weight };
        });

        let portfolio = allocArray.map(item => {
          const quote = quotes.find(q => q.symbol === item.symbol);
          if (!quote || !quote.price) {
            return { ...item, shares: 0, invested: 0, currentValue: 0, gain: 0, gainPercent: 0 };
          }
          const existing = savedETF?.find(s => s.symbol === item.symbol);
          if (existing) {
            const currentValue = existing.shares * quote.price;
            const gain = currentValue - existing.invested;
            const gainPercent = existing.invested > 0 ? ((gain / existing.invested) * 100) : 0;
            return { ...item, shares: existing.shares, invested: existing.invested, buyPrice: existing.buyPrice, currentValue, gain, gainPercent, price: quote.price, changePercent: quote.changePercent };
          }
          const invested = settings.amount * item.weight;
          const shares = invested / quote.price;
          return { ...item, shares, invested, currentValue: shares * quote.price, gain: 0, gainPercent: 0, price: quote.price, changePercent: quote.changePercent };
        });

        const etfHoldingsToSave = portfolio.map(h => ({
          symbol: h.symbol, name: h.name, weight: h.weight,
          shares: h.shares, invested: h.invested, buyPrice: h.buyPrice || h.price, highPrice: h.highPrice || h.price,
        }));
        dbHoldingsRef.current = etfHoldingsToSave;
        if (portfolioId) {
          savePortfolioHoldings(portfolioId, etfHoldingsToSave, null).catch(() => {});
        }

        setVirtualPortfolio(portfolio);
        const totals = getPortfolioTotals(portfolio, settings.amount);
        setLiveTotals(totals);
        if (portfolio) runTechnicalAnalysis(portfolio);

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
  }, [settings.amount, settings.risk, dbLoaded]);

  // Snelle price refresh (elke 30 sec) — alleen koersen updaten
  const refreshPrices = useCallback(async () => {
    if (!virtualPortfolio) return;
    try {
      const quotes = isUltraMode(settings.risk) ? await fetchStocks() : await fetchPortfolio();

      // Beveilig: als geen betrouwbare data, behoud huidige waarden
      const validCount = quotes.filter(q => q.price != null).length;
      if (validCount < 2) return;
      setMarketData(quotes);

      // Update portfolio met nieuwe prijzen maar behoud huidige allocatie
      const updated = virtualPortfolio.map(holding => {
        const quote = quotes.find(q => q.symbol === holding.symbol);
        if (!quote || !quote.price) return holding;

        const currentValue = holding.shares * quote.price;
        const gain = currentValue - holding.invested;
        const gainPercent = holding.invested > 0 ? (gain / holding.invested) * 100 : 0;

        // Track hoogste prijs voor trailing stop-loss
        const highPrice = Math.max(holding.highPrice || holding.buyPrice || quote.price, quote.price);

        return {
          ...holding,
          currentValue,
          gain,
          gainPercent,
          price: quote.price,
          highPrice,
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

  // Summary — paper trading gebruikt dezelfde berekening als simulatie
  let summary;
  if (liveTotals) {
    summary = {
      currentValue: liveTotals.totalValue,
      gainLoss: liveTotals.totalGain,
      gainLossPercent: liveTotals.totalGainPercent.toFixed(2),
      isPositive: liveTotals.isPositive,
      status: aiMessage?.message || 'Laden...',
      currency: '€',
    };
  } else {
    summary = {
      currentValue: null, // null = nog aan het laden
      gainLoss: 0,
      gainLossPercent: '0.00',
      isPositive: true,
      status: 'Marktdata wordt geladen...',
      currency: '€',
      loading: true,
    };
  }
  const cur = summary.currency || '€';

  // Chart data
  const chartData = portfolioHistory.length > 1
    ? portfolioHistory
    : [{ date: 'Start', value: settings.amount }, { date: 'Nu', value: settings.amount }];

  return (
    <div className="dashboard">
      {!serverHealthy && (
        <div className="server-warning">
          De FlowInvest server is tijdelijk niet bereikbaar. Je geld staat veilig bij je broker (Alpaca). Je kunt altijd inloggen op alpaca.markets om je posities te bekijken of te verkopen. We zijn bezig met herstel.
        </div>
      )}
      {/* Header */}
      <div className="dash-header">
        <div>
          <img src="/logo.png" alt="FlowInvest" className="dash-logo" />
        </div>
      </div>

      {/* Portfolio switcher */}
      {portfolios && portfolios.length > 0 && (
        <div className="portfolio-switcher">
          {portfolios.map((p, i) => (
            <button
              key={p.id || i}
              className={`portfolio-tab ${i === activeIndex ? 'active' : ''} ${(p.broker_mode || 'simulation') !== 'simulation' ? 'broker' : ''}`}
              onClick={() => onSwitchPortfolio(i)}
            >
              <span className="tab-mode-dot" style={{ background: p.broker_mode === 'paper' ? '#9C27B0' : p.broker_mode === 'live' ? '#4CAF50' : '#2196F3' }} />
              {p.name || `Portfolio ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Live trading warning */}
      {brokerMode === 'live' && (
        <div className="live-warning">
          <span className="live-warning-icon">&#9888;</span>
          Je belegt met echt geld. Alle trades worden uitgevoerd op de beurs.
        </div>
      )}

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

      {/* Trading signalen */}
      {tradeSignals.length > 0 && (
        <div className="signals-card">
          <h3 className="signals-title">Trading Signalen</h3>
          {tradeSignals.map((signal, i) => (
            <div key={i} className={`signal-item signal-${signal.type}`}>
              <div className="signal-top">
                <span className="signal-action">{signal.action}</span>
                <span className="signal-symbol">{signal.symbol}</span>
              </div>
              <span className="signal-reason">{signal.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* Technische analyse per aandeel */}
      {Object.keys(stockAnalyses).length > 0 && (
        <div className="signals-card">
          <h3 className="signals-title">Technische Analyse</h3>
          <div className="analysis-grid">
            {Object.entries(stockAnalyses).map(([symbol, analysis]) => (
              <div key={symbol} className="analysis-item">
                <span className="analysis-symbol">{symbol}</span>
                <div className="analysis-signals">
                  {analysis.signals.map((s, i) => (
                    <span key={i} className={`analysis-tag tag-${s.type}`}>{s.text}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Balance card — toont Alpaca data in paper mode, anders simulatie */}
      <div className={`balance-card ${summary.loading ? 'balance-neutral' : summary.isPositive ? 'balance-positive' : 'balance-negative'}`}>
        <p className="balance-label">Jouw vermogen</p>
        <span className={`dashboard-mode-badge ${brokerMode}`}>
          {brokerMode === 'paper' ? 'Paper Trading' : brokerMode === 'live' ? 'Live Trading' : 'Simulatie'}
        </span>
        {summary.loading ? (
          <div style={{ margin: '16px 0 8px' }}><span className="skeleton-block" /></div>
        ) : (
          <>
            <h1 className={`balance-amount ${priceFlash ? `flash-${priceFlash}` : ''}`}>
              {cur}{summary.currentValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h1>
            <div className={`balance-change ${summary.isPositive ? 'positive' : 'negative'}`}>
              {summary.isPositive ? '↑' : '↓'} {cur}{Math.abs(summary.gainLoss).toFixed(2)} ({summary.isPositive ? '+' : ''}{summary.gainLossPercent}%)
            </div>
          </>
        )}
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
        <span className="status-text">
          {!summary.loading && !summary.isPositive && liveTotals
            ? `Je portfolio staat ${Math.abs(parseFloat(summary.gainLossPercent)).toFixed(1)}% onder je inleg. ${aiMessage?.message || 'De markt kan schommelen — dit is normaal.'}`
            : summary.status}
        </span>
      </div>

      {virtualPortfolio && (
        <div className="portfolio-section">
          <h3 className="section-title">
            {isCryptoMode(settings.risk)
              ? `Top 5 Crypto — €${settings.amount} belegd`
              : isUltraMode(settings.risk)
              ? `Top 5 Aandelen — €${settings.amount} belegd`
              : `Jouw portfolio — €${settings.amount} verdeeld`
            }
            {currentMode !== 'normal' && (
              <span className="mode-badge" style={{ background: modeColors[currentMode] }}>
                {modeLabels[currentMode]}
              </span>
            )}
          </h3>

          {isCryptoMode(settings.risk) && (
            <div className="ultra-badge-bar">
              <span className="ultra-badge" style={{ background: '#FF9800' }}>CRYPTO</span>
              <span className="ultra-desc">AI selecteert de sterkste crypto</span>
            </div>
          )}
          {!isCryptoMode(settings.risk) && isUltraMode(settings.risk) && (
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
                className={`holding-card ${isUltraMode(settings.risk) ? 'ultra' : ''} ${holding.gain >= 0 ? 'gain-positive' : 'gain-negative'}`}
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
          {!marketData ? (
            <div className="error-card">
              Kan geen verbinding maken met de server.<br />
              Start de backend met: <code>node server/index.js</code>
            </div>
          ) : null}
        </div>
      )}

      {/* Chart */}
      <div className="chart-card">
        <div className="chart-header">
          <h3>Portfolio verloop</h3>
          <button
            className="chart-reset-btn"
            onClick={() => {
              setPortfolioHistoryState([]);
              if (portfolioId) savePortfolioHoldings(portfolioId, null, []).catch(() => {});
            }}
            title="Grafiek resetten"
          >
            Reset
          </button>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={250}>
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
                tickFormatter={v => `${cur}${v}`}
                width={65}
                domain={['dataMin', 'dataMax']}
              />
              <Tooltip
                formatter={v => [
                  `${cur}${typeof v === 'number' ? v.toFixed(2) : v}`,
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

      {/* Section separator */}
      <div className="section-separator" />

      {/* Performance section */}
      {virtualPortfolio && liveTotals && (() => {
        const best = virtualPortfolio.reduce((a, b) => (a.gainPercent > b.gainPercent ? a : b), virtualPortfolio[0]);
        const worst = virtualPortfolio.reduce((a, b) => (a.gainPercent < b.gainPercent ? a : b), virtualPortfolio[0]);
        const avgDailyChange = virtualPortfolio.reduce((sum, h) => sum + (h.changePercent || 0), 0) / virtualPortfolio.length;
        return (
          <div className="performance-grid">
            <div className="performance-card">
              <div className="perf-label">Totaal rendement</div>
              <div className={`perf-value ${liveTotals.totalGainPercent >= 0 ? 'positive' : 'negative'}`}>
                {liveTotals.totalGainPercent >= 0 ? '+' : ''}{liveTotals.totalGainPercent.toFixed(2)}%
              </div>
              <div className="perf-detail">Sinds start</div>
            </div>
            <div className="performance-card">
              <div className="perf-label">Beste aandeel</div>
              <div className={`perf-value ${best.gainPercent >= 0 ? 'positive' : 'negative'}`}>
                {best.gainPercent >= 0 ? '+' : ''}{best.gainPercent.toFixed(2)}%
              </div>
              <div className="perf-detail">{best.symbol}</div>
            </div>
            <div className="performance-card">
              <div className="perf-label">Slechtste aandeel</div>
              <div className={`perf-value ${worst.gainPercent >= 0 ? 'positive' : 'negative'}`}>
                {worst.gainPercent >= 0 ? '+' : ''}{worst.gainPercent.toFixed(2)}%
              </div>
              <div className="perf-detail">{worst.symbol}</div>
            </div>
            <div className="performance-card">
              <div className="perf-label">Dagverandering</div>
              <div className={`perf-value ${avgDailyChange >= 0 ? 'positive' : 'negative'}`}>
                {avgDailyChange >= 0 ? '+' : ''}{avgDailyChange.toFixed(2)}%
              </div>
              <div className="perf-detail">Gemiddeld vandaag</div>
            </div>
          </div>
        );
      })()}

      {/* Section separator */}
      <div className="section-separator" />

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
        {!isCryptoMode(settings.risk) && (
          <>
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
                {settings.risk === 'low' ? 'Voorzichtig' : settings.risk === 'medium' ? 'Gebalanceerd' : settings.risk === 'high' ? 'Ambitieus' : settings.risk === 'crypto' ? 'Crypto' : 'Maximaal'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {activeModal === 'money' && (
        <MoneyModal
          settings={settings}
          userId={user?.id}
          portfolioId={settings.id}
          brokerMode={brokerMode}
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
      {/* Noodstop — alleen bij paper/live trading */}
      {brokerMode !== 'simulation' && (
        <div className="emergency-section">
          {emergencyStopped ? (
            <button className="emergency-btn resume" onClick={async () => {
              await alpacaEmergencyResume();
              setEmergencyStopped(false);
            }}>
              Hervat automatisch beleggen
            </button>
          ) : (
            <button className="emergency-btn stop" onClick={async () => {
              if (confirm('Weet je zeker dat je wilt pauzeren?\n\nDe AI stopt tijdelijk met handelen. Je beleggingen blijven gewoon staan. Je kunt op elk moment weer hervatten.')) {
                await alpacaEmergencyStop();
                setEmergencyStopped(true);
              }
            }}>
              Pauzeer automatisch beleggen
            </button>
          )}
          {emergencyStopped && (
            <p className="emergency-info">Automatisch beleggen is gepauzeerd. Je beleggingen blijven gewoon staan.</p>
          )}
        </div>
      )}

      <div className="bottom-nav">
        <button className="nav-btn active" onClick={() => onNavigate('dashboard')}>
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
