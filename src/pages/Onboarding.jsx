import { useState } from 'react';
import '../styles/Onboarding.css';

const steps = [
  {
    key: 'welcome',
    title: 'Welkom bij FlowInvest',
    subtitle: 'Beleggen zonder stress. Wij regelen alles voor je.',
  },
  {
    key: 'amount',
    title: 'Hoeveel wil je starten?',
    subtitle: 'Je kunt dit later altijd aanpassen.',
  },
  {
    key: 'goal',
    title: 'Wat is je doel?',
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
  { value: 'wealth', label: 'Vermogen opbouwen', icon: '💰' },
  { value: 'purchase', label: 'Grote aankoop', icon: '🏠' },
  { value: 'retirement', label: 'Pensioen', icon: '🌴' },
];
const horizonOptions = [
  { value: '1-3', label: '1–3 jaar', desc: 'Kort' },
  { value: '3-5', label: '3–5 jaar', desc: 'Middellang' },
  { value: '5-10', label: '5–10 jaar', desc: 'Lang' },
  { value: '10+', label: '10+ jaar', desc: 'Zeer lang' },
];
const riskOptions = [
  { value: 'low', label: 'Rustig', desc: 'Minder schommelingen, stabieler rendement', color: '#4CAF50' },
  { value: 'medium', label: 'Gemiddeld', desc: 'Balans tussen groei en stabiliteit', color: '#FF9800' },
  { value: 'high', label: 'Avontuurlijk', desc: 'Meer schommelingen, potentieel hoger rendement', color: '#F44336' },
  { value: 'ultra', label: 'Ultra Agressief', desc: 'Losse aandelen — maximale groei, maximaal risico', color: '#9C27B0' },
];

// Aanbevolen risicoprofiel op basis van doel + horizon
const riskAdvice = {
  wealth: { '1-3': 'medium', '3-5': 'high', '5-10': 'high', '10+': 'ultra' },
  purchase: { '1-3': 'low', '3-5': 'medium', '5-10': 'high', '10+': 'high' },
  retirement: { '1-3': 'low', '3-5': 'low', '5-10': 'medium', '10+': 'medium' },
};

function getRecommendedRisk(goal, horizon) {
  return riskAdvice[goal]?.[horizon] || null;
}

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState({
    amount: 100,
    customAmount: '',
    goal: '',
    horizon: '',
    risk: '',
  });

  const currentStep = steps[step];

  function next() {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      const amount = settings.customAmount ? parseInt(settings.customAmount) : settings.amount;
      onComplete({ ...settings, amount });
    }
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  function canProceed() {
    switch (currentStep.key) {
      case 'welcome': return true;
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
            <div className="welcome-icon">🌱</div>
            <div className="welcome-features">
              <div className="feature">✓ Automatisch beleggen</div>
              <div className="feature">✓ AI-assistent voor al je vragen</div>
              <div className="feature">✓ Geen kennis nodig</div>
              <div className="feature">✓ Start vanaf €50</div>
            </div>
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
