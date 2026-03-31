import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Assistant from './pages/Assistant';
import { supabase, loadUserSettings, saveUserSettings, signOut } from './data/supabase';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [page, setPage] = useState('loading');

  // Check of gebruiker al ingelogd is
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadSettings(session.user.id);
      } else {
        setPage('login');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
        setSettings(null);
        setPage('login');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadSettings(userId) {
    try {
      const data = await loadUserSettings(userId);
      if (data) {
        setSettings({
          amount: data.amount,
          goal: data.goal,
          horizon: data.horizon,
          risk: data.risk,
        });
        setPage('dashboard');
      } else {
        setPage('onboarding');
      }
    } catch {
      setPage('onboarding');
    }
  }

  function handleAuth(authUser) {
    setUser(authUser);
    loadSettings(authUser.id);
  }

  async function handleOnboardingComplete(userSettings) {
    setSettings(userSettings);
    setPage('dashboard');
    if (user) {
      await saveUserSettings(user.id, userSettings);
    }
  }

  async function handleUpdateSettings(newSettings) {
    setSettings(newSettings);
    if (user) {
      await saveUserSettings(user.id, newSettings);
    }
  }

  async function handleReset() {
    setSettings(null);
    setPage('onboarding');
  }

  async function handleLogout() {
    await signOut();
    setUser(null);
    setSettings(null);
    setPage('login');
  }

  function handleNavigate(target) {
    setPage(target);
  }

  if (page === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F9F8' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🌱</div>
          <p style={{ color: '#78909C', marginTop: 12 }}>Laden...</p>
        </div>
      </div>
    );
  }

  if (page === 'login' || !user) {
    return <Login onAuth={handleAuth} />;
  }

  if (page === 'onboarding' || !settings) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (page === 'assistant') {
    return <Assistant onNavigate={handleNavigate} />;
  }

  return (
    <Dashboard
      settings={settings}
      user={user}
      onNavigate={handleNavigate}
      onReset={handleReset}
      onUpdateSettings={handleUpdateSettings}
      onLogout={handleLogout}
    />
  );
}

export default App;
