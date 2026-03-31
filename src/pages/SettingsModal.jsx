import { useState, useEffect } from 'react';
import '../styles/SettingsModal.css';

const TRANSACTIONS_KEY = 'flowinvest_transactions';
const AUTOINVEST_KEY = 'flowinvest_autoinvest';

function loadTransactions() {
  try {
    return JSON.parse(localStorage.getItem(TRANSACTIONS_KEY)) || [];
  } catch { return []; }
}

function saveTransactions(list) {
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(list));
}

function loadAutoInvest() {
  try {
    return JSON.parse(localStorage.getItem(AUTOINVEST_KEY)) || { enabled: false, amount: 100 };
  } catch { return { enabled: false, amount: 100 }; }
}

function saveAutoInvest(config) {
  localStorage.setItem(AUTOINVEST_KEY, JSON.stringify(config));
}

// ========== Geldbeheer modal ==========
export function MoneyModal({ settings, onUpdate, onClose }) {
  const [amount, setAmount] = useState('');
  const [transactions, setTransactions] = useState(loadTransactions());
  const [autoInvest, setAutoInvest] = useState(loadAutoInvest());

  // Check maandelijkse storting bij openen
  useEffect(() => {
    if (!autoInvest.enabled) return;
    const lastAuto = transactions.find(t => t.type === 'auto');
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${now.getMonth()}`;
    const lastMonth = lastAuto ? `${new Date(lastAuto.date).getFullYear()}-${new Date(lastAuto.date).getMonth()}` : null;

    if (lastMonth !== thisMonth) {
      handleAutoDeposit();
    }
  }, []);

  function handleAutoDeposit() {
    const tx = {
      type: 'auto',
      amount: autoInvest.amount,
      date: new Date().toISOString(),
      label: 'Maandelijkse storting',
    };
    const updated = [tx, ...transactions];
    setTransactions(updated);
    saveTransactions(updated);
    onUpdate({ ...settings, amount: settings.amount + autoInvest.amount });
  }

  function handleDeposit() {
    const value = parseFloat(amount);
    if (!value || value <= 0) return;
    const tx = {
      type: 'deposit',
      amount: value,
      date: new Date().toISOString(),
      label: 'Storting',
    };
    const updated = [tx, ...transactions];
    setTransactions(updated);
    saveTransactions(updated);
    onUpdate({ ...settings, amount: settings.amount + value });
    setAmount('');
  }

  function handleWithdraw() {
    const value = parseFloat(amount);
    if (!value || value <= 0 || value > settings.amount) return;
    const tx = {
      type: 'withdraw',
      amount: value,
      date: new Date().toISOString(),
      label: 'Opname',
    };
    const updated = [tx, ...transactions];
    setTransactions(updated);
    saveTransactions(updated);
    onUpdate({ ...settings, amount: settings.amount - value });
    setAmount('');
  }

  function toggleAutoInvest() {
    const updated = { ...autoInvest, enabled: !autoInvest.enabled };
    setAutoInvest(updated);
    saveAutoInvest(updated);
  }

  function updateAutoAmount(val) {
    const updated = { ...autoInvest, amount: val };
    setAutoInvest(updated);
    saveAutoInvest(updated);
  }

  const autoAmounts = [50, 100, 200];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Geldbeheer</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="money-current">
          <span className="money-label">Huidige inleg</span>
          <span className="money-value">&euro;{settings.amount.toLocaleString('nl-NL')}</span>
        </div>

        <div className="money-input-row">
          <input
            type="number"
            placeholder="Bedrag..."
            value={amount}
            onChange={e => setAmount(e.target.value)}
            min="1"
          />
          <button className="money-btn deposit" onClick={handleDeposit}>Storten</button>
          <button className="money-btn withdraw" onClick={handleWithdraw}>Opnemen</button>
        </div>

        <div className="money-auto">
          <div className="auto-header">
            <span className="auto-title">Maandelijks bijstorten</span>
            <button
              className={`auto-toggle ${autoInvest.enabled ? 'active' : ''}`}
              onClick={toggleAutoInvest}
            >
              {autoInvest.enabled ? 'Aan' : 'Uit'}
            </button>
          </div>
          {autoInvest.enabled && (
            <div className="auto-amounts">
              {autoAmounts.map(a => (
                <button
                  key={a}
                  className={`auto-amount-btn ${autoInvest.amount === a ? 'selected' : ''}`}
                  onClick={() => updateAutoAmount(a)}
                >
                  &euro;{a}
                </button>
              ))}
              <input
                type="number"
                className="auto-custom"
                placeholder="Anders..."
                value={autoAmounts.includes(autoInvest.amount) ? '' : autoInvest.amount}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  if (v > 0) updateAutoAmount(v);
                }}
                min="1"
              />
            </div>
          )}
          {autoInvest.enabled && (
            <p className="auto-desc">
              Elke maand wordt &euro;{autoInvest.amount} toegevoegd aan je portfolio
            </p>
          )}
        </div>

        {transactions.length > 0 && (
          <div className="money-history">
            <h3>Transacties</h3>
            <div className="tx-list">
              {transactions.slice(0, 10).map((tx, i) => (
                <div key={i} className="tx-item">
                  <div className="tx-left">
                    <span className={`tx-icon ${tx.type}`}>
                      {tx.type === 'withdraw' ? '↑' : '↓'}
                    </span>
                    <div>
                      <span className="tx-label">{tx.label}</span>
                      <span className="tx-date">
                        {new Date(tx.date).toLocaleDateString('nl-NL', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>
                  <span className={`tx-amount ${tx.type}`}>
                    {tx.type === 'withdraw' ? '-' : '+'}&euro;{tx.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== Simpele edit modals ==========

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

const riskAdvice = {
  starter: { '1-3': 'low', '3-10': 'medium', '10-20': 'high', '20+': 'high' },
  target: { '1-3': 'low', '3-10': 'medium', '10-20': 'high', '20+': 'high' },
  future: { '1-3': 'medium', '3-10': 'high', '10-20': 'ultra', '20+': 'ultra' },
  idle: { '1-3': 'low', '3-10': 'low', '10-20': 'medium', '20+': 'medium' },
};

export function EditModal({ field, settings, onUpdate, onClose }) {
  const [value, setValue] = useState(settings[field]);

  function handleSave() {
    onUpdate({ ...settings, [field]: value });
    onClose();
  }

  const titles = {
    goal: 'Wat beschrijft jou het beste?',
    horizon: 'Hoe lang wil je beleggen?',
    risk: 'Welk profiel past bij jou?',
  };

  const recommended = riskAdvice[field === 'risk' ? settings.goal : null]?.[settings.horizon];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{titles[field]}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-options">
          {field === 'goal' && goalOptions.map(opt => (
            <button
              key={opt.value}
              className={`modal-option ${value === opt.value ? 'selected' : ''}`}
              onClick={() => setValue(opt.value)}
            >
              <span className="modal-opt-icon">{opt.icon}</span>
              <span className="modal-opt-label">{opt.label}</span>
            </button>
          ))}

          {field === 'horizon' && horizonOptions.map(opt => (
            <button
              key={opt.value}
              className={`modal-option ${value === opt.value ? 'selected' : ''}`}
              onClick={() => setValue(opt.value)}
            >
              <span className="modal-opt-label">{opt.label}</span>
              <span className="modal-opt-desc">{opt.desc}</span>
            </button>
          ))}

          {field === 'risk' && riskOptions.map(opt => {
            const isRecommended = recommended === opt.value;
            return (
              <button
                key={opt.value}
                className={`modal-option ${value === opt.value ? 'selected' : ''} ${isRecommended ? 'recommended' : ''}`}
                onClick={() => setValue(opt.value)}
                style={value === opt.value ? { borderColor: opt.color } : {}}
              >
                {isRecommended && <span className="modal-recommended">Aanbevolen</span>}
                <span className="modal-opt-label">{opt.label}</span>
                <span className="modal-opt-desc">{opt.desc}</span>
              </button>
            );
          })}
        </div>

        <button className="modal-save" onClick={handleSave}>Opslaan</button>
      </div>
    </div>
  );
}
