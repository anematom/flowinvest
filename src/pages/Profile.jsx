import { useState } from 'react';
import { savePortfolio } from '../data/supabase';
import '../styles/Profile.css';

export default function Profile({ user, portfolios, brokerMode, onNavigate, onLogout, onUpdatePortfolios, onDeletePortfolio, onSetBrokerMode }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

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

  const modeLabels = {
    simulation: 'Simulatie',
    paper: 'Paper Trading',
    live: 'Live Trading',
  };

  const modeDescriptions = {
    simulation: 'Oefen met nepgeld en echte koersen',
    paper: 'Oefen met $100.000 virtueel geld via Alpaca',
    live: 'Beleg met echt geld via Alpaca',
  };

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

      {/* Broker koppeling */}
      <h2 className="profile-section-title">Beleggingsmodus</h2>
      <div className="profile-card">
        {['simulation', 'paper', 'live'].map(mode => (
          <button
            key={mode}
            className={`profile-row broker-option ${brokerMode === mode ? 'active' : ''}`}
            onClick={() => onSetBrokerMode(mode)}
          >
            <div className="broker-option-left">
              <span className={`broker-dot ${brokerMode === mode ? 'active' : ''}`} />
              <div>
                <span className="profile-value">{modeLabels[mode]}</span>
                <span className="portfolio-detail">{modeDescriptions[mode]}</span>
              </div>
            </div>
            {mode === 'live' && <span className="broker-badge">Binnenkort</span>}
          </button>
        ))}
      </div>

      {brokerMode === 'paper' && (
        <div className="broker-info">
          Je bent verbonden met Alpaca Paper Trading. Je hebt $100.000 virtueel geld om mee te oefenen.
        </div>
      )}

      {/* Portfolio beheer */}
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
              <>
                <div className="portfolio-info">
                  <span className="profile-value">{p.name || `Portfolio ${i + 1}`}</span>
                  <span className="portfolio-detail">
                    €{(p.amount || 0).toLocaleString('nl-NL')}
                  </span>
                </div>
                <div className="portfolio-actions">
                  <button className="portfolio-edit-btn" onClick={() => startEdit(p, i)}>✎</button>
                  {portfolios.length > 1 && (
                    <button className="portfolio-delete-btn" onClick={() => onDeletePortfolio(i)}>✕</button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
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
