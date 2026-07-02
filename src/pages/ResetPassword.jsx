import { useState } from 'react';
import { updatePassword, signOut } from '../data/supabase';
import '../styles/Login.css';

export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Wachtwoord moet minimaal 6 tekens zijn');
      return;
    }
    if (password !== confirm) {
      setError('Wachtwoorden komen niet overeen');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Kon wachtwoord niet bijwerken');
    } finally {
      setLoading(false);
    }
  }

  async function handleBackToLogin() {
    await signOut();
    onDone();
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo.png" alt="FlowInvest" className="login-logo" />
        <p className="login-tagline">Beleggen zonder gedoe</p>
        <p className="login-subtitle">
          {success ? 'Wachtwoord bijgewerkt' : 'Kies een nieuw wachtwoord'}
        </p>

        {success ? (
          <>
            <div className="login-confirm">
              Je wachtwoord is aangepast. Log opnieuw in met je nieuwe wachtwoord.
            </div>
            <button className="login-btn" onClick={handleBackToLogin} style={{ marginTop: 16 }}>
              Naar inloggen
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="Nieuw wachtwoord"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <input
              type="password"
              placeholder="Herhaal wachtwoord"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={6}
            />

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Even geduld...' : 'Wachtwoord opslaan'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
