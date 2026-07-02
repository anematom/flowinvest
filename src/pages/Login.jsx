import { useState } from 'react';
import { signIn, signUp, resetPasswordForEmail } from '../data/supabase';
import '../styles/Login.css';

export default function Login({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');

  function clearMessages() {
    setError('');
    setConfirmMessage('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      if (mode === 'register') {
        const data = await signUp(email, password);
        if (data.user && !data.session) {
          setConfirmMessage('Check je e-mail om je account te bevestigen!');
        } else if (data.session) {
          onAuth(data.user);
        }
      } else if (mode === 'forgot') {
        await resetPasswordForEmail(email);
        setConfirmMessage('Check je e-mail! We hebben je een link gestuurd om je wachtwoord te resetten.');
      } else {
        const data = await signIn(email, password);
        onAuth(data.user);
      }
    } catch (err) {
      if (err.message.includes('Invalid login')) {
        setError('Onjuist e-mailadres of wachtwoord');
      } else if (err.message.includes('already registered')) {
        setError('Dit e-mailadres is al geregistreerd');
      } else if (err.message.includes('Password should be')) {
        setError('Wachtwoord moet minimaal 6 tekens zijn');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  const subtitle = mode === 'register'
    ? 'Maak een account aan'
    : mode === 'forgot'
      ? 'Reset je wachtwoord'
      : 'Log in op je account';

  const submitLabel = mode === 'register'
    ? 'Account aanmaken'
    : mode === 'forgot'
      ? 'Verstuur reset-link'
      : 'Inloggen';

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo.png" alt="FlowInvest" className="login-logo" />
        <p className="login-tagline">Beleggen zonder gedoe</p>
        <p className="login-subtitle">{subtitle}</p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="E-mailadres"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          {mode !== 'forgot' && (
            <input
              type="password"
              placeholder="Wachtwoord"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          )}

          {error && <div className="login-error">{error}</div>}
          {confirmMessage && <div className="login-confirm">{confirmMessage}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Even geduld...' : submitLabel}
          </button>
        </form>

        {mode === 'login' && (
          <button
            className="login-forgot"
            onClick={() => { setMode('forgot'); clearMessages(); }}
          >
            Wachtwoord vergeten?
          </button>
        )}

        <button
          className="login-switch"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            clearMessages();
          }}
        >
          {mode === 'register'
            ? 'Al een account? Log in'
            : mode === 'forgot'
              ? 'Terug naar inloggen'
              : 'Nog geen account? Registreer'}
        </button>
      </div>
    </div>
  );
}
