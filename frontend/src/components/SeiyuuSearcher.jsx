import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown } from 'lucide-react';

export default function SeiyuuSearcher({ seiyuus, onSelect }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const itemRefs = useRef([]);

  const filtered = seiyuus.filter(s =>
    s.name?.full?.toLowerCase().includes(query.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll into view for keyboard navigation
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = (s) => {
    onSelect(s.id.toString());
    setQuery(s.name.full);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(p => (p < filtered.length - 1 ? p + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(p => (p > 0 ? p - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filtered.length) {
        handleSelect(filtered[selectedIndex]);
      } else if (filtered.length > 0) {
        handleSelect(filtered[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <Search size={18} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text"
          className="input-field"
          placeholder="Select or Search Seiyuu..."
          style={{ paddingLeft: '40px', paddingRight: '40px' }}
          value={query}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
            onSelect(''); // Clear selection if user is typing
          }}
          onKeyDown={handleKeyDown}
        />
        <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
           <ChevronDown size={18} color="var(--text-dim)" />
        </div>
      </div>

      {isOpen && (
        <div className="glass-panel" style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          right: 0,
          maxHeight: '300px',
          overflowY: 'auto',
          zIndex: 1000,
          padding: '8px 0',
          backgroundColor: 'var(--bg-darker)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))'
        }}>
          {filtered.length > 0 ? (
            filtered.map((s, i) => (
              <div
                key={s.id}
                ref={el => itemRefs.current[i] = el}
                onClick={() => handleSelect(s)}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  background: selectedIndex === i ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
                  transition: 'background 0.1s',
                  color: 'white',
                  borderLeft: selectedIndex === i ? '3px solid var(--primary)' : '3px solid transparent'
                }}
              >
                <div style={{ fontWeight: 600 }}>{s.name?.full}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.characterNames?.join(', ')}
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '8px 16px', color: 'var(--text-dim)', textAlign: 'center' }}>
              No seiyuus match your search
            </div>
          )}
        </div>
      )}
    </div>
  );
}
