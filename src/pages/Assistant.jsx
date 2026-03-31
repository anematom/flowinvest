import { useState, useRef, useEffect } from 'react';
import { getAIResponse, suggestedQuestions } from '../data/aiResponses';
import '../styles/Assistant.css';

export default function Assistant({ onNavigate }) {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: 'Hoi! 👋 Ik ben je FlowInvest assistent. Stel me gerust een vraag over je beleggingen. Ik ben er om je te helpen.',
    },
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function sendMessage(text) {
    const userMsg = text || input.trim();
    if (!userMsg) return;

    const newMessages = [...messages, { role: 'user', text: userMsg }];
    setMessages(newMessages);
    setInput('');

    // Simulate typing delay
    setTimeout(() => {
      const aiResponse = getAIResponse(userMsg);
      setMessages(prev => [...prev, { role: 'ai', text: aiResponse }]);
    }, 600);
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
            <span className="assistant-status">Altijd beschikbaar</span>
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
        <div ref={messagesEndRef} />

        {/* Suggested questions */}
        {messages.length <= 2 && (
          <div className="suggestions">
            <p className="suggestions-label">Veelgestelde vragen:</p>
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
          />
          <button
            className="send-btn"
            onClick={() => sendMessage()}
            disabled={!input.trim()}
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
        <button className="nav-btn active" onClick={() => onNavigate('assistant')}>
          <span className="nav-icon">💬</span>
          <span>Assistent</span>
        </button>
      </div>
    </div>
  );
}
