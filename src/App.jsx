import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Assistant from './pages/Assistant';
import Profile from './pages/Profile';
import { supabase, loadPortfolios, savePortfolio, deletePortfolio, signOut } from './data/supabase';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState('loading');
  const [onboardingMode, setOnboardingMode] = useState(null); // { name, brokerMode }

  const activePortfolio = portfolios[activeIndex] || null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadData(session.user.id);
      } else {
        setPage('login');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
        setPortfolios([]);
        setPage('login');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadData(userId) {
    try {
      const data = await loadPortfolios(userId);
      if (data.length > 0) {
        // Zorg dat elk portfolio een broker_mode heeft
        const withMode = data.map(p => ({ broker_mode: 'simulation', ...p }));
        setPortfolios(withMode);
        setActiveIndex(0);
        setPage('dashboard');
      } else {
        // Eerste keer: altijd simulatie
        setOnboardingMode({ name: 'Mijn portfolio', brokerMode: 'simulation' });
        setPage('onboarding');
      }
    } catch {
      setOnboardingMode({ name: 'Mijn portfolio', brokerMode: 'simulation' });
      setPage('onboarding');
    }
  }

  function handleAuth(authUser) {
    setUser(authUser);
    loadData(authUser.id);
  }

  async function handleOnboardingComplete(userSettings) {
    const brokerMode = onboardingMode?.brokerMode || 'simulation';
    const name = userSettings.name || onboardingMode?.name || 'Mijn portfolio';
    const newPortfolio = { name, broker_mode: brokerMode, ...userSettings };

    if (user) {
      try {
        const saved = await savePortfolio(user.id, newPortfolio);
        if (saved && saved.id) {
          newPortfolio.id = saved.id;
          newPortfolio.user_id = user.id;
        }
      } catch (err) {
        console.error('Fout bij opslaan portfolio:', err);
      }
    }

    setPortfolios(prev => {
      const updated = [...prev, newPortfolio];
      const newIndex = updated.length - 1;
      setActiveIndex(newIndex);

      // Wis history en holdings voor het nieuwe portfolio
      const key = String(newPortfolio.id || newIndex);
      localStorage.removeItem('flowinvest_history_' + key);
      localStorage.removeItem('flowinvest_holdings_' + key);

      return updated;
    });
    setPage('dashboard');
    setOnboardingMode(null);
  }

  async function handleUpdateSettings(newSettings) {
    const updated = [...portfolios];
    updated[activeIndex] = { ...updated[activeIndex], ...newSettings };
    setPortfolios(updated);
    if (user) {
      await savePortfolio(user.id, updated[activeIndex]);
    }
  }

  function handleAddPortfolio(name, brokerMode) {
    setOnboardingMode({ name, brokerMode: brokerMode || 'simulation' });
    setPage('onboarding');
  }

  function handleSwitchPortfolio(index) {
    setActiveIndex(index);
    if (page !== 'dashboard') setPage('dashboard');
  }

  async function handleDeletePortfolio(index) {
    if (portfolios.length <= 1) return;
    const toDelete = portfolios[index];
    const updated = portfolios.filter((_, i) => i !== index);
    setPortfolios(updated);
    setActiveIndex(0);
    if (toDelete.id) {
      await deletePortfolio(toDelete.id);
    }
  }

  async function handleLogout() {
    await signOut();
    setUser(null);
    setPortfolios([]);
    setPage('login');
  }

  function handleNavigate(target) {
    setPage(target);
  }

  if (page === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F9F8' }}>
        <div style={{ textAlign: 'center' }}>
          <img src="/logo.png" alt="FlowInvest" style={{ width: '70%', maxWidth: 280, height: 'auto' }} />
          <p style={{ color: '#78909C', marginTop: 12 }}>Laden...</p>
        </div>
      </div>
    );
  }

  if (page === 'login' || !user) {
    return <Login onAuth={handleAuth} />;
  }

  if (page === 'onboarding') {
    return <Onboarding onComplete={handleOnboardingComplete} portfolioName={onboardingMode?.name} />;
  }

  if (!activePortfolio) {
    return <Onboarding onComplete={handleOnboardingComplete} portfolioName="Mijn portfolio" />;
  }

  if (page === 'assistant') {
    return <Assistant onNavigate={handleNavigate} settings={activePortfolio} />;
  }

  if (page === 'profile') {
    return (
      <Profile
        user={user}
        portfolios={portfolios}
        activeIndex={activeIndex}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        onUpdatePortfolios={setPortfolios}
        onDeletePortfolio={handleDeletePortfolio}
        onAddPortfolio={handleAddPortfolio}
        onSwitchPortfolio={handleSwitchPortfolio}
      />
    );
  }

  return (
    <Dashboard
      settings={activePortfolio}
      user={user}
      portfolios={portfolios}
      activeIndex={activeIndex}
      brokerMode={activePortfolio.broker_mode || 'simulation'}
      onNavigate={handleNavigate}
      onUpdateSettings={handleUpdateSettings}
      onSwitchPortfolio={handleSwitchPortfolio}
    />
  );
}

export default App;
