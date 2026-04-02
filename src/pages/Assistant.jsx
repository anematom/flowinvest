import { useState, useRef, useEffect } from 'react';
import '../styles/Assistant.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://flowinvest.onrender.com/api';

const suggestedQuestions = [
  'Waarom daalt mijn portfolio?',
  'Wat is een ETF?',
  'Moet ik nu bijkopen?',
  'Hoe werkt compound interest?',
  'Wat is het verschil tussen aandelen en obligaties?',
];

export default function Assistant({ onNavigate, settings }) {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: 'Hoi! Ik ben je FlowInvest assistent. Stel me gerust een vraag over beleggen of je portfolio. Ik ben er om je te helpen.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text) {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;

    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      // Stuur portfolio context mee als beschikbaar
      let portfolioContext = '';
      if (settings) {
        portfolioContext = `Inleg: €${settings.amount}, Risicoprofiel: ${settings.risk}, Doel: ${settings.goal}, Horizon: ${settings.horizon}`;
      }

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, portfolioContext }),
      });

      if (!res.ok) throw new Error('AI niet beschikbaar');

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.response }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: 'Sorry, ik kan even niet antwoorden. Probeer het later opnieuw.',
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="assistant">
      {/* Header */}
      <div className="assistant-header">
        <div className="assistant-header-left">
          <span className="assistant-avatar">🤖</span>
          <div>
            <h2>FlowInvest Assistent</h2>
            <span className="assistant-status">Powered by AI</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.role === 'ai' && <span className="msg-avatar">🤖</span>}
            <div className="msg-bubble">
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="message ai">
            <span className="msg-avatar">🤖</span>
            <div className="msg-bubble typing">Aan het denken...</div>
          </div>
        )}
        <div ref={messagesEndRef} />

        {/* Suggested questions */}
        {messages.length <= 2 && (
          <div className="suggestions">
            <p className="suggestions-label">Stel een vraag:</p>
            {suggestedQuestions.map((q, i) => (
              <button key={i} className="suggestion-btn" onClick={() => sendMessage(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="input-container">
        <div className="input-wrapper">
          <input
            type="text"
            placeholder="Stel een vraag..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            ↑
          </button>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="bottom-nav">
        <button className="nav-btn" onClick={() => onNavigate('dashboard')}>
          <span className="nav-icon">📊</span>
          <span>Dashboard</span>
        </button>
        <button className="nav-btn" onClick={() => onNavigate('calculator')}>
          <span className="nav-icon">🔢</span>
          <span>Calculator</span>
        </button>
        <button className="nav-btn active" onClick={() => onNavigate('assistant')}>
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
