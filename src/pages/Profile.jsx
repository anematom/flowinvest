import { useState } from 'react';
import { savePortfolio } from '../data/supabase';
import '../styles/Profile.css';

const modeLabels = {
  simulation: 'Simulatie',
  paper: 'Paper Trading',
  live: 'Live Trading',
};

const modeColors = {
  simulation: '#2196F3',
  paper: '#9C27B0',
  live: '#4CAF50',
};

export default function Profile({ user, portfolios, activeIndex, alpacaConnected, onNavigate, onLogout, onUpdatePortfolios, onDeletePortfolio, onAddPortfolio, onSwitchPortfolio }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [showNewPortfolio, setShowNewPortfolio] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMode, setNewMode] = useState('simulation');

  function startEdit(portfolio, index) {
    setEditingId(index);
    setEditName(portfolio.name || '');
  }

  async function saveName(index) {
    if (!editName.trim()) return;
    const portfolio = portfolios[index];
    const updated = [...portfolios];
    updated[index] = { ...portfolio, name: editName.trim() };
    onUpdatePortfolios(updated);

    if (portfolio.id && user) {
      try {
        await savePortfolio(user.id, { ...portfolio, name: editName.trim() });
      } catch (err) {
        console.error('Fout bij opslaan naam:', err);
      }
    }
    setEditingId(null);
  }

  const hasPaperPortfolio = portfolios.some(p => p.broker_mode === 'paper');
  const hasLivePortfolio = portfolios.some(p => p.broker_mode === 'live');

  function handleCreatePortfolio() {
    if (!newName.trim()) return;
    if (newMode === 'paper' && hasPaperPortfolio) return;
    if (newMode === 'live' && hasLivePortfolio) return;

    if (newMode === 'live') {
      const confirmed = confirm(
        '⚠️ LET OP: Je staat op het punt een Live Trading portfolio aan te maken.\n\n' +
        '• Alle trades worden uitgevoerd met ECHT geld.\n' +
        '• Je kunt geld verliezen — er is geen garantie op winst.\n' +
        '• FlowInvest is niet aansprakelijk voor eventuele verliezen.\n\n' +
        'Weet je zeker dat je wilt doorgaan?'
      );
      if (!confirmed) return;
    }

    onAddPortfolio(newName.trim(), newMode);
    setShowNewPortfolio(false);
    setNewName('');
    setNewMode('simulation');
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-avatar">
          {user.email?.[0]?.toUpperCase() || '?'}
        </div>
        <h1>Mijn profiel</h1>
      </div>

      <div className="profile-card">
        <div className="profile-row">
          <span className="profile-label">E-mail</span>
          <span className="profile-value">{user.email}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Lid sinds</span>
          <span className="profile-value">
            {new Date(user.created_at).toLocaleDateString('nl-NL', {
              day: 'numeric', month: 'long', year: 'numeric'
            })}
          </span>
        </div>
      </div>

      {/* Broker status */}
      <div className={`broker-status ${alpacaConnected ? 'connected' : ''}`}>
        <span className="broker-status-icon">{alpacaConnected ? '✓' : '○'}</span>
        <div>
          <span className="broker-status-title">{alpacaConnected ? 'Verbonden met Alpaca' : 'Geen broker verbonden'}</span>
          <span className="broker-status-desc">{alpacaConnected ? 'Je kunt paper trading en live trading gebruiken' : 'Verbind een broker om echt te beleggen'}</span>
        </div>
      </div>

      {/* Portfolio's */}
      <h2 className="profile-section-title">Mijn portfolio's</h2>
      <div className="profile-card">
        {portfolios && portfolios.map((p, i) => (
          <div key={p.id || i} className="profile-row portfolio-row">
            {editingId === i ? (
              <div className="portfolio-edit-row">
                <input
                  type="text"
                  className="portfolio-name-input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  maxLength={30}
                  autoFocus
                />
                <button className="portfolio-save-btn" onClick={() => saveName(i)}>Opslaan</button>
                <button className="portfolio-cancel-btn" onClick={() => setEditingId(null)}>Annuleer</button>
              </div>
            ) : (
              <button className="portfolio-select-row" onClick={() => onSwitchPortfolio(i)}>
                <div className="portfolio-info">
                  <div className="portfolio-name-row">
                    <span className="portfolio-mode-dot" style={{ background: modeColors[p.broker_mode || 'simulation'] }} />
                    <span className="profile-value">{p.name || `Portfolio ${i + 1}`}</span>
                    {i === activeIndex && <span className="portfolio-active-badge">Actief</span>}
                  </div>
                  <span className="portfolio-detail">
                    {modeLabels[p.broker_mode || 'simulation']} — €{(p.amount || 0).toLocaleString('nl-NL')}
                  </span>
                </div>
                <div className="portfolio-actions" onClick={e => e.stopPropagation()}>
                  <button className="portfolio-edit-btn" onClick={() => startEdit(p, i)}>✎</button>
                  {portfolios.length > 1 && (
                    <button className="portfolio-delete-btn" onClick={() => {
                      const mode = p.broker_mode || 'simulation';
                      let msg = 'Weet je zeker dat je dit portfolio wilt verwijderen?';
                      if (mode === 'paper' || mode === 'live') {
                        msg += '\n\nLet op: je posities bij Alpaca blijven staan. Log in op alpaca.markets om ze te beheren.';
                      }
                      if (confirm(msg)) onDeletePortfolio(i);
                    }}>✕</button>
                  )}
                </div>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Nieuw portfolio */}
      {!showNewPortfolio ? (
        <button className="new-portfolio-btn" onClick={() => setShowNewPortfolio(true)}>
          + Nieuw portfolio aanmaken
        </button>
      ) : (
        <div className="profile-card new-portfolio-card">
          <h3 className="new-portfolio-title">Nieuw portfolio</h3>

          <input
            type="text"
            className="portfolio-name-input full-width"
            placeholder="Naam voor je portfolio..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            maxLength={30}
            autoFocus
          />

          <p className="new-portfolio-label">Kies je modus:</p>
          <div className="mode-options">
            <button
              className={`mode-option ${newMode === 'simulation' ? 'selected' : ''}`}
              onClick={() => setNewMode('simulation')}
            >
              <span className="mode-option-dot" style={{ background: '#2196F3' }} />
              <div>
                <span className="mode-option-title">Simulatie</span>
                <span className="mode-option-desc">Oefen met nepgeld en echte koersen</span>
              </div>
            </button>
            <button
              className={`mode-option ${newMode === 'paper' ? 'selected' : ''}`}
              onClick={() => !hasPaperPortfolio && setNewMode('paper')}
              disabled={hasPaperPortfolio}
            >
              <span className="mode-option-dot" style={{ background: hasPaperPortfolio ? '#E0E0E0' : '#9C27B0' }} />
              <div>
                <span className="mode-option-title">Paper Trading</span>
                <span className="mode-option-desc">{hasPaperPortfolio ? 'Je hebt al een paper trading portfolio' : 'Oefen met virtueel geld via een echte broker'}</span>
              </div>
            </button>
            <button
              className={`mode-option ${newMode === 'live' ? 'selected' : ''}`}
              onClick={() => !hasLivePortfolio && alpacaConnected && setNewMode('live')}
              disabled={hasLivePortfolio || !alpacaConnected}
            >
              <span className="mode-option-dot" style={{ background: (hasLivePortfolio || !alpacaConnected) ? '#E0E0E0' : '#4CAF50' }} />
              <div>
                <span className="mode-option-title">Live Trading</span>
                <span className="mode-option-desc">
                  {hasLivePortfolio
                    ? 'Je hebt al een live trading portfolio'
                    : !alpacaConnected
                    ? 'Verbind eerst je Alpaca account'
                    : 'Beleg met echt geld via Alpaca'}
                </span>
              </div>
            </button>
          </div>

          <div className="new-portfolio-actions">
            <button className="portfolio-save-btn" onClick={handleCreatePortfolio} disabled={!newName.trim()}>Aanmaken</button>
            <button className="portfolio-cancel-btn" onClick={() => { setShowNewPortfolio(false); setNewName(''); }}>Annuleer</button>
          </div>
        </div>
      )}

      <p className="profile-hint">
        Wil je echt geld beleggen? Maak een nieuw portfolio aan en kies Paper Trading om eerst te oefenen met een echte broker.
      </p>

      {/* Geavanceerde strategieën */}
      <h2 className="profile-section-title">Geavanceerde strategieën</h2>
      <div className="advanced-warning">
        Deze strategieën zijn aanzienlijk risicovoller dan normaal beleggen. Je kunt je volledige inleg verliezen.
      </div>
      <div className="profile-card">
        <button className="advanced-strategy clickable" onClick={() => {
          if (confirm('Let op: Crypto is zeer volatiel. Je kunt je volledige inleg verliezen.\n\nDe waarde kan binnen uren met 20% of meer dalen. Beleg alleen met geld dat je kunt missen.\n\nWil je doorgaan?')) {
            onAddPortfolio('Crypto Portfolio', 'simulation', 'crypto');
          }
        }}>
          <div className="advanced-strategy-left">
            <span className="advanced-icon">₿</span>
            <div>
              <span className="advanced-title">Crypto Trading</span>
              <span className="advanced-desc">Bitcoin, Ethereum en andere cryptovaluta. Hoge volatiliteit, 24/7 markt.</span>
            </div>
          </div>
          <span className="advanced-badge crypto">Start</span>
        </button>
        <div className="advanced-strategy">
          <div className="advanced-strategy-left">
            <span className="advanced-icon">⚡</span>
            <div>
              <span className="advanced-title">Opties</span>
              <span className="advanced-desc">Hefboom op aandelen. Hoge winsten mogelijk, maar ook 100% verlies.</span>
            </div>
          </div>
          <span className="advanced-badge coming">Binnenkort</span>
        </div>
        <button className="advanced-strategy clickable" onClick={() => {
          if (confirm('Let op: Day Trading is zeer risicovol. 92% van day traders verliest geld.\n\nJe kunt je volledige inleg verliezen. Dit is een demo om de strategie te verkennen.\n\nWil je doorgaan?')) {
            onNavigate('daytrade');
          }
        }}>
          <div className="advanced-strategy-left">
            <span className="advanced-icon">⏱️</span>
            <div>
              <span className="advanced-title">Day Trading</span>
              <span className="advanced-desc">Kopen en verkopen binnen één dag. Vereist ervaring — 92% verliest geld.</span>
            </div>
          </div>
          <span className="advanced-badge crypto">Start</span>
        </button>
      </div>

      <button className="logout-btn" onClick={onLogout}>
        Uitloggen
      </button>

      {/* Bottom nav */}
      <div className="bottom-nav">
        <button className="nav-btn" onClick={() => onNavigate('dashboard')}>
          <span className="nav-icon">📊</span>
          <span>Dashboard</span>
        </button>
        <button className="nav-btn" onClick={() => onNavigate('assistant')}>
          <span className="nav-icon">💬</span>
          <span>Assistent</span>
        </button>
        <button className="nav-btn active" onClick={() => onNavigate('profile')}>
          <span className="nav-icon">👤</span>
          <span>Profiel</span>
        </button>
      </div>
    </div>
  );
}
