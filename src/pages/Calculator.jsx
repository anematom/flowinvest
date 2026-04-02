import { useState } from 'react';
import '../styles/Calculator.css';

// Historische rendementen (bronnen: S&P 500 1928-2025, NYU Stern, NerdWallet)
const RISK_PROFILES = [
  { label: 'Voorzichtig', rate: 0.066, desc: 'Obligaties + ETFs — historisch gemiddelde (97 jaar)' },
  { label: 'Gebalanceerd', rate: 0.087, desc: '60% aandelen / 40% obligaties — historisch gemiddelde (97 jaar)' },
  { label: 'Ambitieus', rate: 0.10, desc: 'S&P 500 ETF — historisch gemiddelde (97 jaar)' },
  { label: 'Maximaal', rate: 0.125, desc: 'Losse aandelen + momentum — conservatieve schatting' },
  { label: 'FlowInvest AI', rate: 0.17, desc: 'Getest met deze app over 2016-2026 (10 jaar) — ambitieus', highlight: true },
];
const INFLATION = 0.03; // 3% gemiddelde inflatie

function calcFV(pmt, annualRate, years) {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return pmt * n;
  return pmt * ((Math.pow(1 + r, n) - 1) / r);
}

export default function Calculator({ onNavigate }) {
  const [calcDeposit, setCalcDeposit] = useState(200);

  return (
    <div className="calculator-page">
      <div className="calculator-header">
        <h1>Rendementsverwachting</h1>
        <p className="calculator-subtitle">Bereken wat je geld kan doen</p>
      </div>

      <div className="profile-card calc-section">
        <div className="calc-inputs">
          <div>
            <label className="profile-label">Maandelijkse inleg</label>
            <input
              type="number"
              className="portfolio-name-input"
              value={calcDeposit}
              onChange={e => setCalcDeposit(Number(e.target.value))}
              min={0}
              step={50}
            />
          </div>
        </div>

        <div className="calc-scroll">
          <table className="calc-table">
            <thead>
              <tr>
                <th>Jaar</th>
                <th>Niet belegd</th>
                {RISK_PROFILES.map((p, i) => (
                  <th key={i}>{p.label}<br/><span className="calc-rate">{(p.rate * 100).toFixed(1)}%/jr</span></th>
                ))}
                <th>Na inflatie<br/><span className="calc-rate">(beste - 3%)</span></th>
              </tr>
            </thead>
            <tbody>
              {[1, 3, 5, 10, 15, 20, 30].map(y => {
                const deposited = calcDeposit * 12 * y;
                const bestRate = RISK_PROFILES[RISK_PROFILES.length - 1].rate;
                const afterInflation = calcFV(calcDeposit, bestRate - INFLATION, y);
                return (
                  <tr key={y}>
                    <td className="calc-year">{y}</td>
                    <td>€{deposited.toLocaleString('nl-NL')}</td>
                    {RISK_PROFILES.map((p, i) => {
                      const fv = calcFV(calcDeposit, p.rate, y);
                      return <td key={i} className={`calc-fv${p.highlight ? ' highlight' : ''}`}>€{Math.round(fv).toLocaleString('nl-NL')}</td>;
                    })}
                    <td className="calc-inflation">€{Math.round(afterInflation).toLocaleString('nl-NL')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="calc-legend">
          {RISK_PROFILES.map((p, i) => (
            <div key={i} className="calc-legend-item">
              <strong>{p.label}</strong> ({(p.rate * 100).toFixed(1)}%) — {p.desc}
            </div>
          ))}
          <div className="calc-legend-item">
            <strong>Na inflatie</strong> — wat je echt kunt kopen met het geld (gecorrigeerd voor 3% jaarlijkse inflatie)
          </div>
        </div>

        <p className="calc-disclaimer">
          Rendementen zijn gebaseerd op historische data (S&P 500 sinds 1928, bron: NYU Stern). Gemiddeld rendement over 97 jaar. Het Maximaal profiel (12.5%) is gebaseerd op een conservatieve schatting. In onze eigen backtest behaalde de FlowInvest AI-strategie 17% per jaar over de afgelopen 10 jaar (2016-2026), maar deze periode was uitzonderlijk goed door de tech- en AI-boom. We rekenen bewust met een lager percentage. De toekomst is niet te voorspellen — je kunt ook geld verliezen. Dit is geen financieel advies.
        </p>
      </div>

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
