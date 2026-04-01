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
  const [onboardingName, setOnboardingName] = useState(null);

  const activePortfolio = portfolios[activeIndex] || null;

  // Check of gebruiker al ingelogd is
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
        setPortfolios(data);
        setActiveIndex(0);
        setPage('dashboard');
      } else {
        setOnboardingName('Mijn portfolio');
        setPage('onboarding');
      }
    } catch {
      setOnboardingName('Mijn portfolio');
      setPage('onboarding');
    }
  }

  function handleAuth(authUser) {
    setUser(authUser);
    loadData(authUser.id);
  }

  async function handleOnboardingComplete(userSettings) {
    const name = userSettings.name || onboardingName || 'Mijn portfolio';
    const newPortfolio = { name, ...userSettings };

    if (user) {
      try {
        const saved = await savePortfolio(user.id, newPortfolio);
        if (saved && saved.id) {
          newPortfolio.id = saved.id;
          newPortfolio.user_id = user.id;
        }
      } catch (err) {
        console.error('Fout bij opslaan portfolio:', err);
        alert('Let op: portfolio kon niet worden opgeslagen in de database. Probeer opnieuw in te loggen.');
      }
    }

    setPortfolios(prev => {
      const updated = [...prev, newPortfolio];
      setActiveIndex(updated.length - 1);
      return updated;
    });
    setPage('dashboard');
    setOnboardingName(null);
  }

  async function handleUpdateSettings(newSettings) {
    const updated = [...portfolios];
    updated[activeIndex] = { ...updated[activeIndex], ...newSettings };
    setPortfolios(updated);
    if (user) {
      await savePortfolio(user.id, updated[activeIndex]);
    }
  }

  function handleAddPortfolio(name) {
    setOnboardingName(name);
    setPage('onboarding');
  }

  function handleSwitchPortfolio(index) {
    setActiveIndex(index);
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
    return <Onboarding onComplete={handleOnboardingComplete} portfolioName={onboardingName} />;
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
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        onUpdatePortfolios={setPortfolios}
        onDeletePortfolio={handleDeletePortfolio}
      />
    );
  }

  return (
    <Dashboard
      settings={activePortfolio}
      user={user}
      portfolios={portfolios}
      activeIndex={activeIndex}
      onNavigate={handleNavigate}
      onUpdateSettings={handleUpdateSettings}
      onSwitchPortfolio={handleSwitchPortfolio}
      onAddPortfolio={handleAddPortfolio}
      onDeletePortfolio={handleDeletePortfolio}
    />
  );
}

export default App;
