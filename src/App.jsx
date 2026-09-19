import { useState, useEffect } from 'react';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Assistant from './pages/Assistant';
import Profile from './pages/Profile';
import AlpacaSetup from './pages/AlpacaSetup';
import DayTrade from './pages/DayTrade';
import Calculator from './pages/Calculator';
import { supabase, loadPortfolios, savePortfolio, deletePortfolio, signOut, loadAllAlpacaKeys, saveAlpacaKeys } from './data/supabase';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState('loading');
  const [onboardingMode, setOnboardingMode] = useState(null); // { name, brokerMode }
  // Paper en live hebben elk hun eigen sleutels; welke set geldt hangt af van
  // het actieve portfolio. Eerder deelden ze een plek, waardoor de laatst
  // ingestelde de andere overschreef.
  const [alpacaKeySets, setAlpacaKeySets] = useState({ paper: null, live: null });
  const [showAlpacaSetup, setShowAlpacaSetup] = useState(false);
  // Welke soort sleutels er wordt ingevoerd. Bij het aanmaken van een
  // portfolio volgt dat uit onboardingMode; bij het bijwerken vanuit het
  // profielscherm staat het hier.
  const [keySetupMode, setKeySetupMode] = useState(null);

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setUser(session?.user || null);
        setPage('reset-password');
        return;
      }
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
      // Laad portfolios en Alpaca keys parallel
      const [data, keys] = await Promise.all([
        loadPortfolios(userId),
        loadAllAlpacaKeys(userId).catch(() => ({ paper: null, live: null })),
      ]);
      if (keys) setAlpacaKeySets(keys);

      if (data.length > 0) {
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
    const strategy = onboardingMode?.strategy;
    const name = userSettings.name || onboardingMode?.name || 'Mijn portfolio';
    const risk = strategy || userSettings.risk;
    const newPortfolio = { name, broker_mode: brokerMode, ...userSettings, risk };

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
      try {
        await savePortfolio(user.id, updated[activeIndex]);
      } catch (err) {
        console.error('Fout bij opslaan portfolio:', err);
      }
    }
  }

  function handleAddPortfolio(name, brokerMode, strategy) {
    // Paper trading: check of er keys zijn
    if (brokerMode === 'paper' && !alpacaKeySets.paper) {
      setOnboardingMode({ name, brokerMode, strategy });
      setShowAlpacaSetup(true);
      return;
    }
    // Live trading: ALTIJD setup flow tonen (live keys zijn apart van paper keys)
    if (brokerMode === 'live') {
      setOnboardingMode({ name, brokerMode, strategy });
      setShowAlpacaSetup(true);
      return;
    }
    setOnboardingMode({ name, brokerMode: brokerMode || 'simulation', strategy });
    setPage('onboarding');
  }

  async function handleAlpacaSetupComplete(keys) {
    // Welke soort sleutels dit zijn volgt uit het portfolio dat wordt
    // aangemaakt. Zonder dat onderscheid overschreef live de paper-sleutels.
    const soort = keySetupMode || (onboardingMode?.brokerMode === 'live' ? 'live' : 'paper');
    if (user) {
      try {
        await saveAlpacaKeys(user.id, keys.apiKey, keys.secretKey, soort);
      } catch (err) {
        console.error('Fout bij opslaan Alpaca keys:', err);
      }
    }
    setAlpacaKeySets(vorige => ({ ...vorige, [soort]: keys }));
    setShowAlpacaSetup(false);

    // Bijwerken vanuit het profiel hoort niet in de onboarding te eindigen.
    if (keySetupMode) {
      setKeySetupMode(null);
      setPage('profile');
      return;
    }
    setPage('onboarding');
  }

  function handleUpdateKeys(mode) {
    setKeySetupMode(mode);
    setShowAlpacaSetup(true);
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
      try {
        await deletePortfolio(toDelete.id);
      } catch (err) {
        console.error('Fout bij verwijderen portfolio:', err);
      }
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

  if (page === 'reset-password') {
    return <ResetPassword onDone={() => setPage(user ? 'loading' : 'login')} />;
  }

  if (page === 'login' || !user) {
    return <Login onAuth={handleAuth} />;
  }

  if (showAlpacaSetup) {
    return <AlpacaSetup
      onComplete={handleAlpacaSetupComplete}
      onCancel={() => { setShowAlpacaSetup(false); setKeySetupMode(null); if (!keySetupMode) setOnboardingMode(null); else setPage('profile'); }}
      isLive={keySetupMode ? keySetupMode === 'live' : onboardingMode?.brokerMode === 'live'}
      alreadyConnected={!!(alpacaKeySets.paper || alpacaKeySets.live)}
    />;
  }

  if (page === 'onboarding') {
    return <Onboarding onComplete={handleOnboardingComplete} portfolioName={onboardingMode?.name} strategy={onboardingMode?.strategy} />;
  }

  if (!activePortfolio) {
    return <Onboarding onComplete={handleOnboardingComplete} portfolioName="Mijn portfolio" />;
  }

  if (page === 'calculator') {
    return <Calculator onNavigate={handleNavigate} />;
  }

  if (page === 'daytrade') {
    return <DayTrade onNavigate={handleNavigate} />;
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
        alpacaConnected={!!(alpacaKeySets.paper || alpacaKeySets.live)}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        onUpdatePortfolios={setPortfolios}
        onDeletePortfolio={handleDeletePortfolio}
        onAddPortfolio={handleAddPortfolio}
        onSwitchPortfolio={handleSwitchPortfolio}
        onUpdateKeys={handleUpdateKeys}
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
      alpacaKeys={activePortfolio.broker_mode === 'live' ? alpacaKeySets.live : alpacaKeySets.paper}
      onNavigate={handleNavigate}
      onUpdateSettings={handleUpdateSettings}
      onSwitchPortfolio={handleSwitchPortfolio}
    />
  );
}

export default App;
