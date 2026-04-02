import { useState } from 'react';
import '../styles/Calculator.css';

const RISK_PROFILES = [
  { key: 'voorzichtig', label: 'Voorzichtig', rate: 0.066, desc: 'Obligaties + ETFs', detail: 'Dit is het veiligste profiel. Je geld wordt gespreid over obligaties en ETFs. Gemiddeld rendement over 97 jaar: 6.6% per jaar. Minder schommelingen, maar ook minder rendement.' },
  { key: 'gebalanceerd', label: 'Gebalanceerd', rate: 0.087, desc: '60% aandelen / 40% obligaties', detail: 'Een mix van aandelen en obligaties. De obligaties dempen de schommelingen, de aandelen zorgen voor groei. Gemiddeld rendement over 97 jaar: 8.7% per jaar.' },
  { key: 'ambitieus', label: 'Ambitieus', rate: 0.10, desc: 'S&P 500 ETF', detail: 'Je belegt in de 500 grootste Amerikaanse bedrijven. Meer schommelingen, maar historisch het beste langetermijn rendement. Gemiddeld 10% per jaar over 97 jaar.' },
  { key: 'maximaal', label: 'Maximaal', rate: 0.125, desc: 'Losse aandelen + momentum', detail: 'De AI selecteert de sterkste individuele aandelen. Meer risico, maar potentieel hoger rendement. Conservatieve schatting: 12.5% per jaar.' },
  { key: 'ai', label: 'FlowInvest AI', rate: 0.17, desc: 'Getest over 2016-2026', detail: 'Dit rendement is getest met de FlowInvest AI-strategie op echte marktdata van de afgelopen 10 jaar (2016-2026). Deze periode was uitzonderlijk goed door de tech- en AI-boom. Het werkelijke rendement kan lager uitvallen. Gebruik dit als optimistisch scenario.', highlight: true },
];
const INFLATION = 0.03;

function calcFV(pmt, annualRate, years) {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return pmt * n;
  return pmt * ((Math.pow(1 + r, n) - 1) / r);
}

export default function Calculator({ onNavigate }) {
  const [startAmount, setStartAmount] = useState(1000);
  const [calcDeposit, setCalcDeposit] = useState(200);
  const [selectedProfile, setSelectedProfile] = useState(2);

  const profile = RISK_PROFILES[selectedProfile];
  const afterInflationRate = profile.rate - INFLATION;

  // FV met startbedrag + maandelijkse inleg
  function calcTotal(annualRate, years) {
    const r = annualRate / 12;
    const n = years * 12;
    if (r === 0) return startAmount + calcDeposit * n;
    const fvStart = startAmount * Math.pow(1 + r, n);
    const fvMonthly = calcDeposit * ((Math.pow(1 + r, n) - 1) / r);
    return fvStart + fvMonthly;
  }

  return (
    <div className="calculator-page">
      <div className="calculator-header">
        <h1>Rendementsverwachting</h1>
        <p className="calculator-subtitle">Bereken wat je geld kan doen</p>
      </div>

      {/* Profiel selectie */}
      <div className="calc-profile-selector">
        {RISK_PROFILES.map((p, i) => (
          <button
            key={i}
            className={`calc-profile-btn ${i === selectedProfile ? 'active' : ''} ${p.highlight ? 'highlight' : ''}`}
            onClick={() => setSelectedProfile(i)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Uitleg van gekozen profiel */}
      <div className={`calc-profile-info ${profile.highlight ? 'highlight' : ''}`}>
        <div className="calc-profile-top">
          <span className="calc-profile-name">{profile.label}</span>
          <span className="calc-profile-rate">{(profile.rate * 100).toFixed(1)}% per jaar</span>
        </div>
        <p className="calc-profile-desc">{profile.desc}</p>
        <p className="calc-profile-detail">{profile.detail}</p>
      </div>

      {/* Inleg */}
      <div className="calc-card">
        <div className="calc-two-inputs">
          <div>
            <label className="calc-input-label">Startinleg</label>
            <div className="calc-input-row">
              <span className="calc-currency">€</span>
              <input
                type="number"
                className="calc-input"
                value={startAmount}
                onChange={e => setStartAmount(Number(e.target.value))}
                min={0}
                step={100}
              />
            </div>
          </div>
          <div>
            <label className="calc-input-label">Maandelijks erbij</label>
            <div className="calc-input-row">
              <span className="calc-currency">€</span>
              <input
                type="number"
                className="calc-input"
                value={calcDeposit}
                onChange={e => setCalcDeposit(Number(e.target.value))}
                min={0}
                step={50}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resultaten */}
      <div className="calc-card">
        <table className="calc-table">
          <thead>
            <tr>
              <th>Jaar</th>
              <th>Ingelegd</th>
              <th>Verwacht</th>
              <th>Na inflatie</th>
            </tr>
          </thead>
          <tbody>
            {[1, 3, 5, 10, 15, 20, 30].map(y => {
              const deposited = startAmount + calcDeposit * 12 * y;
              const fv = calcTotal(profile.rate, y);
              const afterInfl = calcTotal(afterInflationRate, y);
              const profit = fv - deposited;
              return (
                <tr key={y}>
                  <td className="calc-year">{y} jaar</td>
                  <td>€{deposited.toLocaleString('nl-NL')}</td>
                  <td className={`calc-fv ${profile.highlight ? 'highlight' : ''}`}>
                    €{Math.round(fv).toLocaleString('nl-NL')}
                    <span className="calc-profit">+€{Math.round(profit).toLocaleString('nl-NL')}</span>
                  </td>
                  <td className="calc-inflation">€{Math.round(afterInfl).toLocaleString('nl-NL')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Uitleg kolommen */}
      <div className="calc-card calc-legend">
        <div className="calc-legend-item">
          <strong>Ingelegd</strong> — het totaal dat je zelf hebt gestort
        </div>
        <div className="calc-legend-item">
          <strong>Verwacht</strong> — je verwachte vermogen op basis van {(profile.rate * 100).toFixed(1)}% rendement per jaar
        </div>
        <div className="calc-legend-item">
          <strong>Na inflatie</strong> — wat je echt kunt kopen, gecorrigeerd voor 3% jaarlijkse inflatie
        </div>
      </div>

      {/* Disclaimer */}
      <p className="calc-disclaimer">
        {profile.highlight
          ? 'Dit rendement (17%) is getest met de FlowInvest AI-strategie op echte marktdata van 2016-2026. Deze periode was uitzonderlijk goed. Het werkelijke rendement kan lager uitvallen.'
          : `Rendement van ${(profile.rate * 100).toFixed(1)}% is gebaseerd op historische data (S&P 500 sinds 1928, bron: NYU Stern).`
        }
        {' '}De toekomst is niet te voorspellen — je kunt ook geld verliezen. Dit is geen financieel advies.
      </p>

      {/* Bottom nav */}
      <div className="bottom-nav">
        <button className="nav-btn" onClick={() => onNavigate('dashboard')}>
          <span className="nav-icon">📊</span>
          <span>Dashboard</span>
        </button>
        <button className="nav-btn active" onClick={() => onNavigate('calculator')}>
          <span className="nav-icon">🔢</span>
          <span>Calculator</span>
        </button>
        <button className="nav-btn" onClick={() => onNavigate('assistant')}>
          <span className="nav-icon">💬</span>
          <span>Assistent</span>
        </button>
        <button className="nav-btn" onClick={() => onNavigate('profile')}>
          <span className="nav-icon">👤</span>
          <span>Profiel</span>
        </button>
      </div>
    </div>
  );
}
