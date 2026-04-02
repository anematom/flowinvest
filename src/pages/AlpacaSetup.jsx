import { useState } from 'react';
import '../styles/AlpacaSetup.css';

const steps = [
  {
    key: 'intro',
    title: 'Echt geld beleggen',
    content: `Om echt te kunnen beleggen (of te oefenen met nep-geld), heb je een account nodig bij een broker.

Een broker is een bedrijf dat jouw aankopen op de beurs uitvoert. Zie het als een tussenpersoon — jij zegt wat je wilt kopen, de broker regelt de rest.

FlowInvest werkt samen met Alpaca. Alpaca is een Amerikaanse broker die speciaal gemaakt is voor apps zoals deze. Je geld staat veilig bij Alpaca, niet bij FlowInvest.`,
  },
  {
    key: 'veiligheid',
    title: 'Is mijn geld veilig?',
    content: `Ja. Je geld staat bij Alpaca, niet bij FlowInvest. Zelfs als FlowInvest stopt met werken, staat je geld nog steeds veilig bij Alpaca.

Alpaca is verzekerd door SIPC tot $500.000. Dat betekent dat als Alpaca failliet zou gaan, je geld beschermd is.

Je kunt altijd direct inloggen op alpaca.markets om je geld op te nemen — onafhankelijk van FlowInvest.`,
  },
  {
    key: 'account',
    title: 'Stap 1: Maak een Alpaca account',
    content: `Ga naar alpaca.markets en maak een gratis account aan.

Kies voor "Individual Account" en vul je gegevens in. Dit duurt ongeveer 5 minuten.

Belangrijk: je begint automatisch met Paper Trading. Dat betekent dat je oefent met nep-geld ($100.000). Er is geen risico.

Tip: dezelfde API-sleutels werken voor zowel Paper Trading als Live Trading. De modus kies je later bij het aanmaken van een portfolio.`,
    link: 'https://alpaca.markets',
    linkText: 'Ga naar Alpaca',
  },
  {
    key: 'keys',
    title: 'Stap 2: Pak je API sleutels',
    content: `Als je bent ingelogd op Alpaca:

1. Klik op "API" in het linkermenu
2. Klik op "Generate New Key"
3. Je krijgt twee codes:
   • API Key (begint met PK...)
   • Secret Key (lang, zie je maar één keer!)

Kopieer ze allebei en vul ze hieronder in.`,
    showInputs: true,
  },
];

export default function AlpacaSetup({ onComplete, onCancel }) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const current = steps[step];

  async function testConnection() {
    if (!apiKey.trim() || !secretKey.trim()) {
      setError('Vul beide sleutels in');
      return;
    }
    setTesting(true);
    setError('');

    try {
      const res = await fetch('https://paper-api.alpaca.markets/v2/account', {
        headers: {
          'APCA-API-KEY-ID': apiKey.trim(),
          'APCA-API-SECRET-KEY': secretKey.trim(),
        },
      });

      if (!res.ok) {
        setError('Deze sleutels werken niet. Controleer of je ze goed hebt gekopieerd.');
        setTesting(false);
        return;
      }

      const data = await res.json();
      if (data.status === 'ACTIVE') {
        onComplete({ apiKey: apiKey.trim(), secretKey: secretKey.trim() });
      } else {
        setError('Je Alpaca account is nog niet actief. Rond eerst de registratie af op alpaca.markets.');
      }
    } catch {
      setError('Kan geen verbinding maken. Probeer het later opnieuw.');
    }
    setTesting(false);
  }

  function next() {
    if (step < steps.length - 1) {
      setStep(step + 1);
    }
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  return (
    <div className="alpaca-setup">
      {/* Progress */}
      <div className="setup-progress">
        <div className="setup-progress-fill" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>

      <div className="setup-content">
        {step > 0 && (
          <button className="setup-back" onClick={back}>← Terug</button>
        )}

        <h1>{current.title}</h1>

        <div className="setup-text">
          {current.content.split('\n\n').map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {current.link && (
          <a href={current.link} target="_blank" rel="noopener noreferrer" className="setup-link">
            {current.linkText} →
          </a>
        )}

        {current.showInputs && (
          <div className="setup-inputs">
            <label>
              <span>API Key</span>
              <input
                type="text"
                placeholder="PK..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
            </label>
            <label>
              <span>Secret Key</span>
              <input
                type="password"
                placeholder="Plak hier je secret key..."
                value={secretKey}
                onChange={e => setSecretKey(e.target.value)}
              />
            </label>
            {error && <div className="setup-error">{error}</div>}
          </div>
        )}
      </div>

      <div className="setup-footer">
        {current.showInputs ? (
          <button className="setup-btn" onClick={testConnection} disabled={testing || !apiKey || !secretKey}>
            {testing ? 'Verbinding testen...' : 'Verbinden met Alpaca'}
          </button>
        ) : (
          <button className="setup-btn" onClick={next}>
            {step === 0 ? 'Hoe werkt het?' : 'Volgende'}
          </button>
        )}
        <button className="setup-cancel" onClick={onCancel}>
          Annuleer
        </button>
      </div>
    </div>
  );
}
