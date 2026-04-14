import React, { useState, useEffect, useRef } from 'react';
import { searchAnimeDropdown, getAnimeWithSeiyuus } from '../api/anilist';
import { Search, Loader2 } from 'lucide-react';

export default function SearchAnime({ onSelect, disabled }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const timerRef = useRef(null);
  const itemRefs = useRef([]);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex]);
  
  useEffect(() => {
    if (query.trim() === '') {
      setResults([]);
      setDropdownOpen(false);
      setSelectedIndex(-1);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    
    // Debounce 250ms
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const res = await searchAnimeDropdown(query);
      setResults(res || []);
      setDropdownOpen(true);
      setSelectedIndex(-1);
      setLoading(false);
    }, 250);
    
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const handleSelect = async (anime) => {
    setDropdownOpen(false);
    setQuery('');
    setLoading(true);
    // Fetch full seiyuu cast
    const fullAnime = await getAnimeWithSeiyuus(anime.id);
    setLoading(false);
    
    if (fullAnime) {
      onSelect(fullAnime);
    }
  };

  const handleKeyDown = (e) => {
    if (!dropdownOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', zIndex: 100 }}>
      <div style={{ position: 'relative' }}>
        <Search size={20} color="var(--text-dim)" style={{ position: 'absolute', left: '16px', top: '14px' }} />
        <input
          type="text"
          placeholder="Search Anime..."
          className="input-field"
          style={{ paddingLeft: '48px', paddingRight: '48px' }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setDropdownOpen(true); }}
          disabled={disabled} // don't disable on loading to prevent losing focus
        />
        {loading && (
          <Loader2 size={20} color="var(--primary)" className="animate-spin" style={{ position: 'absolute', right: '16px', top: '14px', animation: 'spin 1s linear infinite' }} />
        )}
      </div>

      {dropdownOpen && results.length > 0 && (
        <div className="glass-panel" style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '8px',
          maxHeight: '450px',
          overflowY: 'auto',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 0',
          boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
          backgroundColor: 'var(--bg-darker)', /* Ensure it is fully opaque over the chain */
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))'
        }}>
          {results.map((r, i) => (
            <div 
              key={r.id} 
              ref={el => itemRefs.current[i] = el}
              onClick={() => handleSelect(r)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 12px',
                cursor: 'pointer',
                gap: '12px',
                transition: 'background 0.1s',
                background: selectedIndex === i ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <img src={r.coverImage?.medium} alt={r.title?.romaji} style={{ width: '36px', height: '50px', objectFit: 'cover', borderRadius: '4px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title?.romaji}</div>
                {r.title?.english && r.title.english !== r.title.romaji && (
                   <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title?.english}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
