import React from 'react';

const AnimeChainItem = React.memo(({ item, index, roomData, isFirst }) => {
  const turnNumber = roomData.chain.length - index;

  return (
    <div className="animate-chain" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      {/* Anime Card */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        padding: '24px',
        width: '100%',
        maxWidth: '700px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-8px', left: '-8px', fontWeight: 900, fontSize: '1.4rem', color: 'var(--primary)', opacity: 0.8 }}>
            #{turnNumber}
          </div>
          <h3 style={{ textAlign: 'center', fontSize: '1.6rem', padding: '0 40px 12px 40px', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', wordBreak: 'break-word' }}>
            {item.anime.title.romaji || item.anime.title.english}
          </h3>
        </div>

        <div style={{ display: 'flex', gap: '20px', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          
          {/* Left Side: Seiyuu Info */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {isFirst || item.revealCast ? (
              <div className="custom-scroll" style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '12px' }}>
                {item.anime.seiyuus?.map(s => {
                  const usageCount = item.seiyuuUsageCountSnapshot?.[s.id] || roomData.seiyuuUsageCount[s.id] || 0;
                  return (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--glass-border)', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        {[1, 2, 3].map(n => (
                          <div key={n} style={{ 
                            width: '12px', height: '12px', borderRadius: '50%', 
                            border: `1px solid ${usageCount >= n ? 'var(--danger)' : 'var(--text-dim)'}`,
                            background: usageCount >= n ? 'var(--danger)' : 'transparent'
                          }} />
                        ))}
                      </div>
                      <span style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', flexShrink: 0 }}>{s.name?.full}</span>
                    </div>
                    <span style={{ fontSize: '1rem', color: 'var(--text-dim)', textAlign: 'right', wordBreak: 'break-word' }}>
                      {s.characterNames ? s.characterNames.join(', ') : s.characterName}
                    </span>
                  </div>
                )})}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--primary)', opacity: 0.7, fontWeight: 600 }}>Connecting Seiyuu</div>
                  {item.linkingSeiyuus ? item.linkingSeiyuus.map(lSeiyuu => {
                    const usageCount = item.seiyuuUsageCountSnapshot?.[lSeiyuu.id] || roomData.seiyuuUsageCount[lSeiyuu.id] || 0;
                    return (
                      <div key={lSeiyuu.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginTop: '2px' }}>
                          {[1, 2, 3].map(n => (
                            <div key={n} style={{ 
                              width: '24px', height: '24px', borderRadius: '50%', 
                              border: `1px solid ${usageCount >= n ? 'var(--danger)' : 'var(--text-dim)'}`,
                              background: usageCount >= n ? 'var(--danger)' : 'transparent'
                            }} />
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '1.4rem', fontWeight: 600, color: 'white' }}>{lSeiyuu.name?.full}</span>
                          <span style={{ fontSize: '1.1rem', color: 'var(--text-dim)' }}>{lSeiyuu.characterNames ? lSeiyuu.characterNames.join(', ') : lSeiyuu.characterName}</span>
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={{ fontSize: '1.2rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>Mystery Start!</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Side: Visual */}
          <div style={{ width: '140px', flexShrink: 0 }}>
            {item.anime.coverImage && (
              <img 
                src={item.anime.coverImage.large} 
                alt={item.anime.title.romaji} 
                style={{ width: '100%', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', border: '1px solid var(--glass-border)' }} 
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default AnimeChainItem;
