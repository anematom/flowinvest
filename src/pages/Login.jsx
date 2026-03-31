import { useState } from 'react';
import { signIn, signUp } from '../data/supabase';
import '../styles/Login.css';

export default function Login({ onAuth }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setConfirmMessage('');
    setLoading(true);

    try {
      if (isRegister) {
        const data = await signUp(email, password);
        if (data.user && !data.session) {
          setConfirmMessage('Check je e-mail om je account te bevestigen!');
        } else if (data.session) {
          onAuth(data.user);
        }
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

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🌱</div>
        <h1>FlowInvest</h1>
        <p className="login-subtitle">
          {isRegister ? 'Maak een account aan' : 'Log in op je account'}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="E-mailadres"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Wachtwoord"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && <div className="login-error">{error}</div>}
          {confirmMessage && <div className="login-confirm">{confirmMessage}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Even geduld...' : isRegister ? 'Account aanmaken' : 'Inloggen'}
          </button>
        </form>

        <button
          className="login-switch"
          onClick={() => { setIsRegister(!isRegister); setError(''); setConfirmMessage(''); }}
        >
          {isRegister ? 'Al een account? Log in' : 'Nog geen account? Registreer'}
        </button>
      </div>
    </div>
  );
}
