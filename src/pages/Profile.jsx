import { useState } from 'react';
import { savePortfolio } from '../data/supabase';
import '../styles/Profile.css';

export default function Profile({ user, portfolios, onNavigate, onLogout, onUpdatePortfolios, onDeletePortfolio }) {
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

  return (
    <div className="profile-page">
      <div className="profile-header">
        <span className="profile-avatar">
          {user.email?.[0]?.toUpperCase() || '?'}
        </span>
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
