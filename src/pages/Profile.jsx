import '../styles/Profile.css';

export default function Profile({ user, onNavigate, onLogout }) {
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
