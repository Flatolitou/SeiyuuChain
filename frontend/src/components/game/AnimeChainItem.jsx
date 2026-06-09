import React from 'react';
import { X as XIcon } from 'lucide-react';
import { getAnimeWithSeiyuusLocal } from '../../api/localDb';

const AnimeChainItem = React.memo(({ item, index, roomData, isFirst }) => {
  const turnNumber = index + 1;
  const anime = getAnimeWithSeiyuusLocal(item.animeId);

  if (!anime) return <div style={{ color: 'var(--text-dim)' }}>Loading Anime #{turnNumber}...</div>;

  const linkingSeiyuus = item.linkingSeiyuuIds ? item.linkingSeiyuuIds.map(id => {
      return anime.seiyuus.find(s => s.id === id);
  }).filter(Boolean) : [];

  return (
    <div className="animate-chain" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
      {/* Anime Card */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        padding: '24px',
        width: '100%',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-8px', left: '-8px', fontWeight: 900, fontSize: '1.4rem', color: 'var(--primary-light)', opacity: 0.8 }}>
            #{turnNumber}
          </div>
          <h3 style={{ textAlign: 'center', fontSize: '1.6rem', padding: '0 40px 12px 40px', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', wordBreak: 'break-word' }}>
            {anime.title.romaji || anime.title.english}
          </h3>
        </div>

        <div style={{ display: 'flex', gap: '20px', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          
          {/* Left Side: Seiyuu Info */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {isFirst || item.revealCast || roomData.settings?.revealAllCast ? (
              <div className="custom-scroll" style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '12px' }}>
                {anime.seiyuus?.map(s => {
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {linkingSeiyuus.map(lSeiyuu => {
                  const usageCount = item.seiyuuUsageCountSnapshot?.[lSeiyuu.id] || roomData.seiyuuUsageCount[lSeiyuu.id] || 0;
                  return (
                    <div key={lSeiyuu.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      {/* 3 Lives Circles */}
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginTop: '2px' }}>
                        {[1, 2, 3].map(n => (
                          <div key={n} style={{ 
                            width: '24px', height: '24px', borderRadius: '50%', 
                            border: `2px solid ${usageCount >= n ? 'var(--danger)' : 'var(--text-dim)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: usageCount >= n ? 'rgba(239, 68, 68, 0.2)' : 'transparent'
                          }}>
                            {usageCount >= n && <XIcon size={16} color="var(--danger)" />}
                          </div>
                        ))}
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {/* Seiyuu Name */}
                        <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {lSeiyuu.name?.full}
                        </div>

                        {/* Character Name */}
                        <div style={{ fontStyle: 'italic', color: 'var(--primary-light)', fontSize: '1.1rem', wordBreak: 'break-word', lineHeight: '1.4' }}>
                          as {lSeiyuu.characterNames ? lSeiyuu.characterNames.join(', ') : lSeiyuu.characterName}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Side: Anime Cover */}
          <img src={anime.coverImage?.large || anime.coverImage?.medium} alt="" style={{ width: '100px', height: '140px', objectFit: 'cover', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} />
        </div>
      </div>
    </div>
  );
});

export default AnimeChainItem;
