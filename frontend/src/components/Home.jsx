import React, { useState } from 'react';
import { Gamepad2, Users, ChevronRight } from 'lucide-react';

export default function Home({ onSetNickname }) {
  const [nickname, setNickname] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (nickname.trim() === '') return;
    onSetNickname(nickname);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        padding: '40px',
        width: '100%',
        maxWidth: '480px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        textAlign: 'center'
      }}>
        <div>
          <Gamepad2 size={48} color="var(--primary)" style={{ marginBottom: '16px' }} />
          <h1 className="title-gradient" style={{ fontSize: '2.5rem', marginBottom: '8px' }}>Seiyuu Chain</h1>
          <p style={{ color: 'var(--text-dim)' }}>Connect anime through their voice actors.</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
          <div style={{ position: 'relative' }}>
            <Users size={20} color="var(--text-dim)" style={{ position: 'absolute', left: '16px', top: '14px' }} />
            <input
              type="text"
              placeholder="Enter your nickname..."
              className="input-field"
              style={{ paddingLeft: '48px', fontSize: '1.1rem' }}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              autoFocus
            />
          </div>

          <button type="submit" className="btn" style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: '8px',
            marginTop: '8px',
            fontSize: '1.1rem'
          }}>
            Continue <ChevronRight size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
