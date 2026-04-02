import { useState } from 'react';
import '../styles/Onboarding.css';

const steps = [
  {
    key: 'welcome',
    title: 'Welkom bij FlowInvest',
    subtitle: 'Beleggen zonder gedoe. Wij regelen alles voor je.',
  },
  {
    key: 'name',
    title: 'Geef je portfolio een naam',
    subtitle: 'Bijvoorbeeld: Pensioen, Spaardoel, of Maximaal rendement.',
  },
  {
    key: 'amount',
    title: 'Hoeveel wil je starten?',
    subtitle: 'Je kunt dit later altijd aanpassen.',
  },
  {
    key: 'goal',
    title: 'Wat beschrijft jou het beste?',
    subtitle: 'Dit helpt ons de juiste strategie te kiezen.',
  },
  {
    key: 'horizon',
    title: 'Hoe lang wil je beleggen?',
    subtitle: 'Langer beleggen = meer kans op groei.',
  },
  {
    key: 'risk',
    title: 'Hoeveel risico vind je oké?',
    subtitle: 'Meer risico = meer kans op rendement, maar ook meer schommelingen.',
  },
];

const amountOptions = [50, 100, 500];
const goalOptions = [
  { value: 'starter', label: 'Ik wil beginnen met beleggen', icon: '🌱' },
  { value: 'target', label: 'Ik spaar voor iets specifieks', icon: '🎯' },
  { value: 'future', label: 'Ik bouw aan mijn toekomst', icon: '🏗️' },
  { value: 'idle', label: 'Ik wil mijn geld niet laten stilstaan', icon: '💡' },
];
const horizonOptions = [
  { value: '1-3', label: '1–3 jaar', desc: 'Snel resultaat zien' },
  { value: '3-10', label: '3–10 jaar', desc: 'Sparen voor een doel' },
  { value: '10-20', label: '10–20 jaar', desc: 'Serieus vermogen opbouwen' },
  { value: '20+', label: '20+ jaar', desc: 'Pensioen & financiële vrijheid' },
];
const riskOptions = [
  { value: 'low', label: 'Voorzichtig', desc: 'Stabiel rendement, weinig schommelingen', color: '#4CAF50' },
  { value: 'medium', label: 'Gebalanceerd', desc: 'Balans tussen groei en stabiliteit', color: '#FF9800' },
  { value: 'high', label: 'Ambitieus', desc: 'Meer groei, meer schommelingen', color: '#F44336' },
  { value: 'ultra', label: 'Maximaal', desc: 'Losse aandelen — hoogste groeipotentie', color: '#9C27B0' },
];

// Aanbevolen risicoprofiel op basis van doel + horizon
const riskAdvice = {
  starter: { '1-3': 'low', '3-10': 'medium', '10-20': 'high', '20+': 'high' },
  target: { '1-3': 'low', '3-10': 'medium', '10-20': 'high', '20+': 'high' },
  future: { '1-3': 'medium', '3-10': 'high', '10-20': 'ultra', '20+': 'ultra' },
  idle: { '1-3': 'low', '3-10': 'low', '10-20': 'medium', '20+': 'medium' },
};

function getRecommendedRisk(goal, horizon) {
  return riskAdvice[goal]?.[horizon] || null;
}

export default function Onboarding({ onComplete, portfolioName, strategy }) {
  const hasName = !!portfolioName;
  const isCrypto = strategy === 'crypto';
  // Bij crypto: skip welkom, naam, doel, horizon en risico — alleen bedrag vragen
  const startStep = isCrypto ? 2 : (hasName ? 2 : 0);
  const [step, setStep] = useState(startStep);
  const [name, setName] = useState(portfolioName || '');
  const [settings, setSettings] = useState({
    amount: 100,
    customAmount: '',
    goal: isCrypto ? 'growth' : '',
    horizon: isCrypto ? '3-10' : '',
    risk: isCrypto ? 'crypto' : '',
  });

  const currentStep = steps[step];

  function next() {
    // Bij crypto: na het bedrag direct afronden
    if (isCrypto && currentStep.key === 'amount') {
      const amount = settings.customAmount ? parseInt(settings.customAmount) : settings.amount;
      onComplete({ ...settings, amount, name: name || 'Crypto Portfolio' });
      return;
    }
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      const amount = settings.customAmount ? parseInt(settings.customAmount) : settings.amount;
      onComplete({ ...settings, amount, name: name || 'Mijn portfolio' });
    }
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  function canProceed() {
    switch (currentStep.key) {
      case 'welcome': return true;
      case 'name': return name.trim().length > 0;
      case 'amount': return settings.amount > 0 || settings.customAmount;
      case 'goal': return settings.goal;
      case 'horizon': return settings.horizon;
      case 'risk': return settings.risk;
      default: return false;
    }
  }

  return (
    <div className="onboarding">
      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(step / (steps.length - 1)) * 100}%` }} />
      </div>

      <div className="onboarding-content">
        {step > 0 && (
          <button className="back-btn" onClick={back}>
            ← Terug
          </button>
        )}

        <h1>{currentStep.title}</h1>
        <p className="subtitle">{currentStep.subtitle}</p>

        {/* Welcome */}
        {currentStep.key === 'welcome' && (
          <div className="welcome-card">
            <img src="/logo.png" alt="FlowInvest" className="welcome-icon" />
            <div className="welcome-features">
              <div className="feature">✓ Automatisch beleggen</div>
              <div className="feature">✓ AI-assistent voor al je vragen</div>
              <div className="feature">✓ Geen kennis nodig</div>
              <div className="feature">✓ Start vanaf €50</div>
            </div>
          </div>
        )}

        {/* Name */}
        {currentStep.key === 'name' && (
          <div className="name-input-wrapper">
            <input
              type="text"
              className="name-input"
              placeholder="Bijv. Pensioen, Spaardoel huis..."
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={30}
              autoFocus
            />
          </div>
        )}

        {/* Amount */}
        {currentStep.key === 'amount' && (
          <div className="options-grid">
            {amountOptions.map(amount => (
              <button
                key={amount}
                className={`option-card ${settings.amount === amount && !settings.customAmount ? 'selected' : ''}`}
                onClick={() => setSettings({ ...settings, amount, customAmount: '' })}
              >
                <span className="option-value">€{amount}</span>
              </button>
            ))}
            <div className="custom-amount">
              <input
                type="number"
                placeholder="Ander bedrag..."
                value={settings.customAmount}
                onChange={e => setSettings({ ...settings, customAmount: e.target.value, amount: 0 })}
                min="10"
              />
            </div>
          </div>
        )}

        {/* Goal */}
        {currentStep.key === 'goal' && (
          <div className="options-list">
            {goalOptions.map(goal => (
              <button
                key={goal.value}
                className={`option-card-large ${settings.goal === goal.value ? 'selected' : ''}`}
                onClick={() => setSettings({ ...settings, goal: goal.value })}
              >
                <span className="option-icon">{goal.icon}</span>
                <span className="option-label">{goal.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Horizon */}
        {currentStep.key === 'horizon' && (
          <div className="options-list">
            {horizonOptions.map(h => (
              <button
                key={h.value}
                className={`option-card-large ${settings.horizon === h.value ? 'selected' : ''}`}
                onClick={() => setSettings({ ...settings, horizon: h.value })}
              >
                <span className="option-label">{h.label}</span>
                <span className="option-desc">{h.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Risk */}
        {currentStep.key === 'risk' && (
          <div className="options-list">
            {riskOptions.map(r => {
              const recommended = getRecommendedRisk(settings.goal, settings.horizon);
              const isRecommended = recommended === r.value;
              return (
                <button
                  key={r.value}
                  className={`option-card-large ${settings.risk === r.value ? 'selected' : ''} ${isRecommended ? 'recommended' : ''}`}
                  onClick={() => setSettings({ ...settings, risk: r.value })}
                  style={settings.risk === r.value ? { borderColor: r.color } : {}}
                >
                  {isRecommended && <span className="recommended-badge">Aanbevolen voor jou</span>}
                  <span className="option-label">{r.label}</span>
                  <span className="option-desc">{r.desc}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="onboarding-footer">
        <button
          className="primary-btn"
          onClick={next}
          disabled={!canProceed()}
        >
          {step === 0 ? 'Start' : step === steps.length - 1 ? 'Begin met beleggen' : 'Volgende'}
        </button>
      </div>
    </div>
  );
}
