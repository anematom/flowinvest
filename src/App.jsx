import { useState } from 'react';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Assistant from './pages/Assistant';
import './App.css';

const STORAGE_KEY = 'flowinvest_settings';

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function App() {
  const saved = loadSettings();
  const [page, setPage] = useState(saved ? 'dashboard' : 'onboarding');
  const [settings, setSettings] = useState(saved);

  function handleOnboardingComplete(userSettings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userSettings));
    setSettings(userSettings);
    setPage('dashboard');
  }

  function handleUpdateSettings(newSettings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    setSettings(newSettings);
  }

  function handleReset() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('flowinvest_transactions');
    localStorage.removeItem('flowinvest_autoinvest');
    setSettings(null);
    setPage('onboarding');
  }

  function handleNavigate(target) {
    setPage(target);
  }

  if (page === 'onboarding' || !settings) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (page === 'assistant') {
    return <Assistant onNavigate={handleNavigate} />;
  }

  return <Dashboard settings={settings} onNavigate={handleNavigate} onReset={handleReset} onUpdateSettings={handleUpdateSettings} />;
}

export default App;
