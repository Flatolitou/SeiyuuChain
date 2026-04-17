import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, MessageSquare } from 'lucide-react';

export default function ChatBox({ roomData, socket, playerId }) {
  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [roomData.messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit('send_message', { roomId: roomData.id, text: text.trim() });
    setText('');
  };

  const spectators = roomData.spectators || [];
  const messages = roomData.messages || [];

  return (
    <div className="glass-panel" style={{ 
      width: '320px', 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      borderLeft: '1px solid var(--glass-border)',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: '0 16px 16px 0'
    }}>
      {/* Tab Header for Spectators Count */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
          <MessageSquare size={18} />
          <span style={{ fontWeight: 600 }}>Chat</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
          <Users size={16} />
          <span>{spectators.length} Spectators</span>
        </div>
      </div>

      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ 
            fontSize: '0.9rem', 
            lineHeight: '1.4',
            padding: msg.type === 'system' ? '4px 8px' : '0',
            background: msg.type === 'system' ? 'rgba(255,255,255,0.05)' : 'transparent',
            borderRadius: '4px',
            textAlign: msg.type === 'system' ? 'center' : 'left',
            color: msg.type === 'system' ? 'var(--text-dim)' : 'white'
          }}>
            {msg.type === 'system' ? (
              <span style={{ fontStyle: 'italic', fontSize: '0.85rem' }}>{msg.text}</span>
            ) : (
              <>
                <strong style={{ color: 'var(--primary)', marginRight: '6px' }}>{msg.sender} :</strong>
                <span>{msg.text}</span>
              </>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSendMessage} style={{ padding: '16px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '8px' }}>
        <input 
          type="text" 
          placeholder="New message..." 
          className="input-field" 
          style={{ flex: 1, fontSize: '0.9rem', padding: '8px 12px' }}
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary" style={{ padding: '8px' }}>
          <Send size={18} />
        </button>
      </form>

      {/* Spectator List Peek */}
      {spectators.length > 0 && (
        <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Spectating Now</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {spectators.map(s => (
              <div key={s.id} className="badge" style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(255,255,255,0.1)' }}>
                {s.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
